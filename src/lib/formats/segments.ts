/**
 * รูปแบบข้อความที่ส่งแปล (segment) — ใช้ร่วมกันทุกประเภทไฟล์ และเป็นสัญญากับบริการแปล
 *
 * - ข้อความถูก escape แบบ XML: & → &amp;  < → &lt;  > → &gt;
 * - ช่วงที่มีรูปแบบต่างกันในย่อหน้าเดียว (ตัวหนา ลิงก์ ฯลฯ) ห่อด้วย <g1>…</g1>
 * - สิ่งที่ห้ามแปลและห้ามหาย (ขึ้นบรรทัด แท็บ โค้ด รูป) แทนด้วย <x1/>
 *
 * ผู้แปลต้องคงแท็กไว้ครบ (ย้ายตำแหน่งได้ตามไวยากรณ์ภาษาปลายทาง) แล้วแอปจะประกอบรูปแบบเดิมกลับเอง
 */

export type Piece =
  | { type: 'text'; text: string }
  | { type: 'g'; id: number; children: Piece[] }
  | { type: 'x'; id: number }

export const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const unescapeXml = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

export function encodePieces(pieces: Piece[]): string {
  return pieces
    .map((p) =>
      p.type === 'text' ? escapeXml(p.text) : p.type === 'x' ? `<x${p.id}/>` : `<g${p.id}>${encodePieces(p.children)}</g${p.id}>`,
    )
    .join('')
}

const TAG = /<(\/?)([gx])(\d+)\s*(\/?)>/g

/** แปลงคำแปลกลับเป็นโครงสร้าง — ทนต่อแท็กที่หาย ไม่ปิด หรือปิดผิดลำดับ */
export function parsePieces(segment: string): Piece[] {
  const root: Piece[] = []
  const stack: { id: number; children: Piece[] }[] = []
  const current = () => (stack.length ? stack[stack.length - 1].children : root)
  let last = 0
  for (const m of segment.matchAll(TAG)) {
    if (m.index > last) current().push({ type: 'text', text: unescapeXml(segment.slice(last, m.index)) })
    last = m.index + m[0].length
    const [, closing, kind, num, selfClosing] = m
    const id = Number(num)
    if (kind === 'x') {
      if (!closing) current().push({ type: 'x', id })
    } else if (closing) {
      const at = stack.findLastIndex((s) => s.id === id)
      if (at >= 0) stack.length = at
    } else if (!selfClosing) {
      const group: Piece = { type: 'g', id, children: [] }
      current().push(group)
      stack.push(group)
    }
  }
  if (last < segment.length) current().push({ type: 'text', text: unescapeXml(segment.slice(last)) })
  return root
}

/** ข้อความล้วนของ segment (ตัดแท็กทิ้ง) — ใช้แสดงตัวอย่างและกับรูปแบบที่ไม่มีรูปแบบย่อย */
export function toPlainText(segment: string, placeholder = ''): string {
  const walk = (pieces: Piece[]): string =>
    pieces.map((p) => (p.type === 'text' ? p.text : p.type === 'x' ? placeholder : walk(p.children))).join('')
  return walk(parsePieces(segment))
}

/** ข้อความล้วน → segment */
export const plainSegment = (text: string) => escapeXml(text)

/**
 * แยกช่องว่างหน้า/หลังออกจาก segment — ส่งแปลเฉพาะแกนกลาง แล้วต่อช่องว่างเดิมกลับตอนประกอบ
 * (ช่องว่างไม่มีแท็ก จึงตัดจากสตริงที่ encode แล้วได้ตรง ๆ)
 */
export function splitPadding(text: string): [lead: string, core: string, trail: string] {
  const lead = /^\s*/.exec(text)?.[0] ?? ''
  const trail = /\s*$/.exec(text.slice(lead.length))?.[0] ?? ''
  return [lead, text.slice(lead.length, text.length - trail.length), trail]
}

/** มีตัวอักษรให้แปล (ไม่ใช่ตัวเลข สัญลักษณ์ หรือช่องว่างล้วน) */
export const hasWords = (text: string) => /\p{L}/u.test(text)

/**
 * สำหรับไฟล์ข้อมูล (JSON YAML CSV Excel): แปลเฉพาะค่าที่เป็นข้อความสำหรับคนอ่าน
 * ข้ามรหัส ลิงก์ อีเมล พาธ ชื่อไฟล์ ชื่อตัวแปร — แปลผิดแล้วระบบที่ใช้ไฟล์นั้นจะพัง
 */
export function looksLikeText(value: string): boolean {
  const t = value.trim()
  if (!hasWords(t)) return false
  if (/^(https?:|mailto:|www\.|\/|\.{1,2}\/|#[0-9a-f]{3,8}$)/i.test(t)) return false
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(t)) return false
  if (/\s/.test(t)) return true
  if (/[_/\\]|\.\w|\d/.test(t)) return false
  if (/^[a-z]+[A-Z]/.test(t)) return false // camelCase
  if (/^[a-z]+(-[a-z]+)+$/.test(t)) return false // kebab-case เช่น dark-green, en-us
  return true
}

/**
 * ลำดับกลุ่มตามคำแปล (สำหรับรูปแบบที่ไม่ซ้อนกัน เช่น run ของ Word/PowerPoint)
 * ข้อความหรือ <x/> นอกแท็กรวมเข้ากับกลุ่มก่อนหน้า (หรือกลุ่มแรกถ้ายังไม่มี)
 */
export function groupsInOrder(pieces: Piece[], fallbackId: number): { id: number; content: Piece[] }[] {
  const flat = (ps: Piece[]): Piece[] => ps.flatMap((p) => (p.type === 'g' ? flat(p.children) : [p]))
  const out: { id: number; content: Piece[] }[] = []
  let pending: Piece[] = []
  for (const p of pieces) {
    if (p.type === 'g') {
      out.push({ id: p.id, content: [...pending, ...flat(p.children)] })
      pending = []
    } else if (out.length) out[out.length - 1].content.push(p)
    else pending.push(p)
  }
  if (pending.length) out.unshift({ id: fallbackId, content: pending })
  return out
}
