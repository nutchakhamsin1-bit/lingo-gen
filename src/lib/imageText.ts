import type { LangCode, TextRegion } from '../types'

/**
 * วางคำแปลแทนข้อความเดิม — ใช้ร่วมกันระหว่างรูปภาพ (canvas), SVG (เวกเตอร์) และ PDF
 * จัดขนาดตัวอักษรให้พอดีกรอบ ตัดบรรทัดตามคำของแต่ละภาษา และไม่ให้เครื่องหมายวรรคตอนขึ้นต้นบรรทัด
 */

export const FONT_STACK =
  "'DM Sans', 'Noto Sans Thai', 'Hiragino Sans', 'Yu Gothic', 'Microsoft YaHei', 'Malgun Gothic', system-ui, sans-serif"
export const LINE_HEIGHT = 1.22
const MIN_FONT = 6

export const fontCss = (size: number) => `700 ${size}px ${FONT_STACK}`

/** วัดความกว้างข้อความที่ขนาดตัวอักษรหนึ่ง ๆ (หน่วยเดียวกับกรอบ) */
export type Measure = (text: string, size: number) => number

export const canvasMeasure =
  (ctx: CanvasRenderingContext2D): Measure =>
  (text, size) => {
    ctx.font = fontCss(size)
    return ctx.measureText(text).width
  }

/* ---------- เปิดไฟล์ภาพ ---------- */

export function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('เบราว์เซอร์นี้เปิดไฟล์ภาพนี้ไม่ได้'))
    }
    img.src = url
  })
}

const isTiff = (file: File) => /\.tiff?$/i.test(file.name) || file.type === 'image/tiff'

/** ภาพ → canvas ขนาดจริง (คงความโปร่งใส) — TIFF ถอดรหัสเองเพราะเบราว์เซอร์ส่วนใหญ่เปิดไม่ได้ */
export async function decodeImage(file: File): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('เบราว์เซอร์นี้ไม่รองรับการแก้ไขภาพ')
  if (isTiff(file)) {
    const { default: UTIF } = await import('utif')
    const buffer = await file.arrayBuffer()
    const [ifd] = UTIF.decode(buffer)
    if (!ifd) throw new Error('ไฟล์ TIFF นี้ไม่มีภาพ หรือเสียหาย')
    UTIF.decodeImage(buffer, ifd)
    canvas.width = ifd.width
    canvas.height = ifd.height
    ctx.putImageData(new ImageData(new Uint8ClampedArray(UTIF.toRGBA8(ifd)), ifd.width, ifd.height), 0, 0)
    return canvas
  }
  let img: HTMLImageElement
  try {
    img = await loadImage(file)
  } catch {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    throw new Error(`เบราว์เซอร์นี้เปิดไฟล์ .${ext} ไม่ได้ — แปลงเป็น PNG หรือ JPG แล้วลองอีกครั้ง`)
  }
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  if (!canvas.width || !canvas.height) throw new Error('ไฟล์ภาพนี้ไม่มีขนาด (SVG ต้องกำหนด width/height หรือ viewBox)')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

/* ---------- สี ---------- */

export interface Rgb {
  r: number
  g: number
  b: number
}

