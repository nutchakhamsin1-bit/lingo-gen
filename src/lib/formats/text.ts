import type { SourceLang } from '../../types'
import { OUTPUT_MIME } from './mime'
import { encodePieces, hasWords, parsePieces, splitPadding, toPlainText, type Piece } from './segments'
import type { FormatHandler } from './types'

/* ---------- อ่าน/เขียนไฟล์ข้อความ ---------- */

/** อ่านเป็น UTF-8 (คง BOM ไว้) — ถ้าไม่ใช่ UTF-8 ใช้รหัสหน้าภาษาเก่า (ไทย = windows-874) */
export async function readText(file: File, sourceLang: SourceLang): Promise<{ text: string; bom: boolean }> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), bom }
  } catch {
    return { text: new TextDecoder(sourceLang === 'th' ? 'windows-874' : 'windows-1252').decode(bytes), bom: false }
  }
}

/** ไฟล์ผลลัพธ์เป็น UTF-8 เสมอ (คง BOM ถ้าต้นฉบับมี) */
export const textBlob = (text: string, bom: boolean, type: string) => new Blob([bom ? '﻿' : '', text], { type })

/** ตำแหน่งในไฟล์ที่จะแทนด้วยคำแปล */
export interface Slot {
  start: number
  end: number
  segment: string
  render(translation: string): string
}

/** แทนข้อความเฉพาะตำแหน่งที่แปล ส่วนอื่นของไฟล์คงเดิมทุกตัวอักษร */
export function patchText(text: string, slots: Slot[], translations: string[]): string {
  let out = ''
  let at = 0
  slots.forEach((slot, i) => {
    out += text.slice(at, slot.start) + slot.render(translations[i] ?? slot.segment)
    at = slot.end
  })
  return out + text.slice(at)
}

/** แต่ละบรรทัดพร้อมตำแหน่งเริ่มต้น (รองรับ \n \r\n \r) */
function* lines(text: string): Generator<{ line: string; start: number }> {
  for (const m of text.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)) {
    if (!m[0]) break
    yield { line: m[0].replace(/[\r\n]+$/, ''), start: m.index }
  }
}

/** ตำแหน่งข้อความหนึ่งช่วง — ส่งแปลเฉพาะแกนกลาง ช่องว่างหน้า/หลังคงเดิม */
function paddedSlot(text: string, start: number, end: number, encode: (core: string) => Protected): Slot | null {
  const [lead, core, trail] = splitPadding(text.slice(start, end))
  if (!hasWords(core)) return null
  const { segment, restore } = encode(core)
  return { start: start + lead.length, end: end - trail.length, segment, render: restore }
}

/* ---------- ปกป้องส่วนที่ห้ามแปล (โค้ด ลิงก์ แท็ก) ---------- */

interface Protected {
  segment: string
  restore(translation: string): string
}

/**
 * แทนส่วนที่ห้ามแปลด้วย <xN/> และข้อความลิงก์ [ข้อความ](url) ด้วย <gN>ข้อความ</gN>
 * ตอนประกอบกลับ ส่วนที่ผู้แปลทำหายจะต่อท้ายไว้ ไม่ให้โค้ด/ลิงก์หายจากไฟล์
 */
function protect(text: string, pattern: RegExp | null, link?: (m: RegExpExecArray) => { label: string; wrap(label: string): string } | null): Protected {
  if (!pattern) return { segment: encodePieces([{ type: 'text', text }]), restore: (t) => toPlainText(t) }
  const raw: string[] = []
  const wraps: ((label: string) => string)[] = []
  const pieces: Piece[] = []
  let last = 0
  for (const m of text.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'))) {
    if (m.index > last) pieces.push({ type: 'text', text: text.slice(last, m.index) })
    last = m.index + m[0].length
    const l = link?.(m as RegExpExecArray)
    const id = raw.push(m[0])
    if (l) {
      wraps[id] = l.wrap
      pieces.push({ type: 'g', id, children: [{ type: 'text', text: l.label }] })
    } else pieces.push({ type: 'x', id })
  }
  if (last < text.length) pieces.push({ type: 'text', text: text.slice(last) })

  const restore = (translation: string) => {
    const used = new Set<number>()
    const render = (ps: Piece[]): string =>
      ps
        .map((p) => {
          if (p.type === 'text') return p.text
          if (!raw[p.id - 1]) return p.type === 'g' ? render(p.children) : ''
          used.add(p.id)
          return p.type === 'x' ? raw[p.id - 1] : (wraps[p.id] ?? ((s: string) => s))(render(p.children))
        })
        .join('')
    const out = render(parsePieces(translation))
    const missing = raw.filter((_, i) => !used.has(i + 1))
    return missing.length ? `${out} ${missing.join(' ')}` : out
  }
  return { segment: encodePieces(pieces), restore }
}

