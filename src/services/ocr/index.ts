import type { Block, Worker } from 'tesseract.js'
import { LANGUAGE_MAP } from '../../lib/constants'
import type { LangCode, SourceLang, TextRegion } from '../../types'

/**
 * OCR บนเครื่องของผู้ใช้ด้วย Tesseract.js (WebAssembly)
 * ภาพไม่ถูกส่งออกไปภายนอก — ครั้งแรกจะดาวน์โหลดตัว OCR และโมเดลภาษาจาก CDN แล้วเก็บแคชในเบราว์เซอร์
 *
 * ขั้นตอน: 1) หาช่องคำพูดจากภาพ แล้วอ่านทีละช่อง (Tesseract มักมองข้ามช่องคำพูดที่ติดกับภาพวาด)
 *          2) อ่านทั้งภาพอีกรอบเพื่อเก็บข้อความนอกช่องคำพูด (คำบรรยาย ป้าย) แล้วจัดกลุ่มคำที่อยู่ใกล้กัน
 */

/** โมเดลภาษาของ Tesseract ต่อภาษาต้นฉบับ — ญี่ปุ่น/จีนรวมโมเดลตัวอักษรแนวตั้งสำหรับมังงะ */
const OCR_LANGS: Record<LangCode, string[]> = {
  th: ['tha', 'eng'],
  en: ['eng'],
  ja: ['jpn', 'jpn_vert'],
  zh: ['chi_sim', 'chi_sim_vert'],
  fr: ['fra'],
  ko: ['kor'],
  de: ['deu'],
  es: ['spa'],
}

/** ตรวจจับอัตโนมัติ → อ่านเป็นภาษาอังกฤษ (โหลดทุกภาษาพร้อมกันช้าและแม่นน้อยลง) */
export const OCR_AUTO_LANG: LangCode = 'en'

/** ภาษาที่มังงะมักเขียนแนวตั้ง — ขนาดตัวอักษร = ด้านที่แคบกว่าของกรอบคำ และอ่านขวาไปซ้าย */
const VERTICAL_LANGS: ReadonlySet<LangCode> = new Set<LangCode>(['ja', 'zh'])
/** ภาษาอักษรละติน — OCR มักอ่าน "I" ตัวใหญ่ในตัวอักษรการ์ตูนเป็น "|" */
const LATIN_LANGS: ReadonlySet<LangCode> = new Set<LangCode>(['en', 'fr', 'de', 'es'])

const MAX_PARALLEL = 2
/** ภาพถูกขยายให้ตัวอักษรใหญ่พอก่อนอ่าน — บอกความละเอียดไว้เลย Tesseract จะไม่ต้องเดา (และไม่พิมพ์ "Estimating resolution" ลงคอนโซล) */
const OCR_DPI = '300'
const MIN_WORD_CONFIDENCE = 40
const MIN_REGION_CONFIDENCE = 55
const MIN_BUBBLE_CONFIDENCE = 65

export interface OcrOptions {
  signal: AbortSignal
  /** 0–1 */
  onProgress?: (ratio: number) => void
}

export interface OcrOutcome {
  /** ข้อความที่พบ (ยังไม่มีคำแปล — translatedText เป็นค่าว่าง) */
  regions: TextRegion[]
  lang: LangCode
}

interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

interface OcrWord extends Rect {
  text: string
  confidence: number
  /** ลำดับในผลลัพธ์ของ Tesseract (ลำดับการอ่าน) */
  order: number
  /** ขนาดตัวอักษรโดยประมาณ (px) */
  size: number
}

const abortError = () => new DOMException('การอ่านข้อความในภาพถูกยกเลิก', 'AbortError')

/* ---------- จำกัดจำนวน OCR ที่ทำพร้อมกัน (แต่ละงานใช้ WebAssembly หลายสิบ MB) ---------- */

let running = 0
const waiting: (() => void)[] = []

