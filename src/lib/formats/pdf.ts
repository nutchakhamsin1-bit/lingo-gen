import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import { recognizeImageText } from '../../services/ocr'
import type { Font, Glyph, TypeFeatures } from '@pdf-lib/fontkit'
import type { PDFDocument, PDFFont, PDFName, PDFPage } from 'pdf-lib'
import type { LangCode } from '../../types'
import { layoutText, LINE_HEIGHT, sampleBackground, sampleTextColor, type Rgb } from '../imageText'
import { subsetFont } from './fontSubset'
import { repairThaiToUnicode } from './pdfToUnicode'
import { OUTPUT_MIME } from './mime'
import { hasWords, plainSegment, toPlainText } from './segments'
import type { FormatHandler } from './types'

/**
 * PDF: อ่านข้อความพร้อมตำแหน่ง (pdf.js) → รวมเป็นย่อหน้า → แปล → ปิดข้อความเดิมด้วยสีพื้น
 * แล้ววางคำแปลในกรอบเดิมด้วยสีตัวอักษรเดิม (pdf-lib) — รูป ตาราง เส้น และหน้ากระดาษคงเดิม
 * หน้าที่เป็นภาพสแกน (ไม่มีข้อความจริง) ใช้ OCR หาข้อความแทน
 */

/* ---------- ฟอนต์ ---------- */

/** ฟอนต์ที่ฝังลงไฟล์ (Sarabun = ไทย + อักษรละตินทั้งหมด) — โหลดจาก CDN ครั้งแรกแล้วแคช */
type FontKey = 'latin' | 'ja' | 'zh' | 'ko'
const FONT_PACKAGES: Record<FontKey, [string, string]> = {
  latin: ['sarabun@0.4.1', 'Sarabun'],
  ja: ['noto-sans-jp@0.4.4', 'NotoSansJP'],
  zh: ['noto-sans-sc@0.4.4', 'NotoSansSC'],
  ko: ['noto-sans-kr@0.4.4', 'NotoSansKR'],
}
const fontUrl = (key: FontKey, bold: boolean) => {
  const [pkg, file] = FONT_PACKAGES[key]
  const weight = bold ? '700Bold' : '400Regular'
  return `https://cdn.jsdelivr.net/npm/@expo-google-fonts/${pkg}/${weight}/${file}_${weight}.ttf`
}
/**
 * ปิดการสลับรูปตัวอักษรอัตโนมัติของ fontkit กับฟอนต์ CJK — มันเลือกรูปตัวเลข/ลิเกเจอร์ที่ทำให้ตัวอักษรหายหรือเว้นห่าง
 * (Sarabun ต้องเปิดไว้: สระ/วรรณยุกต์ไทยอาศัยการสลับรูปเพื่อวางตำแหน่งให้ถูก)
 */
const NO_SUBSTITUTION = { rvrn: false, locl: false, ccmp: false, calt: false, liga: false, clig: false, frac: false, numr: false, dnom: false }

const primaryFont = (lang: LangCode): FontKey => (lang === 'ja' || lang === 'zh' || lang === 'ko' ? lang : 'latin')

/** ตัวอักษรที่ฟอนต์หลักไม่มี ใช้ฟอนต์ของระบบอักษรนั้นแทน (เช่น ชื่อภาษาไทยในเอกสารที่แปลเป็นญี่ปุ่น) */
function fallbackFont(cp: number, primary: FontKey): FontKey {
  if ((cp >= 0x1100 && cp <= 0x11ff) || (cp >= 0x3130 && cp <= 0x318f) || (cp >= 0xac00 && cp <= 0xd7af)) return 'ko'
  if ((cp >= 0x3000 && cp <= 0x30ff) || (cp >= 0x3400 && cp <= 0x9fff) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xff00 && cp <= 0xffef)) {
    return primary === 'zh' ? 'zh' : 'ja'
  }
  return 'latin'
}

const fontCache = new Map<string, Promise<ArrayBuffer>>()

function loadFont(key: FontKey, bold: boolean): Promise<ArrayBuffer> {
  const url = fontUrl(key, bold)
  let pending = fontCache.get(url)
  if (!pending) {
    pending = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.arrayBuffer()
    })
    pending.catch(() => fontCache.delete(url))
    fontCache.set(url, pending)
  }
  return pending.catch(() => {
    throw new Error('โหลดฟอนต์สำหรับภาษาปลายทางไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง')
  })
}

