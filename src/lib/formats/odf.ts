import type JSZip from 'jszip'
import { collectInlineSlots, parseXml, serializeXml, type DomSlot, type InlineRules } from './markup'
import { OUTPUT_MIME } from './mime'
import type { FormatHandler } from './types'

/**
 * OpenDocument (LibreOffice: .odt .ods .odp) — zip ของ content.xml + styles.xml
 * ย่อหน้า <text:p>/<text:h> แปลทีละย่อหน้า, <text:span>/<text:a> เป็นรูปแบบภายในบรรทัด
 */

const TEXT = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0'
const OFFICE = 'urn:oasis:names:tc:opendocument:xmlns:office:1.0'

const ODF_RULES: InlineRules = {
  isRoot: (el) => el.namespaceURI === TEXT && (el.localName === 'p' || el.localName === 'h'),
  isInline: (el) => el.namespaceURI === TEXT && (el.localName === 'span' || el.localName === 'a'),
  // คอมเมนต์ของผู้ตรวจ และประวัติการแก้ไข ไม่ใช่เนื้อหาเอกสาร
  skip: (el) =>
    (el.namespaceURI === OFFICE && el.localName === 'annotation') ||
    (el.namespaceURI === TEXT && el.localName === 'tracked-changes'),
}

/** zip ที่ต้องมีไฟล์ mimetype เป็นไฟล์แรกและไม่บีบอัด (ข้อกำหนดของ ODF และ EPUB) */
export async function packageZip(zip: JSZip, mimeType: string): Promise<Blob> {
  const mimetype = await zip.file('mimetype')?.async('string')
  if (mimetype === undefined) return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType })
  const { default: JSZipCtor } = await import('jszip')
  const ordered = new JSZipCtor()
  ordered.file('mimetype', mimetype, { compression: 'STORE' })
  for (const [path, entry] of Object.entries(zip.files)) {
    if (path === 'mimetype') continue
    if (entry.dir) ordered.folder(path)
    else ordered.file(path, await entry.async('uint8array'), { date: entry.date })
  }
  return ordered.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType })
}

export const odf: FormatHandler = {
  async open(file, { ext }) {
    const { default: JSZip } = await import('jszip')
    let zip: JSZip
    try {
      zip = await JSZip.loadAsync(file)
    } catch {
      throw new Error(`เปิดไฟล์ .${ext} ไม่ได้ — ไฟล์อาจเสียหาย หรือถูกตั้งรหัสผ่านไว้`)
    }
    const parts: { path: string; source: string; doc: Document; slots: DomSlot[] }[] = []
    for (const path of ['content.xml', 'styles.xml']) {
      const source = await zip.file(path)?.async('string')
      if (!source) continue
      const doc = parseXml(source)
      const slots = collectInlineSlots(doc.documentElement, ODF_RULES)
      if (slots.length) parts.push({ path, source, doc, slots })
    }
    const slots = parts.flatMap((p) => p.slots)
    return {
      segments: slots.map((s) => s.segment),
      build: async (tr) => {
        slots.forEach((s, i) => s.apply(tr[i] ?? s.segment))
        for (const part of parts) zip.file(part.path, serializeXml(part.doc, part.source))
        return packageZip(zip, OUTPUT_MIME[ext])
      },
    }
  },
}