function acquire(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError())
  if (running < MAX_PARALLEL) {
    running++
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const start = () => {
      signal.removeEventListener('abort', onAbort)
      running++
      resolve()
    }
    const onAbort = () => {
      waiting.splice(waiting.indexOf(start), 1)
      reject(abortError())
    }
    waiting.push(start)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function release() {
  running--
  waiting.shift()?.()
}

/* ---------- เตรียมภาพ ---------- */

/** สำเนาภาพที่ขยายภาพเล็กให้ตัวอักษรใหญ่พอสำหรับ OCR (กรอบที่ได้เป็นสัดส่วน จึงไม่กระทบตำแหน่ง) */
function toCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const w = source.width
  const h = source.height
  const long = Math.max(w, h)
  const scale = long < 1400 ? Math.min(2.5, 2000 / long) : Math.min(1, 3200 / long)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('เบราว์เซอร์นี้ไม่รองรับการอ่านข้อความในภาพ')
  ctx.fillStyle = '#ffffff' // พื้นโปร่งใส (PNG/SVG) → พื้นขาว ให้ OCR แยกตัวอักษรได้
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

/* ---------- หาช่องคำพูด ---------- */

interface Bubble extends Rect {
  area: number
  /** หน้ากากพื้นที่ด้านในช่อง (ที่สเกลตรวจจับ) — 1 = พื้นช่องหรือตัวอักษรในช่อง, 0 = เส้นขอบ/ภายนอก */
  inside: Uint8Array
  mx: number
  my: number
  mw: number
  mh: number
  scale: number
}

/**
 * ช่องคำพูด = พื้นที่สีอ่อนที่ถูกเส้นล้อมไว้ (ไม่แตะขอบภาพ) ขนาด 0.2–12% ของภาพ ทรงค่อนข้างทึบ (วงรี/สี่เหลี่ยม)
 * และมีเส้นตัวอักษรเข้ม 1–50% อยู่ด้านใน — คืนเรียงจากเล็กไปใหญ่ในพิกัดของ canvas
 */
function findBubbles(canvas: HTMLCanvasElement): Bubble[] {
  const scale = Math.min(1, 900 / Math.max(canvas.width, canvas.height))
  const W = Math.max(1, Math.round(canvas.width * scale))
  const H = Math.max(1, Math.round(canvas.height * scale))
  const small = document.createElement('canvas')
  small.width = W
  small.height = H
  const ctx = small.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  ctx.drawImage(canvas, 0, 0, W, H)
  const { data } = ctx.getImageData(0, 0, W, H)
  const N = W * H
  const light = new Uint8Array(N)
  for (let i = 0; i < N; i++) {
    light[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2] > 200 ? 1 : 0
  }

  // แยกพื้นที่สีอ่อนที่ต่อกันเป็นชิ้น ๆ (flood fill แบบ 4 ทิศ)
  const comp = new Int32Array(N).fill(-1)
  const stack = new Int32Array(N)
  const found: Bubble[] = []
  for (let id = 0; id < N; id++) {
    if (!light[id] || comp[id] !== -1) continue
    let top = 0
    const visit = (q: number) => {
      if (light[q] && comp[q] === -1) {
        comp[q] = id
        stack[top++] = q
      }
    }
    let area = 0
    let minX = W
    let minY = H
    let maxX = 0
    let maxY = 0
    let touchesEdge = false
    visit(id)
    while (top) {
      const p = stack[--top]
      const x = p % W
      const y = (p - x) / W
      area++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) touchesEdge = true
      if (x > 0) visit(p - 1)
      if (x < W - 1) visit(p + 1)
      if (y > 0) visit(p - W)
      if (y < H - 1) visit(p + W)
    }
    const bw = maxX - minX + 1
    const bh = maxY - minY + 1
    if (touchesEdge || area < N * 0.002 || area > N * 0.12 || bw < 16 || bh < 12) continue
    if (area / (bw * bh) < 0.45) continue

    // ด้านในช่อง = อยู่ระหว่างพื้นช่องทั้งแนวแถวและแนวคอลัมน์ → ได้ตัวอักษร แต่ตัดเส้นขอบช่องออก
    const rowMin = new Int32Array(bh).fill(bw)
    const rowMax = new Int32Array(bh).fill(-1)
    const colMin = new Int32Array(bw).fill(bh)
    const colMax = new Int32Array(bw).fill(-1)
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        if (comp[(minY + y) * W + minX + x] !== id) continue
        if (x < rowMin[y]) rowMin[y] = x
        if (x > rowMax[y]) rowMax[y] = x
        if (y < colMin[x]) colMin[x] = y
        if (y > colMax[x]) colMax[x] = y
      }
    }
    const raw = new Uint8Array(bw * bh)
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        raw[y * bw + x] = x >= rowMin[y] && x <= rowMax[y] && y >= colMin[x] && y <= colMax[x] ? 1 : 0
      }
    }
    // หดขอบ 1 พิกเซล กันเศษเส้นขอบที่ขยายภาพกลับมาแล้วติดมา
    const inside = new Uint8Array(bw * bh)
    let dark = 0
    let total = 0
    for (let y = 1; y < bh - 1; y++) {
      for (let x = 1; x < bw - 1; x++) {
        const i = y * bw + x
        if (!(raw[i] && raw[i - 1] && raw[i + 1] && raw[i - bw] && raw[i + bw])) continue
        inside[i] = 1
        total++
        if (!light[(minY + y) * W + minX + x]) dark++
      }
    }
    if (!total || dark / total < 0.01 || dark / total > 0.5) continue
    found.push({
      x0: minX / scale,
      y0: minY / scale,
      x1: (maxX + 1) / scale,
      y1: (maxY + 1) / scale,
      area,
      inside,
      mx: minX,
      my: minY,
      mw: bw,
      mh: bh,
      scale,
    })
  }
  return found.sort((a, b) => a.area - b.area)
}