interface EmbeddedFont {
  pdf: PDFFont
  /** fontkit ของไฟล์ฟอนต์เดียวกับที่ฝัง — glyph id ตรงกัน */
  face: Font
  features?: TypeFeatures
  /** ความกว้างของข้อความที่วัดแล้ว (หน่วยฟอนต์) */
  widths: Map<string, number>
  /** glyph id ที่อยู่ในตาราง /W และ ToUnicode ของ pdf-lib แล้ว */
  registered: Set<number>
}

interface TextRun {
  text: string
  font: EmbeddedFont
}

const runWidth = (run: TextRun, size: number) => {
  let units = run.font.widths.get(run.text)
  if (units === undefined) {
    units = run.font.face.layout(run.text, run.font.features).positions.reduce((w, p) => w + p.xAdvance, 0)
    run.font.widths.set(run.text, units)
  }
  return (units * size) / run.font.face.unitsPerEm
}

/**
 * เลือกฟอนต์ให้ทุกตัวอักษรในคำแปล → ตัดแต่ละฟอนต์ให้เหลือเฉพาะตัวที่ใช้ (HarfBuzz) → ฝังลงเอกสาร
 * คืนฟังก์ชันแบ่งข้อความเป็นช่วงตามฟอนต์ สำหรับวัดความกว้างและวาด
 */
async function embedFonts(doc: PDFDocument, texts: string[], lang: LangCode, bold: boolean): Promise<(text: string) => TextRun[]> {
  const { default: fontkit } = await import('@pdf-lib/fontkit')
  doc.registerFontkit(fontkit)
  const primary = primaryFont(lang)
  const faces = new Map<FontKey, { bytes: ArrayBuffer; face: Font }>()
  const face = async (key: FontKey) => {
    if (!faces.has(key)) {
      const bytes = await loadFont(key, bold)
      faces.set(key, { bytes, face: fontkit.create(new Uint8Array(bytes)) })
    }
    return faces.get(key)!.face
  }

  const assigned = new Map<number, FontKey>()
  for (const ch of new Set(texts.join(''))) {
    const cp = ch.codePointAt(0)!
    if (/\s|\p{M}/u.test(ch)) continue // ช่องว่างและสระ/วรรณยุกต์ใช้ฟอนต์เดียวกับตัวอักษรข้างหน้า
    if ((await face(primary)).hasGlyphForCodePoint(cp)) assigned.set(cp, primary)
    else {
      const alt = fallbackFont(cp, primary)
      assigned.set(cp, alt !== primary && (await face(alt)).hasGlyphForCodePoint(cp) ? alt : primary)
    }
  }
  // สระ/วรรณยุกต์/ช่องว่างต้องมีในทุกฟอนต์ที่อาจตามหลังมัน
  const extras = [...new Set(texts.join(''))].filter((ch) => /\s|\p{M}/u.test(ch)).map((ch) => ch.codePointAt(0)!)

  const fonts = new Map<FontKey, EmbeddedFont>()
  for (const key of new Set([primary, ...assigned.values()])) {
    const used = [...assigned].filter(([, k]) => k === key).map(([cp]) => cp)
    if (!faces.has(key)) await face(key)
    const subset = await subsetFont(faces.get(key)!.bytes, [0x20, ...used, ...extras])
    const features = key === 'latin' ? undefined : NO_SUBSTITUTION
    fonts.set(key, {
      pdf: await doc.embedFont(subset, { subset: false, features }),
      face: fontkit.create(subset),
      features,
      widths: new Map(),
      registered: new Set(),
    })
  }

  const main = fonts.get(primary)!
  return (text) => {
    const runs: TextRun[] = []
    for (const ch of text) {
      const last = runs[runs.length - 1]
      const key = assigned.get(ch.codePointAt(0)!)
      const font = key ? fonts.get(key)! : (last?.font ?? main)
      if (last && last.font === font) last.text += ch
      else runs.push({ text: ch, font })
    }
    return runs
  }
}

type PdfLib = typeof import('pdf-lib')
const fontKeys = new WeakMap<PDFPage, Map<EmbeddedFont, PDFName>>()

/** รายการ glyph ภายใน pdf-lib ที่ใช้สร้างตารางความกว้าง (/W) และตารางแปลงกลับเป็นตัวอักษร (ToUnicode) */
type GlyphCache = { font: Font; glyphCache: { access(): Glyph[] } }

