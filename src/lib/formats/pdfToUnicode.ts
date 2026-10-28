import type { Font } from '@pdf-lib/fontkit'

/** ส่วนของ glyph ใน fontkit ที่ใช้ (ไฟล์ type ของ fontkit ไม่ได้ประกาศ path.commands และ name ไว้) */
interface GlyphOutline {
  name?: string
  advanceWidth: number
  bbox: { minX: number; minY: number; maxX: number; maxY: number }
  path: { commands: { command: string; args: number[] }[] }
}
const outline = (font: Font, id: number) => font.getGlyph(id) as unknown as GlyphOutline

/**
 * ซ่อมตารางแปลงตัวอักษร (ToUnicode) ของ PDF ที่สั่งพิมพ์จาก Chrome (Skia)
 *
 * Chrome เก็บสระ/วรรณยุกต์ไทยที่ฟอนต์สลับรูป (เช่น ่ ้ ที่ซ้อนบนสระบน) เป็นรหัสว่าง U+0000
 * โปรแกรมใดดึงข้อความจากไฟล์ก็ได้ "ที" แทน "ที่", "ทังสิน" แทน "ทั้งสิ้น"
 * — เทียบรูปทรงของ glyph ที่ไม่มีรหัส กับสระ/วรรณยุกต์ที่มีรหัสในฟอนต์เดียวกัน (หรือ Sarabun ตามชื่อ glyph)
 * แล้วเติมรหัสให้ครบ ก่อนอ่านข้อความด้วย pdf.js · ตัวที่เทียบไม่ชัดจะไม่เดา
 */

/** สระบน/ล่าง วรรณยุกต์ และเครื่องหมายไทยที่ไม่มีความกว้าง */
const THAI_MARK = (cp: number) => cp === 0x0e31 || (cp >= 0x0e34 && cp <= 0x0e3a) || (cp >= 0x0e47 && cp <= 0x0e4e)

interface Shape {
  types: string
  points: number[]
  aspect: number
  count: number
}

/** รูปทรงที่ไม่ขึ้นกับตำแหน่งและขนาด (รูปสลับของวรรณยุกต์มักเป็นรูปเดิมที่เลื่อน/ย่อ) */
function shapeOf(glyph: GlyphOutline): Shape | null {
  const { minX, minY, maxX, maxY } = glyph.bbox
  const w = maxX - minX
  const h = maxY - minY
  if (!(w > 0 && h > 0)) return null
  const scale = 1000 / Math.max(w, h)
  const commands = glyph.path.commands
  return {
    types: commands.map((c) => c.command[0]).join(''),
    points: commands.flatMap((c) => c.args.map((v, i) => (i % 2 ? v - minY : v - minX) * scale)),
    aspect: Math.log(w / h),
    count: commands.length,
  }
}

/** ระยะห่างของรูปทรง: ลำดับคำสั่งเหมือนกัน = เทียบพิกัด, ไม่เหมือน = เทียบจำนวนจุดและสัดส่วน */
function distance(a: Shape, b: Shape): number {
  if (a.types === b.types) {
    const total = a.points.reduce((sum, v, i) => sum + Math.abs(v - b.points[i]), 0)
    return total / Math.max(1, a.points.length)
  }
  return 500 + Math.abs(a.count - b.count) * 40 + Math.abs(a.aspect - b.aspect) * 300
}

/** รูปทรงที่ใกล้ที่สุด — ยอมรับเมื่อใกล้พอและชนะอันดับสองชัดเจน */
function bestMatch(shape: Shape, candidates: { cp: number; shape: Shape }[], strict: boolean): number | null {
  const ranked = candidates.map((c) => ({ cp: c.cp, d: distance(shape, c.shape) })).sort((x, y) => x.d - y.d)
  const [best, second] = ranked
  if (!best) return null
  if (best.d < 60 && (!second || second.cp === best.cp || second.d - best.d > 15)) return best.cp
  if (strict) return null
  return best.d < 700 && (!second || second.cp === best.cp || second.d - best.d > 40) ? best.cp : null
}

/** รูปทรงของสระ/วรรณยุกต์ทุกแบบในฟอนต์อ้างอิง โดยอ่านรหัสจากชื่อ glyph (uni0E48, uni0E48.small, …) */
function referenceShapes(font: Font): { cp: number; shape: Shape }[] {
  const out: { cp: number; shape: Shape }[] = []
  for (let id = 0; id < font.numGlyphs; id++) {
    const glyph = outline(font, id)
    const m = /^uni(0E[0-9A-F]{2})(\.|$)/.exec(glyph.name ?? '')
    const cp = m ? parseInt(m[1], 16) : NaN
    const shape = THAI_MARK(cp) ? shapeOf(glyph) : null
    if (shape) out.push({ cp, shape })
  }
  return out
}

