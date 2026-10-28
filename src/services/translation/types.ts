import type { FileExt, GlossaryEntry, TranslationResult, TranslationSettings } from '../../types'

export interface TranslationRequest {
  fileId: string
  fileName: string
  ext: FileExt
  size: number
  isSample: boolean
  /** ไฟล์ต้นฉบับ (ไฟล์ตัวอย่างก็เป็นไฟล์จริงที่แนบมากับแอป) — Mock service ไม่ส่งไฟล์ไปที่ใด */
  file?: File
  /** snapshot ของการตั้งค่า ณ เวลาสั่งแปล */
  settings: TranslationSettings
  /** snapshot ของคลังคำศัพท์ (ว่างถ้าปิดสวิตช์) */
  glossary: GlossaryEntry[]
}

/** ผลการแปล 1 ไฟล์: ข้อมูลสำหรับแสดงผล + ไฟล์ที่แปลแล้ว (นามสกุลและรูปแบบเดิม) */
export interface TranslationOutcome {
  result: TranslationResult
  output: Blob
}

export interface TranslateOptions {
  signal: AbortSignal
  onProgress: (percent: number) => void
}

/**
 * สัญญาของบริการแปลภาษา — UI คุยกับ interface นี้เท่านั้น
 * เปลี่ยนจาก MockTranslationService เป็น HttpTranslationService ได้โดยไม่ต้องแก้ UI
 */
export interface TranslationService {
  readonly name: string
  /** true = ผลลัพธ์เป็นตัวอย่าง ไม่ได้แปลเนื้อหาจริง */
  readonly isMock: boolean
  translate(request: TranslationRequest, options: TranslateOptions): Promise<TranslationOutcome>
}

export class TranslationAbortError extends Error {
  constructor() {
    super('การแปลถูกยกเลิก')
    this.name = 'TranslationAbortError'
  }
}

export class TranslationFailedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TranslationFailedError'
  }
}

export function isAbortError(err: unknown): boolean {
  return (
    err instanceof TranslationAbortError ||
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  )
}