/** ตัดภาพเฉพาะช่องคำพูด และลบทุกอย่างนอกพื้นที่ด้านในเป็นสีขาว (เส้นขอบโค้งทำให้ Tesseract หาบรรทัดพลาด) */
function cropBubble(canvas: HTMLCanvasElement, b: Bubble): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.round(b.x1 - b.x0))
  out.height = Math.max(1, Math.round(b.y1 - b.y0))
  const ctx = out.getContext('2d', { willReadFrequently: true })
  if (!ctx) return out
  ctx.drawImage(canvas, b.x0, b.y0, out.width, out.height, 0, 0, out.width, out.height)
  const img = ctx.getImageData(0, 0, out.width, out.height)
  const d = img.data
  for (let y = 0; y < out.height; y++) {
    const sy = Math.min(b.mh - 1, Math.floor(y * b.scale))
    for (let x = 0; x < out.width; x++) {
      const sx = Math.min(b.mw - 1, Math.floor(x * b.scale))
      if (b.inside[sy * b.mw + sx]) continue
      const i = (y * out.width + x) * 4
      d[i] = d[i + 1] = d[i + 2] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return out
}

/* ---------- แปลงคำจาก Tesseract ---------- */

const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1] ?? 0

function collectWords(blocks: Block[], lang: LangCode, offsetX = 0, offsetY = 0): OcrWord[] {
  const words: OcrWord[] = []
  for (const block of blocks)
    for (const para of block.paragraphs)
      for (const line of para.lines)
        for (const w of line.words) {
          const text = w.text.trim()
          if (!text || w.confidence < MIN_WORD_CONFIDENCE) continue
          const x0 = w.bbox.x0 + offsetX
          const y0 = w.bbox.y0 + offsetY
          const x1 = w.bbox.x1 + offsetX
          const y1 = w.bbox.y1 + offsetY
          const size = VERTICAL_LANGS.has(lang) ? Math.min(x1 - x0, y1 - y0) : y1 - y0
          words.push({ text, confidence: w.confidence, order: words.length, x0, y0, x1, y1, size })
        }

  // "|" สูงเท่าตัวอักษรรอบข้าง = "I" (ภาษาละติน) · คำที่ไม่มีตัวอักษร/ตัวเลข/สระ-วรรณยุกต์เลย เช่น "|" "—"
  // มาจากลายเส้น จึงตัดทิ้ง (ต้องเก็บสระบน/ล่างและวรรณยุกต์ไทยไว้ — Tesseract มักแยกออกมาเป็นคำเดี่ยว)
  const typical = median(words.filter((w) => /\p{L}/u.test(w.text)).map((w) => w.y1 - w.y0))
  return words
    .map((w) =>
      w.text === '|' && LATIN_LANGS.has(lang) && typical && Math.abs(w.y1 - w.y0 - typical) <= typical * 0.35
        ? { ...w, text: 'I' }
        : w,
    )
    .filter((w) => /[\p{L}\p{N}\p{M}]/u.test(w.text))
}

