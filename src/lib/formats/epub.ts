import type JSZip from 'jszip'
import { htmlSlots, parseXml, serializeXml, type DomSlot } from './markup'
import { OUTPUT_MIME } from './mime'
import { hasWords, plainSegment, splitPadding, toPlainText } from './segments'
import { packageZip } from './odf'
import type { FormatHandler } from './types'

/**
 * อีบุ๊ก EPUB — zip ของหน้า XHTML + สารบัญ + ข้อมูลหนังสือ
 * แปลเนื้อหาทุกบท สารบัญ (nav/toc.ncx) และชื่อ/คำอธิบายหนังสือ — สไตล์ รูป และฟอนต์คงเดิม
 */

const DC = 'http://purl.org/dc/elements/1.1/'

function textSlots(elements: Element[]): DomSlot[] {
  return elements.flatMap((el) => {
    const [lead, core, trail] = splitPadding(el.textContent ?? '')
    if (!hasWords(core)) return []
    return [{ segment: plainSegment(core), apply: (t: string) => (el.textContent = lead + toPlainText(t) + trail) }]
  })
}

export const epub: FormatHandler = {
  async open(file, { targetLang }) {
    const { default: JSZipCtor } = await import('jszip')
    let zip: JSZip
    try {
      zip = await JSZipCtor.loadAsync(file)
    } catch {
      throw new Error('เปิดไฟล์ .epub ไม่ได้ — ไฟล์อาจเสียหาย')
    }
    const container = await zip.file('META-INF/container.xml')?.async('string')
    const opfPath = container && /full-path="([^"]+)"/.exec(container)?.[1]
    const opfSource = opfPath ? await zip.file(opfPath)?.async('string') : undefined
    if (!opfPath || !opfSource) throw new Error('ไม่พบสารบัญของอีบุ๊ก (OPF) — ไฟล์ .epub นี้ไม่สมบูรณ์')
    const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''
    const opf = parseXml(opfSource)

    const parts: { path: string; source: string; doc: Document; slots: DomSlot[] }[] = []
    // ชื่อและคำอธิบายหนังสือ + ภาษาของหนังสือเป็นภาษาปลายทาง
    const meta = [...opf.getElementsByTagNameNS(DC, 'title'), ...opf.getElementsByTagNameNS(DC, 'description')]
    const opfSlots = textSlots(meta)
    for (const lang of opf.getElementsByTagNameNS(DC, 'language')) {
      opfSlots.push({ segment: '', apply: () => (lang.textContent = targetLang) })
    }

    for (const item of opf.getElementsByTagName('item')) {
      const type = item.getAttribute('media-type') ?? ''
      const href = decodeURIComponent(item.getAttribute('href') ?? '')
      const path = base + href
      const source = await zip.file(path)?.async('string')
      if (!source) continue
      if (type === 'application/xhtml+xml') {
        const doc = parseXml(source, 'application/xhtml+xml')
        doc.documentElement.setAttribute('lang', targetLang)
        doc.documentElement.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:lang', targetLang)
        const slots = htmlSlots(doc)
        if (slots.length) parts.push({ path, source, doc, slots })
      } else if (type === 'application/x-dtbncx+xml') {
        const doc = parseXml(source)
        const slots = textSlots([...doc.getElementsByTagName('text')])
        if (slots.length) parts.push({ path, source, doc, slots })
      }
    }
    parts.unshift({ path: opfPath, source: opfSource, doc: opf, slots: opfSlots })

    // ช่องที่ไม่มีข้อความ (ตั้งค่าภาษา) ไม่ต้องส่งแปล แต่ต้องทำตอนประกอบไฟล์
    const all = parts.flatMap((p) => p.slots)
    const toTranslate = all.filter((s) => s.segment)
    return {
      segments: toTranslate.map((s) => s.segment),
      build: async (tr) => {
        toTranslate.forEach((s, i) => s.apply(tr[i] ?? s.segment))
        all.filter((s) => !s.segment).forEach((s) => s.apply(''))
        for (const part of parts) zip.file(part.path, serializeXml(part.doc, part.source))
        return packageZip(zip, OUTPUT_MIME.epub)
      },
    }
  },
}
