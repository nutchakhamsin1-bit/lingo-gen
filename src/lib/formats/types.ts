import type { FileExt, LangCode, SourceLang, TextRegion } from '../../types'

export interface OpenOptions {
  ext: FileExt
  sourceLang: SourceLang
  targetLang: LangCode
  signal: AbortSignal
  /** 0–1 สำหรับขั้นเปิดไฟล์ (รวม OCR) */
  onProgress?: (ratio: number) => void
  /** กรอบข้อความที่เตรียมไว้แล้ว (ภาพตัวอย่าง) — ข้าม OCR */
  presetRegions?: TextRegion[]
}

/** ไฟล์ที่เปิดแล้ว: ข้อความที่ต้องแปล + วิธีสร้างไฟล์ใหม่ในรูปแบบเดิม */
export interface OpenedDocument {
  /** ข้อความที่ต้องแปลตามลำดับในเอกสาร (รูปแบบ segment — ดู segments.ts) */
  segments: string[]
  /** สร้างไฟล์ใหม่ นามสกุลและรูปแบบเดิม โดยแทนข้อความด้วยคำแปลตามลำดับ segments */
  build(translations: string[]): Promise<Blob>
  /** กรอบข้อความในภาพ (เฉพาะรูปภาพ) — ลำดับตรงกับ segments */
  regions?: TextRegion[]
  /** หมายเหตุที่แสดงใต้หัวข้อ "ต้นฉบับ" เช่น ผล OCR */
  note?: string
}

export interface FormatHandler {
  open(file: File, options: OpenOptions): Promise<OpenedDocument>
}