/**
 * pdf-lib ใส่ในตารางเฉพาะ glyph ที่มีรหัสอักษรตรง ๆ ในฟอนต์ — glyph ที่ fontkit สลับรูปมา (เช่น วรรณยุกต์ .narrow)
 * จึงไม่มีในตาราง โปรแกรมอ่าน PDF เดาเป็นตัวอื่น (คัดลอกแล้วได้ "ทั*งหมด") — เติมพร้อมรหัสอักษรเดิมให้ครบ
 */
function registerGlyph(font: EmbeddedFont, glyph: Glyph) {
  if (font.registered.has(glyph.id)) return
  const embedder = (font.pdf as unknown as { embedder?: GlyphCache }).embedder
  const cache = embedder?.glyphCache.access()
  if (!embedder || !cache) return
  if (!font.registered.size) cache.forEach((g) => font.registered.add(g.id))
  if (font.registered.has(glyph.id)) return
  const own = embedder.font.getGlyph(glyph.id)
  if (!own.codePoints.length) own.codePoints = glyph.codePoints
  cache.push(own)
  cache.sort((a, b) => a.id - b.id)
  font.registered.add(glyph.id)
}

/**
 * วาดข้อความทีละ glyph ตามตำแหน่งที่ fontkit คำนวณ (รวมการเลื่อนสระ/วรรณยุกต์)
 * — drawText ของ pdf-lib ทิ้งตำแหน่งเหล่านี้ วรรณยุกต์ไทยจึงหายหรือลอยผิดที่
 */
function drawRuns(lib: PdfLib, page: PDFPage, runs: TextRun[], x: number, y: number, size: number, color: Rgb) {
  const keys = fontKeys.get(page) ?? new Map<EmbeddedFont, PDFName>()
  fontKeys.set(page, keys)
  const ops = [lib.pushGraphicsState(), lib.beginText(), lib.setFillingRgbColor(color.r / 255, color.g / 255, color.b / 255)]
  let pen = x
  for (const run of runs) {
    let key = keys.get(run.font)
    if (!key) {
      key = page.node.newFontDictionary(run.font.pdf.name, run.font.pdf.ref)
      keys.set(run.font, key)
    }
    ops.push(lib.setFontAndSize(key, size))
    const scale = size / run.font.face.unitsPerEm
    const shaped = run.font.face.layout(run.text, run.font.features)
    shaped.glyphs.forEach((glyph, i) => {
      const pos = shaped.positions[i]
      ops.push(
        lib.setTextMatrix(1, 0, 0, 1, pen + pos.xOffset * scale, y + pos.yOffset * scale),
        lib.showText(lib.PDFHexString.of(glyph.id.toString(16).padStart(4, '0'))),
      )
      pen += pos.xAdvance * scale
      registerGlyph(run.font, glyph)
    })
  }
  ops.push(lib.endText(), lib.popGraphicsState())
  page.pushOperators(...ops)
}

/* ---------- อ่านข้อความเป็นย่อหน้า ---------- */

interface Line {
  x0: number
  x1: number
  /** baseline (พิกัด PDF: แกน y ชี้ขึ้น) */
  y: number
  size: number
  text: string
  /** จำนวนตัวอักษรที่เป็นตัวหนา / ทั้งหมด — ใช้ตัดสินว่าทั้งบรรทัดเป็นตัวหนาหรือไม่ */
  boldChars: number
  chars: number
}

interface Block {
  page: number
  /** กรอบในพิกัด PDF: y0 = ล่าง, y1 = บน */
  x0: number
  y0: number
  x1: number
  y1: number
  size: number
  text: string
  align: Align
  bold: boolean
  background: Rgb
  color: Rgb
  /** พื้นที่ว่าง (สีเดียวกับพื้น) รอบกรอบ หน่วย point — คำแปลที่ยาวกว่าต้นฉบับขยายออกได้โดยไม่ทับสิ่งอื่น */
  free: { left: number; right: number; down: number }
}

type Align = 'left' | 'center' | 'right'

const RENDER_SCALE = 2