/** Sarabun น้ำหนัก/ตัวเอียงเดียวกับฟอนต์ในไฟล์ — แต่ละน้ำหนักมีโครงจุดของ glyph ต่างกัน จึงต้องเทียบกับน้ำหนักเดียวกัน */
const SARABUN = 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/sarabun@0.4.1'
const WEIGHTS: [string, string][] = [
  ['ExtraLight', '200ExtraLight'],
  ['ExtraBold', '800ExtraBold'],
  ['SemiBold', '600SemiBold'],
  ['Thin', '100Thin'],
  ['Light', '300Light'],
  ['Medium', '500Medium'],
  ['Bold', '700Bold'],
]
function sarabunUrl(postscriptName: string): string {
  const weight = WEIGHTS.find(([key]) => postscriptName.includes(key))?.[1] ?? '400Regular'
  const style = `${weight}${/Italic/.test(postscriptName) ? '_Italic' : ''}`
  return `${SARABUN}/${style}/Sarabun_${style}.ttf`
}

const referenceCache = new Map<string, Promise<{ cp: number; shape: Shape }[]>>()

export async function repairThaiToUnicode(bytes: Uint8Array): Promise<Uint8Array> {
  const lib = await import('pdf-lib')
  const { PDFDocument, PDFDict, PDFName, PDFRawStream, PDFRef, PDFArray, decodePDFRawStream } = lib
  const { default: fontkit } = await import('@pdf-lib/fontkit')
  let doc: Awaited<ReturnType<typeof PDFDocument.load>>
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  } catch {
    return bytes
  }
  const ctx = doc.context
  const name = (n: string) => PDFName.of(n)
  const lookupDict = (v: unknown) => {
    const o = v instanceof PDFRef ? ctx.lookup(v) : v
    return o instanceof PDFDict ? o : null
  }
  const lookupStream = (v: unknown) => {
    const o = v instanceof PDFRef ? ctx.lookup(v) : v
    return o instanceof PDFRawStream ? o : null
  }
  const reference = (postscriptName: string) => {
    const url = sarabunUrl(postscriptName)
    let pending = referenceCache.get(url)
    if (!pending) {
      pending = fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((buf) => referenceShapes(fontkit.create(new Uint8Array(buf))))
      pending.catch(() => referenceCache.delete(url))
      referenceCache.set(url, pending)
    }
    return pending.catch(() => [])
  }
  let changed = false

  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict) || obj.get(name('Subtype')) !== name('Type0')) continue
    const tuValue = obj.get(name('ToUnicode'))
    const tu = lookupStream(tuValue)
    if (!tu) continue
    const cmap = new TextDecoder('latin1').decode(decodePDFRawStream(tu).decode())
    const entries = [...cmap.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]{4,})>/g)]
    const unmapped = entries.filter((m) => /^0+$/.test(m[2])).map((m) => parseInt(m[1], 16))
    const marks = entries.map((m) => [parseInt(m[1], 16), parseInt(m[2], 16)] as const).filter(([, cp]) => THAI_MARK(cp))
    if (!unmapped.length || !marks.length) continue

    // ฟอนต์ที่ฝัง (TrueType, CID = glyph id)
    const descendants = obj.get(name('DescendantFonts'))
    const list = descendants instanceof PDFRef ? ctx.lookup(descendants) : descendants
    const desc = list instanceof PDFArray ? lookupDict(list.get(0)) : null
    if (!desc || desc.get(name('CIDToGIDMap')) !== name('Identity')) continue
    const program = lookupStream(lookupDict(desc.get(name('FontDescriptor')))?.get(name('FontFile2')))
    if (!program) continue
    let font: Font
    try {
      font = fontkit.create(decodePDFRawStream(program).decode())
    } catch {
      continue
    }

    const inFont = marks.flatMap(([gid, cp]) => {
      const shape = shapeOf(outline(font, gid))
      return shape ? [{ cp, shape }] : []
    })
    const fixes = new Map<number, number>()
    for (const cid of unmapped) {
      const glyph = outline(font, cid)
      if (glyph.advanceWidth !== 0) continue // สระ/วรรณยุกต์ไม่มีความกว้าง
      const shape = shapeOf(glyph)
      if (!shape) continue
      let cp = bestMatch(shape, inFont, false)
      if (cp === null && /sarabun/i.test(font.familyName ?? '')) {
        // ไม่มีตัวเทียบในไฟล์ — เทียบกับ Sarabun น้ำหนักเดียวกันตามชื่อ glyph (uni0E47.narrow → U+0E47)
        cp = bestMatch(shape, await reference(font.postscriptName ?? ''), true)
      }
      if (cp !== null) fixes.set(cid, cp)
    }
    if (!fixes.size) continue

    const fixed = cmap.replace(/<([0-9a-fA-F]+)>(\s*)<(0{4,})>/g, (whole, cid: string, gap: string) => {
      const cp = fixes.get(parseInt(cid, 16))
      return cp === undefined ? whole : `<${cid}>${gap}<${cp.toString(16).toUpperCase().padStart(4, '0')}>`
    })
    const stream = ctx.flateStream(fixed)
    if (tuValue instanceof PDFRef) ctx.assign(tuValue, stream)
    else obj.set(name('ToUnicode'), ctx.register(stream))
    changed = true
  }
  return changed ? doc.save({ updateFieldAppearances: false }) : bytes
}
