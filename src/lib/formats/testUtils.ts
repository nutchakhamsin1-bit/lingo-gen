import JSZip from 'jszip'
import type { FileExt } from '../../types'
import { loadFormatHandler } from './index'
import type { OpenOptions } from './types'

/** ใช้ในไฟล์ทดสอบเท่านั้น — เปิดไฟล์ → แปลแต่ละ segment ด้วยฟังก์ชันที่ให้ → สร้างไฟล์ใหม่ */
export async function roundTrip(
  file: File,
  ext: FileExt,
  translate: (segment: string, index: number) => string = pseudo,
  options: Partial<OpenOptions> = {},
): Promise<{ segments: string[]; output: Blob }> {
  const loader = loadFormatHandler(ext)
  if (!loader) throw new Error(`no handler for .${ext}`)
  const doc = await (await loader).open(file, {
    ext,
    sourceLang: 'en',
    targetLang: 'th',
    signal: new AbortController().signal,
    ...options,
  })
  return { segments: doc.segments, output: await doc.build(doc.segments.map(translate)) }
}

/** คำแปลจำลองแบบเดียวกับโหมดทดลอง */
export const pseudo = (segment: string) => `[TH] ${segment}`

export const textFile = (name: string, content: string | Uint8Array) =>
  new File([typeof content === 'string' ? content : (content as Uint8Array<ArrayBuffer>)], name)

export async function zipFile(name: string, files: Record<string, string>, first?: [string, string]): Promise<File> {
  const zip = new JSZip()
  if (first) zip.file(first[0], first[1], { compression: 'STORE' })
  for (const [path, content] of Object.entries(files)) zip.file(path, content)
  return new File([(await zip.generateAsync({ type: 'uint8array' })) as Uint8Array<ArrayBuffer>], name)
}

export async function readZip(blob: Blob): Promise<JSZip> {
  return JSZip.loadAsync(new Uint8Array(await blob.arrayBuffer()))
}

export const blobText = async (blob: Blob) => new TextDecoder().decode(await blob.arrayBuffer())

/** XML ต้องอ่านได้ (ไม่มี parsererror) — โปรแกรม Office จะเปิดไฟล์ไม่ได้ถ้า XML เสีย */
export function parseXmlStrict(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const error = doc.getElementsByTagName('parsererror')[0]
  if (error) throw new Error(`invalid XML: ${error.textContent}`)
  return doc
}