/* ---------- ข้อความล้วน (.txt) ---------- */

/** แปลทีละบรรทัด — การขึ้นบรรทัด ย่อหน้า และการเว้นวรรคหน้าบรรทัดคงเดิม */
export const plainText: FormatHandler = {
  async open(file, { ext, sourceLang }) {
    const { text, bom } = await readText(file, sourceLang)
    const slots: Slot[] = []
    for (const m of text.matchAll(/[^\r\n]+/g)) {
      const slot = paddedSlot(text, m.index, m.index + m[0].length, (core) => protect(core, null))
      if (slot) slots.push(slot)
    }
    return {
      segments: slots.map((s) => s.segment),
      build: async (tr) => textBlob(patchText(text, slots, tr), bom, OUTPUT_MIME[ext]),
    }
  },
}

/* ---------- Markdown ---------- */

const MD_INLINE = /(`+)[\s\S]*?\1|!\[[^\]]*\]\([^)]*\)|\[([^\]]+)\]\(([^)]*)\)|<[^>\s][^>]*>|https?:\/\/[^\s)>]+/g
const MD_PREFIX = /^(\s*(?:#{1,6}\s+|>\s?|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)*)/

const mdProtect = (text: string) =>
  protect(text, MD_INLINE, (m) => (m[2] !== undefined ? { label: m[2], wrap: (label) => `[${label}](${m[3]})` } : null))

/** แปลข้อความ คงหัวข้อ รายการ ตาราง ลิงก์ และโค้ดไว้ตามเดิม */
export const markdown: FormatHandler = {
  async open(file, { ext, sourceLang }) {
    const { text, bom } = await readText(file, sourceLang)
    const slots: Slot[] = []
    let fence: string | null = null
    let frontMatter = text.startsWith('---')
    let first = true
    for (const { line, start } of lines(text)) {
      const isFirst = first
      first = false
      if (frontMatter) {
        if (!isFirst && /^---\s*$/.test(line)) frontMatter = false
        continue
      }
      const fenceMark = /^\s*(```|~~~)/.exec(line)?.[1]
      if (fence) {
        if (fenceMark === fence) fence = null
        continue
      }
      if (fenceMark) {
        fence = fenceMark
        continue
      }
      // โค้ดแบบย่อหน้า 4 ช่อง, เส้นคั่น, ลิงก์อ้างอิง, คอมเมนต์ HTML — ไม่แปล
      if (/^( {4}|\t)/.test(line) || /^\s*([-*_]\s*){3,}$/.test(line) || /^\s*\[[^\]]+\]:\s/.test(line) || /^\s*<!--/.test(line)) continue
      if (/^\s*\|?\s*:?-{3,}/.test(line)) continue // เส้นคั่นหัวตาราง
      if (/^\s*\|/.test(line)) {
        // แถวตาราง: แปลทีละเซลล์
        for (const cell of line.matchAll(/[^|]+/g)) {
          const slot = paddedSlot(text, start + cell.index, start + cell.index + cell[0].length, mdProtect)
          if (slot) slots.push(slot)
        }
        continue
      }
      const prefix = MD_PREFIX.exec(line)?.[0] ?? ''
      const slot = paddedSlot(text, start + prefix.length, start + line.length, mdProtect)
      if (slot) slots.push(slot)
    }
    return {
      segments: slots.map((s) => s.segment),
      build: async (tr) => textBlob(patchText(text, slots, tr), bom, OUTPUT_MIME[ext]),
    }
  },
}

/* ---------- คำบรรยาย (.srt .vtt) ---------- */