const median = (arr: number[]) => arr.sort((p, q) => p - q)[arr.length >> 1] ?? 255
export const luminance = ({ r, g, b }: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b

/** สีพื้นของกรอบ = ค่ากลาง (median) ของพิกเซลรอบขอบกรอบ — ทนต่อเส้นตัวอักษรที่แตะขอบ */
export function sampleBackground(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): Rgb {
  try {
    const { data } = ctx.getImageData(x, y, w, h)
    const r: number[] = []
    const g: number[] = []
    const b: number[] = []
    const push = (px: number, py: number) => {
      const i = (py * w + px) * 4
      r.push(data[i])
      g.push(data[i + 1])
      b.push(data[i + 2])
    }
    for (let px = 0; px < w; px++) {
      push(px, 0)
      push(px, h - 1)
    }
    for (let py = 1; py < h - 1; py++) {
      push(0, py)
      push(w - 1, py)
    }
    return { r: median(r), g: median(g), b: median(b) }
  } catch {
    return { r: 255, g: 255, b: 255 }
  }
}

/**
 * สีตัวอักษรเดิม = ค่ากลางของพิกเซลที่ต่างจากพื้นมากที่สุด 1 ใน 3 (เนื้อตัวอักษร ไม่ใช่ขอบที่ฟุ้ง)
 * — ตัวอักษรเล็กมีขอบฟุ้งเยอะ ถ้าใช้ทุกพิกเซลสีจะจางกว่าจริง · ไม่มีก็เลือกดำ/ขาวตามความสว่างพื้น
 */
export function sampleTextColor(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, bg: Rgb): Rgb {
  const fallback = luminance(bg) > 140 ? { r: 17, g: 17, b: 17 } : { r: 255, g: 255, b: 255 }
  try {
    const { data } = ctx.getImageData(x, y, w, h)
    const ink: { d: number; i: number }[] = []
    for (let i = 0; i < data.length; i += 4) {
      const d = Math.abs(data[i] - bg.r) + Math.abs(data[i + 1] - bg.g) + Math.abs(data[i + 2] - bg.b)
      if (d > 160) ink.push({ d, i })
    }
    if (ink.length <= 8) return fallback
    const core = ink.sort((p, q) => q.d - p.d).slice(0, Math.max(8, Math.ceil(ink.length / 3)))
    return {
      r: median(core.map((p) => data[p.i])),
      g: median(core.map((p) => data[p.i + 1])),
      b: median(core.map((p) => data[p.i + 2])),
    }
  } catch {
    return fallback
  }
}

/* ---------- จัดบรรทัด ---------- */

/** แบ่งข้อความตามคำ (ภาษาไทย/ญี่ปุ่น/จีนไม่มีช่องว่างระหว่างคำ) หรือตามตัวอักษรที่มองเห็น (ไม่แยกสระ/วรรณยุกต์) */
function segment(text: string, lang: LangCode, granularity: 'word' | 'grapheme'): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return Array.from(new Intl.Segmenter(lang, { granularity }).segment(text), (s) => s.segment)
  }
  return granularity === 'word' ? text.split(/(?<=\s)/) : Array.from(text)
}

const OPENING = /^[\p{Ps}\p{Pi}¡¿]+$/u
/** อักขระที่ห้ามขึ้นต้นบรรทัด: เครื่องหมายปิด/จบประโยค และคานะตัวเล็กของญี่ปุ่น (っ ゃ ー …) */
const CLOSING = /^[\p{Pe}\p{Pf}\p{Po}ー〜ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ]/u

/** ห้ามขึ้นบรรทัดด้วยเครื่องหมายปิด (！。、?) และห้ามจบบรรทัดด้วยเครื่องหมายเปิด (「 ¡ ¿) */
function keepPunctuation(segments: string[]): string[] {
  const out: string[] = []
  let carry = ''
  for (const seg of segments) {
    if (OPENING.test(seg)) {
      carry += seg
      continue
    }
    if (CLOSING.test(seg) && !OPENING.test(seg) && out.length) {
      // รวมช่องว่างก่อนเครื่องหมาย (เช่น "Hé !" ในภาษาฝรั่งเศส) ไว้กับคำก่อนหน้าด้วย
      let spaces = ''
      while (out.length > 1 && !out[out.length - 1].trim()) spaces = out.pop() + spaces
      out[out.length - 1] += spaces + carry + seg
      carry = ''
      continue
    }
    out.push(carry + seg)
    carry = ''
  }
  if (carry) out.push(carry)
  return out
}

function wrapLines(segments: string[], maxWidth: number, size: number, lang: LangCode, measure: Measure): string[] {
  const lines: string[] = []
  let line = ''
  for (const seg of segments) {
    if (seg === '\n') {
      lines.push(line.trim())
      line = ''
      continue
    }
    const next = line + seg
    if (!line || measure(next, size) <= maxWidth) {
      line = next
      continue
    }
    lines.push(line.trim())
    line = seg.trimStart()
  }
  if (line.trim()) lines.push(line.trim())
  // คำเดียวที่ยาวเกินกรอบ → ตัดทีละตัวอักษร
  return lines.flatMap((l) => {
    if (measure(l, size) <= maxWidth) return [l]
    const out: string[] = []
    let cur = ''
    for (const ch of segment(l, lang, 'grapheme')) {
      if (cur && measure(cur + ch, size) > maxWidth) {
        out.push(cur)
        cur = ch
      } else cur += ch
    }
    if (cur) out.push(cur)
    return out
  })
}

