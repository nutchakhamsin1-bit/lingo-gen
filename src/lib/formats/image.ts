import { ocrNote, recognizeImageText } from '../../services/ocr'
import type { FileExt, LangCode, TextRegion } from '../../types'
import {
  canvasToBlob,
  decodeImage,
  drawRegions,
  FONT_STACK,
  LINE_HEIGHT,
  placeRegions,
  type PlacedRegion,
} from '../imageText'
import { parseXml, serializeXml } from './markup'
import { OUTPUT_MIME } from './mime'
import { plainSegment, toPlainText } from './segments'
import type { FormatHandler } from './types'

/**
 * รูปภาพ: OCR หาข้อความ → แปล → วางคำแปลแทนที่เดิม (ภาพประกอบไม่ถูกแตะ)
 * บันทึกเป็นนามสกุลเดิมทุกครั้ง — SVG วางคำแปลเป็นเวกเตอร์ (ข้อความจริง ซูมได้ไม่แตก)
 */

/* ---------- เข้ารหัสภาพตามนามสกุล ---------- */

function pixels(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('เบราว์เซอร์นี้ไม่รองรับการบันทึกภาพ')
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/** BMP 24 บิต (เบราว์เซอร์ไม่มีตัวบันทึก BMP ในตัว) */
function encodeBmp(canvas: HTMLCanvasElement): Blob {
  const { width: w, height: h, data } = pixels(canvas)
  const row = Math.ceil((w * 3) / 4) * 4
  const size = 54 + row * h
  const v = new DataView(new ArrayBuffer(size))
  v.setUint16(0, 0x4d42, true) // "BM"
  v.setUint32(2, size, true)
  v.setUint32(10, 54, true)
  v.setUint32(14, 40, true)
  v.setInt32(18, w, true)
  v.setInt32(22, h, true)
  v.setUint16(26, 1, true)
  v.setUint16(28, 24, true)
  v.setUint32(34, row * h, true)
  v.setInt32(38, 2835, true)
  v.setInt32(42, 2835, true)
  for (let y = 0; y < h; y++) {
    const src = (h - 1 - y) * w * 4 // BMP เก็บแถวจากล่างขึ้นบน
    for (let x = 0; x < w; x++) {
      const at = 54 + y * row + x * 3
      v.setUint8(at, data[src + x * 4 + 2])
      v.setUint8(at + 1, data[src + x * 4 + 1])
      v.setUint8(at + 2, data[src + x * 4])
    }
  }
  return new Blob([v.buffer], { type: OUTPUT_MIME.bmp })
}

/** GIF (เฟรมแรก) — ลดเหลือ 256 สี และคงพื้นโปร่งใส */
async function encodeGif(canvas: HTMLCanvasElement): Promise<Blob> {
  const mod = await import('gifenc')
  // บาง bundler โหลดเวอร์ชัน CommonJS ที่มีแต่ default — รองรับทั้งสองแบบ
  const { GIFEncoder, quantize, applyPalette } = 'quantize' in mod ? mod : (mod as unknown as { default: typeof mod }).default
  const { width, height, data } = pixels(canvas)
  const palette = quantize(data, 256, { format: 'rgba4444', oneBitAlpha: true })
  const index = applyPalette(data, palette, 'rgba4444')
  const transparentIndex = palette.findIndex((c) => c[3] === 0)
  const gif = GIFEncoder()
  gif.writeFrame(index, width, height, { palette, transparent: transparentIndex >= 0, transparentIndex })
  gif.finish()
  return new Blob([gif.bytes() as Uint8Array<ArrayBuffer>], { type: OUTPUT_MIME.gif })
}

async function encodeTiff(canvas: HTMLCanvasElement): Promise<Blob> {
  const { default: UTIF } = await import('utif')
  const { width, height, data } = pixels(canvas)
  return new Blob([UTIF.encodeImage(data.buffer, width, height)], { type: OUTPUT_MIME.tiff })
}

async function encodeRaster(canvas: HTMLCanvasElement, ext: FileExt): Promise<Blob> {
  if (ext === 'bmp') return encodeBmp(canvas)
  if (ext === 'gif') return encodeGif(canvas)
  if (ext === 'tif' || ext === 'tiff') return encodeTiff(canvas)
  const type = OUTPUT_MIME[ext]
  const blob = await canvasToBlob(canvas, type, 0.92)
  // บางเบราว์เซอร์บันทึก WebP ไม่ได้ และแอบคืนเป็น PNG — ไม่ส่งไฟล์ที่นามสกุลไม่ตรงกับเนื้อไฟล์
  if (blob.type !== type) throw new Error(`เบราว์เซอร์นี้บันทึกไฟล์ .${ext} ไม่ได้ — ลองใช้ Chrome หรือ Edge`)
  return blob
}

/* ---------- SVG: คำแปลเป็นเวกเตอร์ ---------- */

const SVG_NS = 'http://www.w3.org/2000/svg'

async function svgWithTranslation(file: File, canvas: HTMLCanvasElement, placed: PlacedRegion[], lang: LangCode): Promise<Blob> {
  const source = await file.text()
  const doc = parseXml(source)
  const svg = doc.documentElement
  // พิกัดภาพที่วาด (พิกเซล) → พิกัดของ SVG (viewBox)
  const vb = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number)
  const [vx, vy, vw, vh] = vb.length === 4 && vb.every(Number.isFinite) ? vb : [0, 0, canvas.width, canvas.height]
  const sx = vw / canvas.width
  const sy = vh / canvas.height
  const rgb = ({ r, g, b }: { r: number; g: number; b: number }) => `rgb(${r},${g},${b})`

  const layer = doc.createElementNS(SVG_NS, 'g')
  layer.setAttribute('id', 'lingo-translation')
  layer.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:lang', lang)
  for (const p of placed) {
    const rect = doc.createElementNS(SVG_NS, 'rect')
    rect.setAttribute('x', String(vx + p.x * sx))
    rect.setAttribute('y', String(vy + p.y * sy))
    rect.setAttribute('width', String(p.w * sx))
    rect.setAttribute('height', String(p.h * sy))
    rect.setAttribute('rx', String(p.radius * sx))
    rect.setAttribute('fill', rgb(p.background))
    layer.appendChild(rect)

    const text = doc.createElementNS(SVG_NS, 'text')
    text.setAttribute('font-family', FONT_STACK)
    text.setAttribute('font-weight', '700')
    text.setAttribute('font-size', String(p.size * sy))
    text.setAttribute('fill', rgb(p.color))
    text.setAttribute('text-anchor', 'middle')
    text.setAttribute('dominant-baseline', 'central')
    const lineH = p.size * LINE_HEIGHT
    const top = p.y + p.h / 2 - (p.lines.length * lineH) / 2 + lineH / 2
    p.lines.forEach((line, i) => {
      const span = doc.createElementNS(SVG_NS, 'tspan')
      span.setAttribute('x', String(vx + (p.x + p.w / 2) * sx))
      span.setAttribute('y', String(vy + (top + i * lineH) * sy))
      span.textContent = line
      text.appendChild(span)
    })
    layer.appendChild(text)
  }
  svg.appendChild(layer)
  return new Blob([serializeXml(doc, source)], { type: OUTPUT_MIME.svg })
}