/** แปลข้อความแต่ละช่วงเวลา — ลำดับ เวลา และแท็ก <i> {\an8} คงเดิม */
export const subtitles: FormatHandler = {
  async open(file, { ext, sourceLang }) {
    const { text, bom } = await readText(file, sourceLang)
    const slots: Slot[] = []
    // แต่ละ cue คั่นด้วยบรรทัดว่าง: [ลำดับ] / เวลา --> เวลา / ข้อความหลายบรรทัด
    for (const block of text.matchAll(/(?:[^\r\n]+(?:\r\n|\r|\n)?)+/g)) {
      const lines = [...block[0].matchAll(/[^\r\n]+/g)]
      const timing = lines.findIndex((l) => l[0].includes('-->'))
      if (timing < 0) continue // ส่วนหัว WEBVTT, NOTE, STYLE
      const body = lines.slice(timing + 1)
      if (!body.length) continue
      const start = block.index + body[0].index
      const end = block.index + body[body.length - 1].index + body[body.length - 1][0].length
      const slot = paddedSlot(text, start, end, (core) => protect(core, /<[^>]+>|\{\\[^}]*\}/g))
      if (slot) slots.push(slot)
    }
    return {
      segments: slots.map((s) => s.segment),
      build: async (tr) => textBlob(patchText(text, slots, tr), bom, OUTPUT_MIME[ext]),
    }
  },
}

/* ---------- gettext (.po) ---------- */

const unquote = (s: string) =>
  s.replace(/\\(.)/g, (_, c: string) => ({ n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\' })[c] ?? c)
const quote = (s: string) =>
  `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`

/** อ่านสตริงหลายบรรทัดของ po: msgid "a" / "b" → "ab" พร้อมตำแหน่งสิ้นสุด */
function readPoString(lines: string[], from: number): { value: string; next: number } {
  let value = unquote(/"(.*)"\s*$/.exec(lines[from])?.[1] ?? '')
  let i = from + 1
  while (i < lines.length && /^\s*"/.test(lines[i])) value += unquote(/"(.*)"\s*$/.exec(lines[i++])?.[1] ?? '')
  return { value, next: i }
}

/** เติม msgstr ด้วยคำแปลของ msgid (ข้ามส่วนหัว) — คอมเมนต์และ msgctxt คงเดิม */
export const gettext: FormatHandler = {
  async open(file, { sourceLang }) {
    const { text, bom } = await readText(file, sourceLang)
    const eol = text.includes('\r\n') ? '\r\n' : '\n'
    const lines = text.split(/\r\n|\n/)
    type Entry = { strStart: number; strEnd: number; plural: boolean; forms: number; segments: string[] }
    const entries: Entry[] = []
    for (let i = 0; i < lines.length; i++) {
      if (!/^msgid\s/.test(lines[i])) continue
      const id = readPoString(lines, i)
      let j = id.next
      let plural: string | null = null
      if (/^msgid_plural\s/.test(lines[j] ?? '')) {
        const p = readPoString(lines, j)
        plural = p.value
        j = p.next
      }
      const strStart = j
      let forms = 0
      while (j < lines.length && /^msgstr(\[\d+\])?\s/.test(lines[j])) {
        forms++
        j = readPoString(lines, j).next
      }
      i = j - 1
      if (!id.value || !forms) continue // ส่วนหัวของไฟล์
      const segs = [id.value, ...(plural !== null ? [plural] : [])].map((s) => encodePieces([{ type: 'text', text: s }]))
      entries.push({ strStart, strEnd: j, plural: plural !== null, forms: Math.max(forms, plural !== null ? 2 : 1), segments: segs })
    }
    return {
      segments: entries.flatMap((e) => e.segments),
      build: async (tr) => {
        const out = [...lines]
        let k = 0
        // แทนจากท้ายไฟล์ขึ้นมา ตำแหน่งบรรทัดจะได้ไม่เลื่อน
        const plan = entries.map((e) => {
          const values = e.segments.map((s) => toPlainText(tr[k++] ?? s))
          return { e, values }
        })
        for (const { e, values } of plan.reverse()) {
          const strs = e.plural
            ? Array.from({ length: e.forms }, (_, n) => `msgstr[${n}] ${quote(n === 0 ? values[0] : values[1])}`)
            : [`msgstr ${quote(values[0])}`]
          out.splice(e.strStart, e.strEnd - e.strStart, ...strs)
        }
        return textBlob(out.join(eol), bom, OUTPUT_MIME.po)
      },
    }
  },
}