/** หาขนาดตัวอักษรใหญ่ที่สุดที่ยังวางข้อความได้ครบในกรอบ (binary search) */
export function layoutText(
  text: string,
  lang: LangCode,
  maxWidth: number,
  maxHeight: number,
  maxSize: number,
  measure: Measure,
): { size: number; lines: string[] } {
  // ขึ้นบรรทัดที่ผู้แปลตั้งใจใส่ (เช่น คำบรรยายสองบรรทัด) คงไว้
  const segments = text.split('\n').flatMap((part, i) => [...(i ? ['\n'] : []), ...keepPunctuation(segment(part, lang, 'word'))])
  let lo = MIN_FONT * 4
  let hi = Math.max(lo, Math.floor(Math.min(maxSize, maxHeight) * 4))
  let best = { size: MIN_FONT, lines: wrapLines(segments, maxWidth, MIN_FONT, lang, measure) }
  // ค้นทีละ 0.25 หน่วย (PDF ใช้หน่วย point ที่ละเอียดกว่าพิกเซล)
  while (lo <= hi) {
    const quarter = (lo + hi) >> 1
    const size = quarter / 4
    const lines = wrapLines(segments, maxWidth, size, lang, measure)
    if (lines.length * size * LINE_HEIGHT <= maxHeight && lines.every((l) => measure(l, size) <= maxWidth)) {
      best = { size, lines }
      lo = quarter + 1
    } else hi = quarter - 1
  }
  return best
}

/* ---------- วางคำแปลบนภาพ ---------- */

export interface PlacedRegion {
  x: number
  y: number
  w: number
  h: number
  radius: number
  background: Rgb
  color: Rgb
  size: number
  lines: string[]
}

/** คำนวณตำแหน่ง สีพื้น สีตัวอักษร และบรรทัดของคำแปลแต่ละกรอบ (หน่วยพิกเซลของภาพ) */
export function placeRegions(canvas: HTMLCanvasElement, regions: TextRegion[], lang: LangCode): PlacedRegion[] {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  const W = canvas.width
  const H = canvas.height
  const measure = canvasMeasure(ctx)
  // ขนาดตัวอักษรสูงสุดสัมพันธ์กับความกว้างภาพ ให้ทุกช่องคำพูดดูเป็นชุดเดียวกัน
  const maxFont = Math.max(12, Math.round(W * 0.04))
  return regions.flatMap((region) => {
    const x = Math.max(0, Math.round(region.box.x * W))
    const y = Math.max(0, Math.round(region.box.y * H))
    const w = Math.min(W - x, Math.round(region.box.width * W))
    const h = Math.min(H - y, Math.round(region.box.height * H))
    if (w < 4 || h < 4) return []
    const background = sampleBackground(ctx, x, y, w, h)
    const pad = Math.max(2, Math.round(Math.min(w, h) * 0.06))
    const { size, lines } = layoutText(region.translatedText, lang, w - pad * 2, h - pad * 2, maxFont, measure)
    const color = luminance(background) > 140 ? { r: 17, g: 17, b: 17 } : { r: 255, g: 255, b: 255 }
    return [{ x, y, w, h, radius: Math.min(w, h) * 0.12, background, color, size, lines }]
  })
}

const rgbCss = ({ r, g, b }: Rgb) => `rgb(${r}, ${g}, ${b})`

/** วาดคำแปลลงบน canvas เดิม — ลบข้อความเดิมด้วยสีพื้นรอบกรอบ ภาพส่วนอื่นไม่ถูกแตะ */
export function drawRegions(canvas: HTMLCanvasElement, placed: PlacedRegion[]) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  for (const p of placed) {
    ctx.fillStyle = rgbCss(p.background)
    ctx.beginPath()
    ctx.roundRect(p.x, p.y, p.w, p.h, p.radius)
    ctx.fill()
    ctx.fillStyle = rgbCss(p.color)
    ctx.font = fontCss(p.size)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const lineH = p.size * LINE_HEIGHT
    const top = p.y + p.h / 2 - (p.lines.length * lineH) / 2 + lineH / 2
    p.lines.forEach((l, i) => ctx.fillText(l, p.x + p.w / 2, top + i * lineH))
  }
}

/** ภาพตัวอย่างสำหรับหน้าเปรียบเทียบ (PNG) — แสดงได้ทุกนามสกุล รวมถึง TIFF ที่เบราว์เซอร์เปิดเองไม่ได้ */
export async function renderTranslatedImage(file: File, regions: TextRegion[], lang: LangCode): Promise<Blob> {
  const canvas = await decodeImage(file)
  await document.fonts?.ready
  drawRegions(canvas, placeRegions(canvas, regions, lang))
  return canvasToBlob(canvas, 'image/png')
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('บันทึกภาพไม่สำเร็จ'))), type, quality),
  )
}
