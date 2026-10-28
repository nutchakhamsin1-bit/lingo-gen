import { OUTPUT_MIME } from './mime'
import { encodePieces, hasWords, parsePieces, plainSegment, splitPadding, toPlainText, type Piece } from './segments'
import { readText, textBlob } from './text'
import type { FormatHandler } from './types'

/* ---------- ย่อหน้าที่มีรูปแบบซ้อนใน (ใช้ร่วมกับ HTML, EPUB, OpenDocument) ---------- */

export interface InlineRules {
  /** องค์ประกอบที่ข้อความภายในรวมเป็น 1 segment (ย่อหน้า หัวข้อ เซลล์ตาราง) */
  isRoot(el: Element): boolean
  /** รูปแบบภายในบรรทัด (ตัวหนา ลิงก์ span) — ห่อด้วย <gN> และแปลข้อความข้างใน */
  isInline(el: Element): boolean
  /** ไม่แปลอะไรข้างใน (script, style, code) */
  skip(el: Element): boolean
  /** ยุบช่องว่างหลายตัวเป็นตัวเดียว (HTML แสดงผลแบบนั้นอยู่แล้ว) */
  collapseSpace?: boolean
}

export interface DomSlot {
  segment: string
  apply(translation: string): void
}

const TEXT_NODE = 3
const CDATA_NODE = 4

/** ข้อความในย่อหน้า (ผ่านรูปแบบภายในบรรทัด) มีคำให้แปลหรือไม่ */
function hasInlineText(el: Element, rules: InlineRules): boolean {
  for (const n of el.childNodes) {
    if ((n.nodeType === TEXT_NODE || n.nodeType === CDATA_NODE) && hasWords(n.nodeValue ?? '')) return true
    if (n instanceof Element && rules.isInline(n) && !rules.skip(n) && hasInlineText(n, rules)) return true
  }
  return false
}

function inlineSlot(block: Element, rules: InlineRules): DomSlot | null {
  const nodes: Node[] = []
  const isX: boolean[] = []
  const encode = (parent: Node): Piece[] =>
    [...parent.childNodes].map((n): Piece => {
      if (n.nodeType === TEXT_NODE || n.nodeType === CDATA_NODE) {
        const text = n.nodeValue ?? ''
        return { type: 'text', text: rules.collapseSpace ? text.replace(/\s+/g, ' ') : text }
      }
      const id = nodes.push(n)
      if (n instanceof Element && rules.isInline(n) && !rules.skip(n)) {
        isX[id] = false
        return { type: 'g', id, children: encode(n) }
      }
      isX[id] = true
      return { type: 'x', id }
    })
  const [lead, core, trail] = splitPadding(encodePieces(encode(block)))
  if (!hasWords(toPlainText(core))) return null

  return {
    segment: core,
    apply(translation) {
      const doc = block.ownerDocument
      const used = new Set<number>()
      const build = (pieces: Piece[]): Node[] =>
        pieces.flatMap((p): Node[] => {
          if (p.type === 'text') return [doc.createTextNode(p.text)]
          const original = nodes[p.id - 1]
          if (!original) return p.type === 'g' ? build(p.children) : []
          if (p.type === 'x') {
            const node = used.has(p.id) ? original.cloneNode(true) : original
            used.add(p.id)
            return [node]
          }
          used.add(p.id)
          const clone = original.cloneNode(false)
          for (const child of build(p.children)) clone.appendChild(child)
          return [clone]
        })
      const next = [doc.createTextNode(lead), ...build(parsePieces(translation)), doc.createTextNode(trail)]
      // รูป/ย่อหน้าซ้อนที่ผู้แปลทำหาย ต้องไม่หายจากเอกสาร (ขึ้นบรรทัด/ช่องว่างหายได้)
      nodes.forEach((n, i) => {
        if (isX[i + 1] && !used.has(i + 1) && n instanceof Element && (n.childNodes.length || /img|image|frame|svg/i.test(n.localName))) {
          next.push(n)
        }
      })
      block.replaceChildren(...next)
    },
  }
}

/** เก็บย่อหน้าทั้งหมดในต้นไม้ — ย่อหน้าที่ซ้อนอยู่ในย่อหน้าอื่น (เชิงอรรถ กล่องข้อความ) แปลแยกของมันเอง */
export function collectInlineSlots(root: Element, rules: InlineRules): DomSlot[] {
  const slots: DomSlot[] = []
  const visit = (el: Element) => {
    if (rules.skip(el)) return
    if (rules.isRoot(el) && hasInlineText(el, rules)) {
      const slot = inlineSlot(el, rules)
      if (slot) slots.push(slot)
    }
    for (const child of el.children) visit(child)
  }
  visit(root)
  return slots
}

/** ข้อความในแอตทริบิวต์ (alt, title) — แปลทั้งค่า */
export function attributeSlot(el: Element, name: string): DomSlot | null {
  const value = el.getAttribute(name) ?? ''
  if (!hasWords(value)) return null
  const [lead, core, trail] = splitPadding(value)
  return { segment: plainSegment(core), apply: (t) => el.setAttribute(name, lead + toPlainText(t) + trail) }
}

