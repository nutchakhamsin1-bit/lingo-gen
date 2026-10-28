import type { FileExt, LangCode } from '../../types'
import { parseXml, serializeXml } from './markup'
import { OUTPUT_MIME } from './mime'
import { encodePieces, groupsInOrder, hasWords, looksLikeText, parsePieces, toPlainText, type Piece } from './segments'
import type { FormatHandler } from './types'

/**
 * Word / PowerPoint / Excel (Office Open XML = zip ของไฟล์ XML)
 * แปลเฉพาะข้อความใน run (<w:t> <a:t> <t>) — สไตล์ ตาราง รูป กราฟ หัว/ท้ายกระดาษ และ layout คงเดิม
 */

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const XML_NS = 'http://www.w3.org/XML/1998/namespace'

/** ภาษาของ run ใน PowerPoint — โปรแกรมใช้เลือกฟอนต์และตรวจคำสะกดให้ตรงภาษา */
const DRAWING_LANG: Record<LangCode, string> = {
  th: 'th-TH', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN', fr: 'fr-FR', ko: 'ko-KR', de: 'de-DE', es: 'es-ES',
}

interface Dialect {
  ns: string
  /** ย่อหน้า */
  para: string
  /** ข้อความใน run */
  text: string
  /** แท็บ/ขึ้นบรรทัดภายใน run — คงไว้เป็น <xN/> */
  inRun: Set<string>
  /** ขึ้นบรรทัดระดับย่อหน้า (PowerPoint: <a:br/>) */
  inPara: Set<string>
  /** ต้องใส่ xml:space="preserve" ให้ช่องว่างหน้า/หลังไม่หาย */
  preserveSpace: boolean
  /** ใช้เกณฑ์เข้มสำหรับข้อมูล (Excel) — ไม่แปลรหัส/ลิงก์ */
  strict: boolean
}

const WORD: Dialect = {
  ns: W, para: 'p', text: 't', inRun: new Set(['tab', 'br', 'cr', 'noBreakHyphen', 'softHyphen']), inPara: new Set(),
  preserveSpace: true, strict: false,
}
const DRAWING: Dialect = {
  ns: A, para: 'p', text: 't', inRun: new Set(), inPara: new Set(['br']), preserveSpace: false, strict: false,
}
const sheet = (para: 'si' | 'is'): Dialect => ({
  ns: S, para, text: 't', inRun: new Set(), inPara: new Set(), preserveSpace: true, strict: true,
})

interface Slot {
  segment: string
  apply(translation: string): void
}

const localIs = (n: Node | null, ns: string, name: string): boolean =>
  n instanceof Element && n.namespaceURI === ns && n.localName === name

function closestPara(el: Element, d: Dialect): Element | null {
  for (let n = el.parentElement; n; n = n.parentElement) if (localIs(n, d.ns, d.para)) return n
  return null
}

/** run ที่มีข้อความ: ลูกโดยตรงที่เป็น <t> */
const textRunOf = (run: Element, d: Dialect) => [...run.children].some((c) => localIs(c, d.ns, d.text))

function setText(el: Element, value: string, d: Dialect) {
  el.textContent = value
  if (d.preserveSpace) el.setAttributeNS(XML_NS, 'xml:space', 'preserve')
}