/** จำนวนแถวพิกเซลเหนือ/ใต้กรอบที่ยังมีหมึกของตัวอักษรติดต่อกัน (หยุดที่แถวว่าง หรือเส้นยาวอย่างเส้นตาราง) */
function inkExtent(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  rect: { x: number; y: number; w: number; h: number },
  bg: Rgb,
  maxUp: number,
  maxDown: number,
) {
  const inkInRow = (py: number) => {
    let n = 0
    for (let px = rect.x; px < Math.min(W, rect.x + rect.w); px++) {
      const i = (py * W + px) * 4
      if (Math.abs(data[i] - bg.r) + Math.abs(data[i + 1] - bg.g) + Math.abs(data[i + 2] - bg.b) > 60) n++
    }
    return n
  }
  const scan = (from: number, step: number, max: number) => {
    let rows = 0
    for (let k = 1; k <= max; k++) {
      const py = from + step * k
      if (py < 0 || py >= H) break
      const n = inkInRow(py)
      if (!n || n > rect.w * 0.7) break
      rows = k
    }
    return rows
  }
  const inkInColumn = (px: number) => {
    let n = 0
    for (let py = Math.max(0, rect.y); py < Math.min(H, rect.y + rect.h); py++) {
      const i = (py * W + px) * 4
      if (Math.abs(data[i] - bg.r) + Math.abs(data[i + 1] - bg.g) + Math.abs(data[i + 2] - bg.b) > 60) n++
    }
    return n
  }
  const scanX = (from: number, step: number, max: number) => {
    let cols = 0
    for (let k = 1; k <= max; k++) {
      const px = from + step * k
      if (px < 0 || px >= W) break
      const n = inkInColumn(px)
      if (!n || n > rect.h * 0.7) break
      cols = k
    }
    return cols
  }
  const sideways = Math.round(maxDown)
  return {
    up: scan(rect.y, -1, Math.round(maxUp)),
    down: scan(rect.y + rect.h - 1, 1, Math.round(maxDown)),
    left: scanX(rect.x, -1, sideways),
    right: scanX(rect.x + rect.w - 1, 1, sideways),
  }
}

/**
 * ไล่ดูหน้าที่วาดแล้วว่าทางซ้าย/ขวา/ล่างของกรอบเป็นสีพื้นล้วนไปได้ไกลแค่ไหน
 * หยุดเมื่อเจอข้อความอื่น รูป หรือเส้น — จึงขยายคำแปลได้เฉพาะในที่ว่างจริง
 */
function freeSpace(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  rect: { x: number; y: number; w: number; h: number },
  bg: Rgb,
  limits: { left: number; right: number; down: number },
  gap: number,
) {
  const isBg = (px: number, py: number) => {
    const i = (py * W + px) * 4
    return Math.abs(data[i] - bg.r) + Math.abs(data[i + 1] - bg.g) + Math.abs(data[i + 2] - bg.b) < 48
  }
  const columnFree = (px: number) => {
    for (let py = rect.y; py < rect.y + rect.h; py += 2) if (!isBg(px, py)) return false
    return true
  }
  let right = 0
  for (let px = rect.x + rect.w + 1; px < Math.min(W, limits.right) && columnFree(px); px++) right++
  let left = 0
  for (let px = rect.x - 2; px > Math.max(0, limits.left) && columnFree(px); px--) left++
  const rowFree = (py: number) => {
    for (let px = rect.x; px < Math.min(W, rect.x + rect.w + right); px += 2) if (!isBg(px, py)) return false
    return true
  }
  let down = 0
  for (let py = rect.y + rect.h + 1; py < Math.min(H, rect.y + rect.h + limits.down) && rowFree(py); py++) down++
  return {
    left: Math.max(0, left - gap) / RENDER_SCALE,
    right: Math.max(0, right - gap) / RENDER_SCALE,
    down: Math.max(0, down - gap) / RENDER_SCALE,
  }
}

const NO_SPACE = /[฀-๿぀-ヿ㐀-鿿가-힯]/

/** ต่อบรรทัด: ภาษาที่ไม่เว้นวรรคต่อกันตรง ๆ, คำที่ตัดด้วยยัติภังค์ท้ายบรรทัดต่อกลับเป็นคำเดียว */
function joinLines(a: string, b: string): string {
  if (/[a-z]-$/.test(a) && /^[a-z]/.test(b)) return a.slice(0, -1) + b
  if (NO_SPACE.test(a.slice(-1)) && NO_SPACE.test(b[0] ?? '')) return a + b
  return `${a} ${b}`
}

