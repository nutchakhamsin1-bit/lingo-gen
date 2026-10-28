import type { FileExt, LangCode } from '../../types'
import { LANGUAGE_MAP } from '../constants'
import { baseName, safeFileName } from '../format'
import type { FormatHandler } from './types'

export type { FormatHandler, OpenedDocument, OpenOptions } from './types'
export { OUTPUT_MIME } from './mime'

/** ตัวจัดการแต่ละประเภทไฟล์ — โหลดเมื่อใช้งานจริงเท่านั้น (ไลบรารี PDF/OCR มีขนาดใหญ่) */
const HANDLERS: Partial<Record<FileExt, () => Promise<FormatHandler>>> = {
  txt: async () => (await import('./text')).plainText,
  md: async () => (await import('./text')).markdown,
  srt: async () => (await import('./text')).subtitles,
  vtt: async () => (await import('./text')).subtitles,
  po: async () => (await import('./text')).gettext,
  csv: async () => (await import('./table')).delimited,
  tsv: async () => (await import('./table')).delimited,
  json: async () => (await import('./data')).json,
  yaml: async () => (await import('./data')).yaml,
  yml: async () => (await import('./data')).yaml,
  html: async () => (await import('./markup')).html,
  htm: async () => (await import('./markup')).html,
  xml: async () => (await import('./markup')).xml,
  docx: async () => (await import('./ooxml')).ooxml,
  pptx: async () => (await import('./ooxml')).ooxml,
  xlsx: async () => (await import('./ooxml')).ooxml,
  odt: async () => (await import('./odf')).odf,
  ods: async () => (await import('./odf')).odf,
  odp: async () => (await import('./odf')).odf,
  epub: async () => (await import('./epub')).epub,
  rtf: async () => (await import('./rtf')).rtf,
  pdf: async () => (await import('./pdf')).pdf,
  png: async () => (await import('./image')).image,
  jpg: async () => (await import('./image')).image,
  jpeg: async () => (await import('./image')).image,
  webp: async () => (await import('./image')).image,
  gif: async () => (await import('./image')).image,
  bmp: async () => (await import('./image')).image,
  tif: async () => (await import('./image')).image,
  tiff: async () => (await import('./image')).image,
  svg: async () => (await import('./image')).image,
}

/** สร้างไฟล์ผลลัพธ์ในเบราว์เซอร์ได้หรือไม่ — ที่เหลือ (DOC XLS PPT HEIC รุ่นเก่า/ปิด) ต้องให้เซิร์ฟเวอร์แปลง */
export const canBuildLocally = (ext: FileExt) => ext in HANDLERS

export function loadFormatHandler(ext: FileExt): Promise<FormatHandler> | null {
  return HANDLERS[ext]?.() ?? null
}

export function serverOnlyMessage(ext: FileExt): string {
  const modern: Partial<Record<FileExt, string>> = { doc: 'DOCX', xls: 'XLSX', ppt: 'PPTX', heic: 'JPG' }
  return `ไฟล์ .${ext} สร้างใหม่ในเบราว์เซอร์ไม่ได้ — บันทึกเป็น .${(modern[ext] ?? 'PDF').toLowerCase()} แล้วเพิ่มอีกครั้ง หรือเชื่อมต่อเซิร์ฟเวอร์แปลที่รองรับไฟล์นี้`
}

/** ชื่อไฟล์ที่แปลแล้ว: ชื่อเดิม + รหัสภาษาปลายทาง + นามสกุลเดิม (โหมดทดลองขึ้นต้นด้วย DEMO_) */
export function outputFileName(fileName: string, targetLang: LangCode, demo: boolean): string {
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1] ?? ''
  const name = `${demo ? 'DEMO_' : ''}${baseName(fileName)}_${LANGUAGE_MAP[targetLang].short}`
  return safeFileName(ext ? `${name}.${ext}` : name)
}