/** ย่อหน้าหนึ่ง → segment: run ที่รูปแบบเหมือนกันและอยู่ติดกันรวมเป็นกลุ่มเดียว ต่างรูปแบบห่อด้วย <gN> */
function paragraphSlot(p: Element, d: Dialect, targetLang: LangCode): Slot | null {
  const doc = p.ownerDocument

  // Excel: <si><t>ข้อความ</t></si> ไม่มี run
  const direct = [...p.children].find((c) => localIs(c, d.ns, d.text))
  if (direct && ![...p.children].some((c) => localIs(c, d.ns, 'r'))) {
    const value = direct.textContent ?? ''
    if (!(d.strict ? looksLikeText(value) : hasWords(value))) return null
    return {
      segment: encodePieces([{ type: 'text', text: value }]),
      apply: (t) => setText(direct, toPlainText(t), d),
    }
  }

  // run ของย่อหน้านี้ (ไม่รวม run ในย่อหน้าซ้อน เช่น กล่องข้อความ) และขึ้นบรรทัดระดับย่อหน้า ตามลำดับเอกสาร
  const items = [...p.getElementsByTagNameNS(d.ns, '*')].filter(
    (el) =>
      (el.localName === 'r' && closestPara(el, d) === p && textRunOf(el, d)) ||
      (d.inPara.has(el.localName) && el.parentElement === p),
  )
  if (!items.length) return null

  type Group = { runs: Element[]; key: string; parent: Node | null; content: Piece[] }
  const groups: Group[] = []
  const nodes: Node[] = [] // id → ขึ้นบรรทัด/แท็บ (<xN/>) — id ของกลุ่มอยู่ช่วงเดียวกัน
  const groupIdOf = new Map<Group, number>()
  const top: Piece[] = []
  const serializer = new XMLSerializer()
  let current: Group | null = null

  for (const item of items) {
    if (item.localName !== 'r') {
      current = null
      const id = nodes.push(item)
      top.push({ type: 'x', id })
      continue
    }
    const props = [...item.children].find((c) => c.localName === 'rPr')
    const key = props ? serializer.serializeToString(props) : ''
    if (!current || current.key !== key || current.parent !== item.parentNode) {
      current = { runs: [], key, parent: item.parentNode, content: [] }
      groups.push(current)
      const id = nodes.push(item)
      groupIdOf.set(current, id)
      top.push({ type: 'g', id, children: current.content })
    }
    current.runs.push(item)
    for (const c of item.children) {
      if (localIs(c, d.ns, d.text)) current.content.push({ type: 'text', text: c.textContent ?? '' })
      else if (c.localName !== 'rPr') current.content.push({ type: 'x', id: nodes.push(c) })
    }
  }

  const plain = toPlainText(encodePieces(top))
  if (!(d.strict ? looksLikeText(plain) : hasWords(plain))) return null
  const single = groups.length === 1 && top.length === 1
  const segment = single ? encodePieces(groups[0].content) : encodePieces(top)
  const groupById = new Map([...groupIdOf].map(([g, id]) => [id, g]))
  // ชื่อแท็กพร้อม prefix เดิม (w:t / a:t / t) — จำไว้ก่อนเริ่มล้างข้อความเดิม
  const textTag = p.getElementsByTagNameNS(d.ns, d.text)[0]?.tagName ?? d.text

  /** ล้างข้อความเดิมใน run แล้วใส่เนื้อหาใหม่ (คงรูปแบบ <rPr>) */
  const fill = (run: Element, content: Piece[]) => {
    for (const c of [...run.children]) if (c.localName !== 'rPr') c.remove()
    // ข้อความที่อยู่ติดกันรวมเป็น <t> เดียว (PowerPoint/Excel ยอมให้ 1 run มี <a:t>/<t> ได้ตัวเดียว)
    let buffer = ''
    const flush = () => {
      if (!buffer) return
      const t = doc.createElementNS(d.ns, textTag)
      setText(t, buffer, d)
      run.appendChild(t)
      buffer = ''
    }
    for (const piece of content) {
      if (piece.type === 'text') buffer += piece.text
      else if (piece.type === 'x' && nodes[piece.id - 1] && !groupById.has(piece.id)) {
        flush()
        run.appendChild(nodes[piece.id - 1])
      }
    }
    flush()
    if (d === DRAWING) [...run.children].find((c) => c.localName === 'rPr')?.setAttribute('lang', DRAWING_LANG[targetLang])
  }

  return {
    segment,
    apply(translation) {
      const pieces = parsePieces(translation)
      if (single) {
        const [first, ...rest] = groups[0].runs
        fill(first, pieces.flatMap((p) => (p.type === 'g' ? p.children : [p])))
        rest.forEach((r) => r.remove())
        return
      }
      const order = groupsInOrder(
        pieces.filter((p) => p.type !== 'x' || !groupById.has(p.id)),
        groupIdOf.get(groups[0]) ?? 1,
      )
      const sameParent = groups.every((g) => g.parent === groups[0].parent) && items.every((i) => i.parentNode === groups[0].parent)
      if (sameParent) {
        // เรียง run ใหม่ตามลำดับคำแปล (ภาษาปลายทางอาจสลับตำแหน่งคำที่เป็นตัวหนา)
        const anchor = items[0]
        const parent = anchor.parentNode!
        const usedBreaks = new Set<number>()
        for (const entry of order) {
          const group = groupById.get(entry.id)
          if (!group) continue
          const shell = group.runs[0].cloneNode(false) as Element
          const props = [...group.runs[0].children].find((c) => c.localName === 'rPr')
          if (props) shell.appendChild(props.cloneNode(true))
          // ขึ้นบรรทัดระดับย่อหน้าที่อยู่ในคำแปล วางแทรกระหว่าง run
          // run ที่ไม่มีข้อความไม่ต้องใส่ (PowerPoint ถือว่า <a:r> ที่ไม่มี <a:t> เป็นไฟล์เสีย)
          const hasContent = (pieces: Piece[]) => pieces.some((p) => (p.type === 'text' ? p.text : p.type === 'x'))
          const inline: Piece[] = []
          for (const piece of entry.content) {
            if (piece.type === 'x' && items.includes(nodes[piece.id - 1] as Element)) {
              if (hasContent(inline)) {
                const part = shell.cloneNode(true) as Element
                fill(part, inline.splice(0))
                parent.insertBefore(part, anchor)
              } else inline.length = 0
              usedBreaks.add(piece.id)
              const lineBreak = nodes[piece.id - 1] as Element
              if (d === DRAWING) [...lineBreak.children].find((c) => c.localName === 'rPr')?.setAttribute('lang', DRAWING_LANG[targetLang])
              parent.insertBefore(lineBreak, anchor)
            } else inline.push(piece)
          }
          if (hasContent(inline)) {
            fill(shell, inline)
            parent.insertBefore(shell, anchor)
          }
        }
        // ขึ้นบรรทัดที่ผู้แปลทำหาย วางต่อท้ายตามลำดับเดิม
        top.forEach((p) => {
          if (p.type === 'x' && !usedBreaks.has(p.id)) parent.insertBefore(nodes[p.id - 1], anchor)
        })
        for (const g of groups) g.runs.forEach((r) => r.remove())
        return
      }
      // run อยู่คนละที่ (เช่น บางส่วนเป็นลิงก์) — ใส่คำแปลแต่ละกลุ่มกลับที่เดิม
      for (const g of groups) {
        const id = groupIdOf.get(g)!
        const content = order.filter((o) => o.id === id).flatMap((o) => o.content)
        const [first, ...rest] = g.runs
        fill(first, content)
        rest.forEach((r) => r.remove())
      }
    },
  }
}