/* ---------- จัดกลุ่มคำ ---------- */

/** คำที่ห่างกันไม่เกินราว 1 ตัวอักษรทั้งแนวนอนและแนวตั้ง = ข้อความจุดเดียวกัน (union-find) */
function clusterWords(words: OcrWord[]): OcrWord[][] {
  const parent = words.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) {
      const a = words[i]
      const b = words[j]
      const s = Math.max(a.size, b.size)
      const gapX = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1))
      const gapY = Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1))
      if (gapX <= s && gapY <= s) parent[find(i)] = find(j)
    }
  }
  const groups = new Map<number, OcrWord[]>()
  words.forEach((w, i) => {
    const root = find(i)
    groups.set(root, [...(groups.get(root) ?? []), w])
  })
  return [...groups.values()]
}

const CJK = '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}ー'
const SPACE_BETWEEN_CJK = new RegExp(`([${CJK}])\\s+(?=[${CJK}])`, 'gu')

const bounds = (words: Rect[]): Rect => ({
  x0: Math.min(...words.map((w) => w.x0)),
  y0: Math.min(...words.map((w) => w.y0)),
  x1: Math.max(...words.map((w) => w.x1)),
  y1: Math.max(...words.map((w) => w.y1)),
})

const isMarkOnly = (text: string) => /^\p{M}+$/u.test(text)
const THAI_CHAR = /[\u0E00-\u0E7F]/u

/**
 * เรียงคำตามลำดับการอ่าน: แนวนอน = บนลงล่าง ซ้ายไปขวา · แนวตั้ง (ญี่ปุ่น/จีน) = ขวาไปซ้าย บนลงล่าง
 * ภาษาไทย: Tesseract แยกตัวอักษร สระบน/ล่าง และวรรณยุกต์ออกเป็นคำเดี่ยว — ประกอบกลับตามลำดับผลลัพธ์
 */
function groupText(group: OcrWord[], lang: LangCode): string {
  const s = median(group.filter((g) => !isMarkOnly(g.text)).map((w) => w.size))
  const b = bounds(group)
  const vertical = VERTICAL_LANGS.has(lang) && b.y1 - b.y0 > (b.x1 - b.x0) * 1.5
  const across = (g: OcrWord) => (vertical ? (g.x0 + g.x1) / 2 : (g.y0 + g.y1) / 2)
  const along = (g: OcrWord) => (vertical ? (g.y0 + g.y1) / 2 : (g.x0 + g.x1) / 2)

  // Tesseract ส่งสระบน/ล่างและวรรณยุกต์ตามหลังตัวอักษรที่มันกำกับเสมอ แต่กรอบตำแหน่งของมันไม่แม่น
  // จึงผูกเครื่องหมายกับคำก่อนหน้าตามลำดับผลลัพธ์ แทนการเดาจากตำแหน่ง
  const bases: OcrWord[] = []
  const marks = new Map<OcrWord, OcrWord[]>()
  let lastBase: OcrWord | undefined
  for (const word of [...group].sort((a, c) => a.order - c.order)) {
    if (!isMarkOnly(word.text)) {
      bases.push(word)
      lastBase = word
    } else if (lastBase) marks.set(lastBase, [...(marks.get(lastBase) ?? []), word])
  }
  const withMarks = (g: OcrWord) => g.text + (marks.get(g) ?? []).map((m) => m.text).join('')

  const lines: OcrWord[][] = []
  for (const word of [...bases].sort((a, c) => (vertical ? across(c) - across(a) : across(a) - across(c)))) {
    const line = lines.find((l) => Math.abs(across(l[0]) - across(word)) <= s * 0.5)
    if (line) line.push(word)
    else lines.push([word])
  }

  const joinLine = (line: OcrWord[]) => {
    const sorted = line.sort((a, c) => along(a) - along(c))
    if (VERTICAL_LANGS.has(lang)) return sorted.map(withMarks).join('')
    if (lang !== 'th') return sorted.map(withMarks).join(' ')
    // ระยะห่างระหว่างตัวอักษรไทยในภาพไม่สม่ำเสมอพอจะเดาการเว้นวรรค — ต่อกันทั้งหมด
    // และเว้นวรรคเฉพาะรอยต่อระหว่างอักษรไทยกับตัวเลข/อักษรอื่น (เช่น "ทุกวัน 8 โมง")
    return sorted
      .map((g, i) => {
        const prev = i ? withMarks(sorted[i - 1]) : ''
        const text = withMarks(g)
        return (i && !(THAI_CHAR.test(prev.slice(-1)) && THAI_CHAR.test(text[0])) ? ' ' : '') + text
      })
      .join('')
  }
  return lines
    .map(joinLine)
    .join(VERTICAL_LANGS.has(lang) ? '' : ' ')
    .replace(/\s+/g, ' ')
    .replace(SPACE_BETWEEN_CJK, '$1')
    .trim()
}