/** ตัดรหัสควบคุมที่ glyph ไม่มีรหัสอักษร (U+0000) และรวม "ํ + า" ที่บางโปรแกรมแยกไว้กลับเป็น "ำ" */
const cleanText = (text: string) =>
  text
    // oxlint-disable-next-line no-control-regex -- ตั้งใจลบรหัสควบคุมที่หลุดมาจาก glyph ที่ไม่มีรหัสอักษร
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/g, '')
    .replace(/\u0E4D\u0E32/g, '\u0E33')
    .replace(/\s+/g, ' ')
    .trim()

function toLines(items: TextItem[], isBold: (fontName: string) => boolean): Line[] {
  const parts = items
    .map((it) => {
      const [a, b, c, d, e, f] = it.transform as number[]
      const size = Math.hypot(c, d) || Math.hypot(a, b)
      return {
        text: it.str,
        x: e,
        y: f,
        w: it.width,
        size,
        bold: isBold(it.fontName),
        rotated: Math.abs(b) > size * 0.01 || Math.abs(c) > size * 0.01,
      }
    })
    // เก็บช่องว่างไว้ด้วย: หลายโปรแกรมเขียนช่องว่างระหว่างคำเป็นชิ้นแยก (ทิ้งแล้วคำไทยกับอังกฤษจะติดกัน)
    .filter((p) => p.text && p.size > 0 && !p.rotated) // ข้อความเอียง/แนวตั้งคงเดิม
    .sort((p, q) => q.y - p.y || p.x - q.x)

  const lines: Line[] = []
  for (const p of parts) {
    const line = lines.find(
      (l) => Math.abs(l.y - p.y) < Math.max(l.size, p.size) * 0.35 && p.x >= l.x0 - p.size * 0.5 && p.x - l.x1 < p.size * 1.5,
    )
    if (line) {
      const gap = p.x - line.x1
      line.text += (gap > p.size * 0.15 && !/\s$/.test(line.text) && !/^\s/.test(p.text) ? ' ' : '') + p.text
      if (p.text.trim()) line.x1 = Math.max(line.x1, p.x + p.w)
      line.size = Math.max(line.size, p.size)
      line.chars += p.text.trim().length
      if (p.bold) line.boldChars += p.text.trim().length
    } else if (p.text.trim()) {
      const n = p.text.trim().length
      lines.push({ x0: p.x, x1: p.x + p.w, y: p.y, size: p.size, text: p.text, chars: n, boldChars: p.bold ? n : 0 })
    }
  }
  return lines.map((l) => ({ ...l, text: cleanText(l.text) })).filter((l) => l.text)
}

/** สัดส่วนความกว้างของคำแรกในบรรทัด (ใช้ตัดสินว่าบรรทัดก่อนหน้าเต็มแล้วจริงหรือไม่) */
function firstWordWidth(line: Line): number {
  const words = typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(line.text)].map((w) => w.segment)
    : line.text.split(/(?<=\s)/)
  const first = words.find((w) => w.trim()) ?? ''
  return ((line.x1 - line.x0) * first.length) / Math.max(1, line.text.length)
}

/**
 * รวมบรรทัดเป็นย่อหน้า: ระยะห่างพอดี ขนาดตัวอักษรเท่ากัน ซ้อนกันในแนวนอน
 * และบรรทัดก่อนหน้า "เต็ม" จริง (คำแรกของบรรทัดถัดไปวางต่อท้ายไม่ได้แล้ว) — ถ้ายังมีที่ว่าง
 * แปลว่าต้นฉบับตั้งใจขึ้นบรรทัดใหม่ (หัวกระดาษ รายการ ที่อยู่) จึงแยกเป็นคนละส่วน
 */