function partSlots(doc: Document, dialects: Dialect[], targetLang: LangCode): Slot[] {
  const slots: Slot[] = []
  for (const d of dialects) {
    for (const p of [...doc.getElementsByTagNameNS(d.ns, d.para)]) {
      const slot = paragraphSlot(p, d, targetLang)
      if (slot) slots.push(slot)
    }
  }
  return slots
}

/** ส่วนของไฟล์ที่มีข้อความให้ผู้อ่านเห็น */
function dialectsFor(ext: FileExt, path: string, xml: string): Dialect[] {
  const has = (ns: string) => xml.includes(ns)
  if (ext === 'docx') {
    if (/^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(path)) return [WORD, ...(has(A) ? [DRAWING] : [])]
    if (/^word\/(charts|diagrams)\/[^/]+\.xml$/.test(path)) return [DRAWING]
  }
  if (ext === 'pptx' && /^ppt\/(slides\/slide|notesSlides\/notesSlide|diagrams\/(data|drawing)|charts\/chart)\d*\.xml$/.test(path)) {
    return [DRAWING]
  }
  if (ext === 'xlsx') {
    if (path === 'xl/sharedStrings.xml') return [sheet('si')]
    if (/^xl\/worksheets\/sheet\d+\.xml$/.test(path) && xml.includes('inlineStr')) return [sheet('is')]
    if (/^xl\/(drawings\/drawing|charts\/chart)\d+\.xml$/.test(path)) return [DRAWING]
  }
  return []
}

export const ooxml: FormatHandler = {
  async open(file, { ext, targetLang }) {
    const { default: JSZip } = await import('jszip')
    let zip: InstanceType<typeof JSZip>
    try {
      zip = await JSZip.loadAsync(file)
    } catch {
      throw new Error(`เปิดไฟล์ .${ext} ไม่ได้ — ไฟล์อาจเสียหาย หรือถูกตั้งรหัสผ่านไว้`)
    }
    const parts: { path: string; source: string; doc: Document; slots: Slot[] }[] = []
    for (const path of Object.keys(zip.files).sort()) {
      if (!path.endsWith('.xml') || zip.files[path].dir) continue
      const source = await zip.files[path].async('string')
      const dialects = dialectsFor(ext, path, source)
      if (!dialects.length) continue
      const doc = parseXml(source)
      const slots = partSlots(doc, dialects, targetLang)
      if (slots.length) parts.push({ path, source, doc, slots })
    }
    const slots = parts.flatMap((p) => p.slots)
    return {
      segments: slots.map((s) => s.segment),
      build: async (tr) => {
        slots.forEach((s, i) => s.apply(tr[i] ?? s.segment))
        for (const part of parts) zip.file(part.path, serializeXml(part.doc, part.source))
        return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: OUTPUT_MIME[ext] })
      },
    }
  },
}