/* ---------- ตัวจัดการ ---------- */

export const image: FormatHandler = {
  async open(file, { ext, sourceLang, targetLang, signal, onProgress, presetRegions }) {
    const canvas = await decodeImage(file)
    let regions: TextRegion[]
    let note: string
    if (presetRegions) {
      regions = presetRegions
      note = 'ตำแหน่งข้อความที่เตรียมไว้ของภาพตัวอย่าง'
    } else {
      const ocr = await recognizeImageText(canvas, sourceLang, { signal, onProgress })
      regions = ocr.regions
      note = ocrNote(regions.length, ocr.lang, sourceLang === 'auto')
    }
    return {
      segments: regions.map((r) => plainSegment(r.sourceText)),
      regions,
      note,
      build: async (tr) => {
        const translated = regions.map((r, i) => ({ ...r, translatedText: toPlainText(tr[i] ?? plainSegment(r.sourceText)) }))
        await document.fonts?.ready
        const placed = placeRegions(canvas, translated, targetLang)
        if (ext === 'svg') return svgWithTranslation(file, canvas, placed, targetLang)
        const out = document.createElement('canvas')
        out.width = canvas.width
        out.height = canvas.height
        out.getContext('2d')?.drawImage(canvas, 0, 0)
        drawRegions(out, placed)
        return encodeRaster(out, ext)
      },
    }
  },
}