interface Found extends Rect {
  text: string
}

function toFound(group: OcrWord[], lang: LangCode, minConfidence: number, area?: Rect): Found | null {
  if (!group.length) return null
  const text = groupText(group, lang)
  const confidence = group.reduce((sum, g) => sum + g.confidence, 0) / group.length
  if (confidence < minConfidence || (text.match(/\p{L}/gu)?.length ?? 0) < 2) return null
  // ขยายกรอบเล็กน้อยให้คลุมหางตัวอักษร วรรณยุกต์ และขอบที่ anti-alias
  const pad = median(group.map((g) => g.size)) * 0.25
  const b = bounds(group)
  const box = { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad }
  if (area) {
    // ในช่องคำพูด: ขยายกรอบเป็นพื้นที่ด้านในช่อง (สี่เหลี่ยมในวงรี ≈ เว้นขอบ 15%) ให้คำแปลที่ยาวกว่ามีที่วาง
    const ix = (area.x1 - area.x0) * 0.15
    const iy = (area.y1 - area.y0) * 0.15
    box.x0 = Math.min(box.x0, area.x0 + ix)
    box.y0 = Math.min(box.y0, area.y0 + iy)
    box.x1 = Math.max(box.x1, area.x1 - ix)
    box.y1 = Math.max(box.y1, area.y1 - iy)
  }
  return { ...box, text }
}

const contains = (r: Rect, x: number, y: number) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1

/* ---------- API ---------- */

/**
 * อ่านข้อความในภาพ (canvas ขนาดจริง — ภาพ หรือหน้า PDF ที่วาดแล้ว) แล้วจัดเป็นข้อความแต่ละจุด
 * (มังงะ: 1 ช่องคำพูด = 1 จุด) — กรอบที่ได้เป็นสัดส่วน 0–1 ของภาพ
 */