/** ต่อการประกาศ <?xml …?> เดิมกลับ (XMLSerializer ไม่ใส่ให้) */
export function serializeXml(doc: Document, source: string): string {
  const declaration = /^﻿?\s*(<\?xml[^>]*\?>)/.exec(source)?.[1]
  const body = new XMLSerializer().serializeToString(doc)
  return declaration && !body.startsWith('<?xml') ? `${declaration}\n${body}` : body
}

export function parseXml(source: string, type: DOMParserSupportedType = 'application/xml'): Document {
  const doc = new DOMParser().parseFromString(source, type)
  if (doc.getElementsByTagName('parsererror').length) throw new Error('โครงสร้าง XML ในไฟล์ไม่ถูกต้อง')
  return doc
}

/* ---------- HTML / XHTML ---------- */

const HTML_INLINE = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'button', 'cite', 'data', 'del', 'dfn', 'em', 'font', 'i', 'ins', 'label',
  'mark', 'q', 's', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u',
])
const HTML_SKIP = new Set([
  'script', 'style', 'noscript', 'template', 'code', 'kbd', 'samp', 'var', 'pre', 'svg', 'math', 'textarea',
  'select', 'iframe', 'object', 'canvas', 'video', 'audio',
])

const HTML_SKIP_SELECTOR = [...HTML_SKIP].join(',')

const HTML_RULES: InlineRules = {
  isRoot: (el) => !HTML_INLINE.has(el.localName.toLowerCase()),
  isInline: (el) => HTML_INLINE.has(el.localName.toLowerCase()),
  skip: (el) => HTML_SKIP.has(el.localName.toLowerCase()) || el.getAttribute('translate') === 'no',
  collapseSpace: true,
}

const TRANSLATABLE_ATTRS = ['alt', 'title', 'placeholder', 'aria-label']
const META_NAMES = /^(description|og:title|og:description|twitter:title|twitter:description)$/i

/** ย่อหน้า + แอตทริบิวต์ที่ผู้อ่านเห็น ของเอกสาร HTML/XHTML */
export function htmlSlots(doc: Document): DomSlot[] {
  const root = doc.documentElement
  const slots = collectInlineSlots(root, HTML_RULES)
  for (const el of root.querySelectorAll('*')) {
    if (el.closest(HTML_SKIP_SELECTOR)) continue
    for (const name of TRANSLATABLE_ATTRS) {
      const slot = attributeSlot(el, name)
      if (slot) slots.push(slot)
    }
    if (el.localName === 'meta' && META_NAMES.test(el.getAttribute('name') ?? el.getAttribute('property') ?? '')) {
      const slot = attributeSlot(el, 'content')
      if (slot) slots.push(slot)
    }
  }
  return slots
}

/** หน้าเว็บ: แปลข้อความที่ผู้อ่านเห็น — แท็ก คลาส สคริปต์ สไตล์ และลิงก์คงเดิม */
export const html: FormatHandler = {
  async open(file, { ext, sourceLang, targetLang }) {
    const { text, bom } = await readText(file, sourceLang)
    const doc = new DOMParser().parseFromString(text, 'text/html')
    const slots = htmlSlots(doc)
    const wholeDocument = /<html[\s>]/i.test(text)
    return {
      segments: slots.map((s) => s.segment),
      build: async (tr) => {
        slots.forEach((s, i) => s.apply(tr[i] ?? s.segment))
        if (wholeDocument) doc.documentElement.setAttribute('lang', targetLang)
        doc.querySelector('meta[charset]')?.setAttribute('charset', 'utf-8')
        const out = wholeDocument
          ? `${doc.doctype ? '<!DOCTYPE html>\n' : ''}${doc.documentElement.outerHTML}\n`
          : doc.body.innerHTML
        return textBlob(out, bom, OUTPUT_MIME[ext])
      },
    }
  },
}

/* ---------- XML ทั่วไป ---------- */

/** แปลข้อความในแต่ละ element — ชื่อแท็ก แอตทริบิวต์ และโครงสร้างคงเดิม */
export const xml: FormatHandler = {
  async open(file, { sourceLang }) {
    const { text, bom } = await readText(file, sourceLang)
    const doc = parseXml(text)
    const targets: { node: Node; lead: string; trail: string; core: string }[] = []
    const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_CDATA_SECTION)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const [lead, core, trail] = splitPadding(n.nodeValue ?? '')
      if (hasWords(core)) targets.push({ node: n, lead, trail, core })
    }
    return {
      segments: targets.map((t) => plainSegment(t.core)),
      build: async (tr) => {
        targets.forEach((t, i) => (t.node.nodeValue = t.lead + toPlainText(tr[i] ?? plainSegment(t.core)) + t.trail))
        return textBlob(serializeXml(doc, text), bom, OUTPUT_MIME.xml)
      },
    }
  },
}