function toBlocks(lines: Line[], page: number, pageWidth: number): Omit<Block, 'background' | 'color' | 'free'>[] {
  if (!lines.length) return []
  const left = Math.min(...lines.map((l) => l.x0))
  const right = Math.max(...lines.map((l) => l.x1))
  const aligned = (l: Line, edge: 'x0' | 'x1') => lines.some((o) => o !== l && Math.abs(o[edge] - l[edge]) < l.size * 0.5)
  /** ชิดขวา: อยู่ครึ่งขวาของหน้า ขอบขวาตรงกับขอบหน้า/บรรทัดอื่น (เช่น คอลัมน์ตัวเลข) แต่ขอบซ้ายไม่ตรงกับใคร */
  const isRightAligned = (l: Line) =>
    l.x0 - left > (right - left) * 0.4 &&
    (Math.abs(l.x1 - right) < l.size * 0.5 || (aligned(l, 'x1') && !aligned(l, 'x0')))

  type Open = { lines: Line[]; x0: number; x1: number; size: number }
  const open: Open[] = []
  for (const line of [...lines].sort((a, b) => b.y - a.y)) {
    const block = [...open].reverse().find((b) => {
      const last = b.lines[b.lines.length - 1]
      if (
        !(last.y > line.y && last.y - line.y <= b.size * 1.75 && Math.abs(line.size - b.size) <= b.size * 0.2) ||
        !(line.x0 < b.x1 && line.x1 > b.x0)
      ) {
        return false
      }
      // ขอบขวาตรงกันแต่ขอบซ้ายต่างกัน = ข้อมูลชิดขวาทีละบรรทัด (เลขที่ วันที่) ไม่ใช่ย่อหน้าที่ตัดบรรทัด
      if (Math.abs(last.x1 - line.x1) < b.size * 0.5 && Math.abs(last.x0 - line.x0) > b.size) return false
      const lastCenter = (last.x0 + last.x1) / 2
      const centered = Math.abs(lastCenter - (line.x0 + line.x1) / 2) < b.size && Math.abs(last.x0 - line.x0) > b.size
      const room = centered ? right - left - (last.x1 - last.x0) : right - last.x1
      return room < firstWordWidth(line) + last.size * 0.6
    })
    if (block) {
      block.lines.push(line)
      block.x0 = Math.min(block.x0, line.x0)
      block.x1 = Math.max(block.x1, line.x1)
    } else open.push({ lines: [line], x0: line.x0, x1: line.x1, size: line.size })
  }
  return open
    .map((b) => {
      const top = b.lines[0]
      const bottom = b.lines[b.lines.length - 1]
      const near = (values: number[]) => values.every((v) => Math.abs(v - values[0]) < b.size * 0.5)
      const centers = b.lines.map((l) => (l.x0 + l.x1) / 2)
      let align: Align = 'left'
      if (b.lines.length > 1) {
        if (!near(b.lines.map((l) => l.x0)) && near(b.lines.map((l) => l.x1))) align = 'right'
        else if (!near(b.lines.map((l) => l.x0)) && near(centers)) align = 'center'
      } else if (isRightAligned(top)) align = 'right'
      else if (
        (Math.abs(centers[0] - pageWidth / 2) < pageWidth * 0.03 && b.x1 - b.x0 < pageWidth * 0.8) ||
        // กึ่งกลางคอลัมน์ (ช่องลงชื่อ หัวคอลัมน์): จุดกึ่งกลางตรงกับบรรทัดที่อยู่ใกล้กัน แต่ขอบซ้ายไม่ตรง
        lines.some(
          (o) =>
            o !== top &&
            Math.abs(o.y - top.y) < top.size * 3.5 &&
            Math.abs((o.x0 + o.x1) / 2 - centers[0]) < top.size * 0.5 &&
            Math.abs(o.x0 - top.x0) > top.size,
        )
      ) {
        align = 'center'
      }
      const chars = b.lines.reduce((n, l) => n + l.chars, 0)
      const boldChars = b.lines.reduce((n, l) => n + l.boldChars, 0)
      return {
        page,
        x0: b.x0,
        x1: b.x1,
        // เผื่อสระบน/วรรณยุกต์และสระล่างของภาษาไทยที่สูง/ต่ำกว่าตัวอักษรละติน
        y1: top.y + top.size * 1.05,
        y0: bottom.y - bottom.size * 0.35,
        size: b.size,
        text: b.lines.map((l) => l.text).reduce(joinLines),
        align,
        bold: boldChars > chars / 2,
      }
    })
    .filter((b) => hasWords(b.text))
}

/* ---------- ตัวจัดการ ---------- */