export async function recognizeImageText(
  source: HTMLCanvasElement,
  sourceLang: SourceLang,
  { signal, onProgress }: OcrOptions,
): Promise<OcrOutcome> {
  const lang = sourceLang === 'auto' ? OCR_AUTO_LANG : sourceLang
  await acquire(signal)
  let worker: Worker | undefined
  let inflight: Promise<unknown> | undefined
  try {
    const canvas = toCanvas(source)
    const { createWorker, PSM } = await import('tesseract.js')
    if (signal.aborted) throw abortError()

    // โหลดตัว OCR/โมเดล = 0–30% · อ่านช่องคำพูด = 30–75% · อ่านทั้งภาพ = 75–100%
    const ocr = await createWorker(OCR_LANGS[lang], 1, {
      logger: (m) => {
        if (m.status.startsWith('loading')) onProgress?.(m.progress * 0.3)
      },
    }).catch(() => {
      throw new Error('โหลดตัวอ่านข้อความในภาพ (OCR) ไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง')
    })
    worker = ocr

    const aborted = new Promise<never>((_, reject) => {
      if (signal.aborted) reject(abortError())
      signal.addEventListener('abort', () => reject(abortError()), { once: true })
    })
    aborted.catch(() => undefined) // กดหยุดหลังอ่านเสร็จแล้ว ไม่ต้องแจ้งเป็นข้อผิดพลาด
    const recognize = (image: HTMLCanvasElement) => {
      const job = ocr.recognize(image, {}, { blocks: true })
      inflight = job
      return Promise.race([job, aborted])
    }

    // 1) อ่านทีละช่องคำพูด — ทั้งช่องเป็นข้อความก้อนเดียว (แนวตั้งสำหรับญี่ปุ่น/จีนเมื่อช่องสูงกว่ากว้าง)
    const found: Found[] = []
    const bubbles = findBubbles(canvas)
    for (const [i, bubble] of bubbles.entries()) {
      onProgress?.(0.3 + (i / Math.max(1, bubbles.length)) * 0.45)
      if (found.some((f) => contains(bubble, (f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2))) continue // กรอบใหญ่ที่ครอบช่องที่อ่านแล้ว
      const vertical = VERTICAL_LANGS.has(lang) && bubble.y1 - bubble.y0 > bubble.x1 - bubble.x0
      await ocr.setParameters({
        tessedit_pageseg_mode: vertical ? PSM.SINGLE_BLOCK_VERT_TEXT : PSM.SINGLE_BLOCK,
        user_defined_dpi: OCR_DPI,
      })
      const { data } = await recognize(cropBubble(canvas, bubble))
      const words = collectWords(data.blocks ?? [], lang, bubble.x0, bubble.y0)
      const region = toFound(words, lang, MIN_BUBBLE_CONFIDENCE, bubble)
      if (region) found.push(region)
    }

    // 2) อ่านทั้งภาพ เก็บข้อความที่อยู่นอกช่องคำพูดที่อ่านแล้ว
    onProgress?.(0.75)
    await ocr.setParameters({
      tessedit_pageseg_mode: VERTICAL_LANGS.has(lang) ? PSM.AUTO : PSM.SPARSE_TEXT,
      user_defined_dpi: OCR_DPI,
    })
    const { data } = await recognize(canvas)
    const loose = collectWords(data.blocks ?? [], lang).filter(
      (w) => !found.some((f) => contains(f, (w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2)),
    )
    for (const group of clusterWords(loose)) {
      const region = toFound(group, lang, MIN_REGION_CONFIDENCE)
      if (region) found.push(region)
    }

    // ลำดับการอ่าน: แถวบนก่อน · ในแถวเดียวกันซ้ายไปขวา (ญี่ปุ่น/จีน: ขวาไปซ้าย)
    const rtl = VERTICAL_LANGS.has(lang)
    const rowOverlap = (a: Found, b: Found) => Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0
    const W = canvas.width
    const H = canvas.height
    const regions: TextRegion[] = found
      .sort((a, b) => (rowOverlap(a, b) ? (rtl ? b.x0 - a.x0 : a.x0 - b.x0) : a.y0 - b.y0))
      .map((f, i) => {
        const x0 = Math.max(0, f.x0)
        const y0 = Math.max(0, f.y0)
        const x1 = Math.min(W, f.x1)
        const y1 = Math.min(H, f.y1)
        return {
          id: `ocr_${i + 1}`,
          box: { x: x0 / W, y: y0 / H, width: (x1 - x0) / W, height: (y1 - y0) / H },
          sourceText: f.text,
          translatedText: '',
        }
      })
    onProgress?.(1)
    return { regions, lang }
  } finally {
    // ปิด worker หลังงานที่ค้างอยู่จบ — Tesseract เตรียมภาพก่อนส่งงาน ถ้าปิดระหว่างนั้นงานจะถูกส่งหา worker ที่ปิดแล้ว
    const w = worker
    if (w) void Promise.resolve(inflight).catch(() => undefined).finally(() => w.terminate().catch(() => undefined))
    release()
  }
}

/** หมายเหตุใต้หัวข้อ "ต้นฉบับ" ในหน้าเปรียบเทียบ */
export const ocrNote = (count: number, lang: LangCode, auto: boolean) =>
  `${count ? `อ่านข้อความในภาพด้วย OCR บนเครื่องของคุณ · พบ ${count} จุด` : 'OCR ไม่พบข้อความในภาพนี้'}` +
  ` (อ่านเป็นภาษา${LANGUAGE_MAP[lang].label}${auto ? ' — ถ้าภาพเป็นภาษาอื่น ให้เลือกภาษาต้นฉบับก่อนแปล' : ''})`
