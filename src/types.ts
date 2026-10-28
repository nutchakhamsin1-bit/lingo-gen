export type LangCode = 'th' | 'en' | 'ja' | 'zh' | 'fr' | 'ko' | 'de' | 'es'
export type SourceLang = 'auto' | LangCode
export type Tone = 'natural' | 'formal' | 'friendly' | 'academic'
export type FileKind =
  | 'pdf'
  | 'document'
  | 'presentation'
  | 'spreadsheet'
  | 'text'
  | 'web'
  | 'subtitle'
  | 'ebook'
  | 'image'
export type FileExt =
  | 'pdf'
  | 'doc'
  | 'docx'
  | 'odt'
  | 'rtf'
  | 'ppt'
  | 'pptx'
  | 'odp'
  | 'xls'
  | 'xlsx'
  | 'ods'
  | 'csv'
  | 'tsv'
  | 'txt'
  | 'md'
  | 'html'
  | 'htm'
  | 'xml'
  | 'json'
  | 'yaml'
  | 'yml'
  | 'po'
  | 'srt'
  | 'vtt'
  | 'epub'
  | 'png'
  | 'jpg'
  | 'jpeg'
  | 'webp'
  | 'gif'
  | 'bmp'
  | 'tif'
  | 'tiff'
  | 'heic'
  | 'svg'
export type FileStatus = 'ready' | 'translating' | 'done' | 'error'
export type View = 'translate' | 'history' | 'glossary'

export interface TranslationSettings {
  sourceLang: SourceLang
  targetLang: LangCode
  tone: Tone
  useGlossary: boolean
}

export interface GlossaryEntry {
  id: string
  source: string
  target: string
  createdAt: string
}

/** กรอบข้อความในภาพ — เป็นสัดส่วน 0–1 ของกว้าง/สูงภาพ จึงไม่ขึ้นกับความละเอียดของภาพ */
export interface TextBox {
  x: number
  y: number
  width: number
  height: number
}

/** ข้อความ 1 จุดในภาพ (เช่น 1 ช่องคำพูดในมังงะ) พร้อมคำแปล */
export interface TextRegion {
  id: string
  box: TextBox
  sourceText: string
  translatedText: string
}

/** ผลลัพธ์ของงานแปล 1 ไฟล์ — เก็บการตั้งค่าแบบ snapshot ไว้กับผลลัพธ์เสมอ */
export interface TranslationResult {
  jobId: string
  fileId: string
  fileName: string
  ext: FileExt
  size: number
  isSample: boolean
  /** การตั้งค่า ณ เวลาที่สั่งแปล (ไม่เปลี่ยนตามการตั้งค่าปัจจุบัน) */
  settings: TranslationSettings
  /** ภาษาที่ตรวจจับได้ (ในโหมดทดลองเป็นค่าจำลอง) */
  detectedLang: LangCode | null
  /** ตัวอย่างข้อความต้นฉบับที่อ่านได้จากไฟล์ (null = ไม่พบข้อความให้แปล) */
  sourceText: string | null
  sourceNote: string
  /** ตัวอย่างคำแปล (ไฟล์จริงอยู่ใน outputStore ตาม jobId) */
  translatedText: string
  /** ชื่อไฟล์ที่แปลแล้ว — นามสกุลเดียวกับต้นฉบับ */
  outputName: string
  /** จำนวนส่วนข้อความที่แปล */
  segmentCount: number
  /** ข้อความที่พบในภาพ (เฉพาะไฟล์รูปภาพ) — ใช้วางคำแปลกลับลงในภาพโดยไม่แตะภาพประกอบ */
  textRegions?: TextRegion[]
  glossaryApplied: GlossaryEntry[]
  isDemo: boolean
  startedAt: string
  completedAt: string
}

export interface WorkFile {
  id: string
  name: string
  size: number
  ext: FileExt
  isSample: boolean
  /** File object จริง (เฉพาะไฟล์ที่ผู้ใช้อัปโหลด) */
  file?: File
  status: FileStatus
  progress: number
  error?: string
  result?: TranslationResult
  addedAt: string
}

export interface HistoryEntry {
  id: string
  completedAt: string
  fileName: string
  ext: FileExt
  size: number
  isSample: boolean
  settings: TranslationSettings
  result: TranslationResult
}

export interface Rejection {
  name: string
  reason: string
}