export const pdf: FormatHandler = {
  async open(file, { sourceLang, targetLang, signal, onProgress }) {
    // ซ่อมรหัสสระ/วรรณยุกต์ไทยที่หายในไฟล์จาก Chrome ก่อนอ่าน (ใช้ไฟล์ที่ซ่อมแล้วเป็นฐานของไฟล์ผลลัพธ์ด้วย)
    const bytes = await repairThaiToUnicode(new Uint8Array(await file.arrayBuffer()))
    const pdfjs = await import('pdfjs-dist')
    const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
    const task = pdfjs.getDocument({ data: bytes.slice() })
    let doc: Awaited<typeof task.promise>
    try {
      doc = await task.promise
    } catch (err) {
      if (err instanceof Error && err.name === 'PasswordException') {
        throw new Error('ไฟล์ PDF นี้ถูกตั้งรหัสผ่าน — ปลดรหัสผ่านแล้วลองอีกครั้ง')
      }
      throw new Error('เปิดไฟล์ PDF ไม่ได้ — ไฟล์อาจเสียหาย')
    }

    const blocks: Block[] = []
    let scanned = 0
    for (let n = 1; n <= doc.numPages; n++) {
      if (signal.aborted) throw new DOMException('ยกเลิกแล้ว', 'AbortError')
      const page = await doc.getPage(n)
      // วาดหน้าไว้เทียบสีพื้น/สีตัวอักษร (และใช้ OCR ถ้าเป็นภาพสแกน)
      const viewport = page.getViewport({ scale: RENDER_SCALE })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      await page.render({ canvas, viewport }).promise
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      const pageWidth = page.getViewport({ scale: 1 }).width

      const content = await page.getTextContent()
      const items = content.items.filter((it): it is TextItem => 'str' in it)
      const isBold = (fontName: string) => {
        try {
          const font = page.commonObjs.has(fontName) ? (page.commonObjs.get(fontName) as { bold?: boolean; black?: boolean }) : null
          return !!(font?.bold || font?.black)
        } catch {
          return false
        }
      }
      let found = toBlocks(toLines(items, isBold), n - 1, pageWidth)
      if (!found.length && !items.some((it) => hasWords(it.str))) {
        // หน้าสแกน: อ่านด้วย OCR แล้วแปลงกรอบจากพิกเซลกลับเป็นพิกัด PDF
        const ocr = await recognizeImageText(canvas, sourceLang, { signal })
        if (ocr.regions.length) scanned++
        found = ocr.regions.map((r) => {
          const [ax, ay] = viewport.convertToPdfPoint(r.box.x * canvas.width, r.box.y * canvas.height) as number[]
          const [bx, by] = viewport.convertToPdfPoint(
            (r.box.x + r.box.width) * canvas.width,
            (r.box.y + r.box.height) * canvas.height,
          ) as number[]
          const height = Math.abs(ay - by)
          return {
            page: n - 1,
            x0: Math.min(ax, bx),
            x1: Math.max(ax, bx),
            y0: Math.min(ay, by),
            y1: Math.max(ay, by),
            size: Math.min(height * 0.8, 18),
            text: r.sourceText,
            align: 'left' as const,
            bold: false,
          }
        })
      }
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      const rects = found.map((b) => {
        const [ax, ay] = viewport.convertToViewportPoint(b.x0, b.y1) as number[]
        const [bx, by] = viewport.convertToViewportPoint(b.x1, b.y0) as number[]
        const x = Math.max(0, Math.floor(Math.min(ax, bx)))
        const y = Math.max(0, Math.floor(Math.min(ay, by)))
        return {
          x,
          y,
          w: Math.max(2, Math.min(canvas.width - x, Math.ceil(Math.abs(bx - ax)))),
          h: Math.max(2, Math.min(canvas.height - y, Math.ceil(Math.abs(by - ay)))),
        }
      })
      // ขอบซ้ายของข้อความในหน้า ≈ ระยะขอบกระดาษ (ใช้เป็นระยะขอบขวาด้วย)
      const margin = Math.min(...rects.map((r) => r.x), canvas.width * 0.1)
      found.forEach((b, k) => {
        const background = sampleBackground(ctx, rects[k].x, rects[k].y, rects[k].w, rects[k].h)
        const linePx = b.size * RENDER_SCALE
        if (viewport.rotation === 0) {
          // วรรณยุกต์ซ้อนสระบน/สระล่างของต้นฉบับอาจสูง/ต่ำกว่ากรอบ — ขยายกรอบปิดตามหมึกจริงที่ติดกันอยู่
          const ink = inkExtent(pixels, canvas.width, canvas.height, rects[k], background, linePx * 0.35, linePx * 0.25)
          rects[k] = {
            x: rects[k].x - ink.left,
            y: rects[k].y - ink.up,
            w: rects[k].w + ink.left + ink.right,
            h: rects[k].h + ink.up + ink.down,
          }
          b = {
            ...b,
            x0: b.x0 - ink.left / RENDER_SCALE,
            x1: b.x1 + ink.right / RENDER_SCALE,
            y1: b.y1 + ink.up / RENDER_SCALE,
            y0: b.y0 - ink.down / RENDER_SCALE,
          }
        }
        const { x, y, w, h } = rects[k]
        const free =
          viewport.rotation === 0
            ? freeSpace(pixels, canvas.width, canvas.height, rects[k], background, {
                left: margin,
                right: canvas.width - margin,
                down: linePx * LINE_HEIGHT * 3,
              }, linePx * 0.5)
            : { left: 0, right: 0, down: 0 }
        blocks.push({ ...b, background, color: sampleTextColor(ctx, x, y, w, h, background), free })
      })
      page.cleanup()
      onProgress?.(n / doc.numPages)
    }
    const pageCount = doc.numPages
    void task.destroy()

    return {
      segments: blocks.map((b) => plainSegment(b.text)),
      note: `${pageCount} หน้า · ${blocks.length} ย่อหน้า${scanned ? ` · อ่านด้วย OCR ${scanned} หน้า (เอกสารสแกน)` : ''}`,
      build: async (tr) => buildPdf(bytes, blocks, tr, targetLang),
    }
  },
}

async function buildPdf(bytes: Uint8Array, blocks: Block[], tr: string[], lang: LangCode): Promise<Blob> {
  const lib = await import('pdf-lib')
  const { PDFDocument, rgb } = lib
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const texts = blocks.map((b, i) => toPlainText(tr[i] ?? plainSegment(b.text)))
  const regular = await embedFonts(doc, texts.filter((_, i) => !blocks[i].bold), lang, false)
  const bold = blocks.some((b) => b.bold) ? await embedFonts(doc, texts.filter((_, i) => blocks[i].bold), lang, true) : regular
  const pages = doc.getPages()
  const color = ({ r, g, b }: Rgb) => rgb(r / 255, g / 255, b / 255)

  // ปิดข้อความเดิมทั้งหมดก่อน (ขยายเล็กน้อยกันขอบตัวอักษรโผล่) แล้วค่อยวางคำแปล — กรอบปิดจะได้ไม่ทับคำแปลของบรรทัดข้าง ๆ
  for (const b of blocks) {
    pages[b.page]?.drawRectangle({ x: b.x0 - 1, y: b.y0 - 1, width: b.x1 - b.x0 + 2, height: b.y1 - b.y0 + 2, color: color(b.background) })
  }
  blocks.forEach((b, i) => {
    const page = pages[b.page]
    if (!page) return
    const runsOf = b.bold ? bold : regular
    const measure = (text: string, size: number) => runsOf(text).reduce((w, r) => w + runWidth(r, size), 0)
    // คำแปลมักยาวกว่าต้นฉบับ: ใช้พื้นที่ว่างตามทิศการจัดวางก่อนจะยอมลดขนาดตัวอักษร
    const side = Math.min(b.free.left, b.free.right)
    const grow = b.align === 'center' ? side * 2 : b.align === 'right' ? b.free.left : b.free.right
    const x0 = b.align === 'center' ? b.x0 - side : b.align === 'right' ? b.x0 - b.free.left : b.x0
    const width = b.x1 - b.x0 + grow
    const height = b.y1 - b.y0 + b.free.down
    const { size, lines } = layoutText(texts[i], lang, width, height, b.size, measure)
    lines.forEach((line, k) => {
      // แต่ละช่วงวาดด้วยฟอนต์ที่มีตัวอักษรนั้นจริง (เช่น ญี่ปุ่น + ชื่อภาษาไทย ในบรรทัดเดียวกัน)
      const lineWidth = measure(line, size)
      const x = b.align === 'center' ? x0 + (width - lineWidth) / 2 : b.align === 'right' ? x0 + width - lineWidth : x0
      drawRuns(lib, page, runsOf(line), x, b.y1 - size * 1.05 - k * size * LINE_HEIGHT, size, b.color)
    })
  })
  const out = await doc.save()
  return new Blob([out as Uint8Array<ArrayBuffer>], { type: OUTPUT_MIME.pdf })
}
