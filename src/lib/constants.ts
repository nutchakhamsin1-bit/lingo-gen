import brandGuidelinesPdf from '../assets/samples/brand-guidelines.pdf?inline'
import mangaPageSvg from '../assets/samples/manga-page.svg?inline'
import productOverviewDocx from '../assets/samples/product-overview.docx?inline'
import websiteContentXlsx from '../assets/samples/website-content.xlsx?inline'
import type { FileExt, FileKind, LangCode, Tone, TranslationSettings } from '../types'

export interface LanguageOption {
  code: LangCode
  /** ชื่อที่แสดงใน UI ภาษาไทย */
  label: string
  /** ชื่อในภาษานั้นเอง */
  native: string
  short: string
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'th', label: 'ไทย', native: 'ไทย', short: 'TH' },
  { code: 'en', label: 'อังกฤษ', native: 'English', short: 'EN' },
  { code: 'ja', label: 'ญี่ปุ่น', native: '日本語', short: 'JA' },
  { code: 'zh', label: 'จีน', native: '中文', short: 'ZH' },
  { code: 'fr', label: 'ฝรั่งเศส', native: 'Français', short: 'FR' },
  { code: 'ko', label: 'เกาหลี', native: '한국어', short: 'KO' },
  { code: 'de', label: 'เยอรมัน', native: 'Deutsch', short: 'DE' },
  { code: 'es', label: 'สเปน', native: 'Español', short: 'ES' },
]

export const LANGUAGE_MAP: Record<LangCode, LanguageOption> = Object.fromEntries(
  LANGUAGES.map((l) => [l.code, l]),
) as Record<LangCode, LanguageOption>

export function languageLabel(code: LangCode | 'auto'): string {
  if (code === 'auto') return 'ตรวจจับอัตโนมัติ'
  const l = LANGUAGE_MAP[code]
  return `${l.label} (${l.native})`
}

export const TONES: { value: Tone; label: string; hint: string }[] = [
  { value: 'natural', label: 'เป็นธรรมชาติ', hint: 'อ่านลื่น เหมือนเจ้าของภาษาเขียนเอง' },
  { value: 'formal', label: 'ทางการ / ธุรกิจ', hint: 'สุภาพ เหมาะกับเอกสารองค์กร' },
  { value: 'friendly', label: 'เป็นกันเอง', hint: 'อบอุ่น ใกล้ชิด เหมาะกับคอนเทนต์' },
  { value: 'academic', label: 'วิชาการ', hint: 'แม่นยำ ใช้ศัพท์เฉพาะทาง' },
]

export const TONE_LABEL: Record<Tone, string> = Object.fromEntries(
  TONES.map((t) => [t.value, t.label]),
) as Record<Tone, string>

/** นามสกุลที่รองรับ → หมวดไฟล์ (Record บังคับให้ครบทุกนามสกุลใน FileExt) */
export const FILE_KIND: Record<FileExt, FileKind> = {
  pdf: 'pdf',
  doc: 'document',
  docx: 'document',
  odt: 'document',
  rtf: 'document',
  ppt: 'presentation',
  pptx: 'presentation',
  odp: 'presentation',
  xls: 'spreadsheet',
  xlsx: 'spreadsheet',
  ods: 'spreadsheet',
  csv: 'spreadsheet',
  tsv: 'spreadsheet',
  txt: 'text',
  md: 'text',
  html: 'web',
  htm: 'web',
  xml: 'web',
  json: 'web',
  yaml: 'web',
  yml: 'web',
  po: 'web',
  srt: 'subtitle',
  vtt: 'subtitle',
  epub: 'ebook',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  gif: 'image',
  bmp: 'image',
  tif: 'image',
  tiff: 'image',
  heic: 'image',
  svg: 'image',
}

export const FILE_EXTS = Object.keys(FILE_KIND) as FileExt[]

export const MAX_FILES = 10
export const MAX_FILE_SIZE = 20 * 1024 * 1024

export const KIND_META: Record<FileKind, { label: string; bg: string; fg: string }> = {
  pdf: { label: 'PDF', bg: '#faf0ea', fg: '#c58b6c' },
  document: { label: 'เอกสาร', bg: '#edf2fc', fg: '#91a5cf' },
  presentation: { label: 'สไลด์', bg: '#fcf0e8', fg: '#d19a71' },
  spreadsheet: { label: 'ตาราง', bg: '#eaf5ec', fg: '#84b695' },
  text: { label: 'ข้อความ', bg: '#f1ecf9', fg: '#ab95c6' },
  web: { label: 'เว็บและข้อมูล', bg: '#ebf3f3', fg: '#7fa3a6' },
  subtitle: { label: 'คำบรรยาย', bg: '#f5f1e4', fg: '#b3a06a' },
  ebook: { label: 'อีบุ๊ก', bg: '#f5eef3', fg: '#b48aa6' },
  image: { label: 'รูปภาพ', bg: '#fbeef0', fg: '#cf8f9b' },
}

/** หมวดไฟล์ตามลำดับที่แสดงใน UI พร้อมนามสกุลในหมวด */
export const FILE_KIND_GROUPS: { kind: FileKind; exts: FileExt[] }[] = (Object.keys(KIND_META) as FileKind[]).map(
  (kind) => ({ kind, exts: FILE_EXTS.filter((e) => FILE_KIND[e] === kind) }),
)

export const ACCEPT_ATTR = FILE_EXTS.map((e) => `.${e}`).join(',')

export const DEFAULT_SETTINGS: TranslationSettings = {
  sourceLang: 'auto',
  targetLang: 'th',
  tone: 'natural',
  useGlossary: false,
}

export const SAMPLE_MANGA_NAME = 'Manga page.svg'

/**
 * ไฟล์ตัวอย่างเริ่มต้น — ไฟล์จริงที่แนบมากับแอป (src/assets/samples) แปลผ่านขั้นตอนเดียวกับไฟล์ของผู้ใช้
 * `dataUrl` ฝังไว้ใน bundle จึงสร้าง File ได้ทันทีตอนเปิดแอป
 */
export const SAMPLE_FILES: { name: string; ext: FileExt; dataUrl: string }[] = [
  { name: 'Brand guidelines.pdf', ext: 'pdf', dataUrl: brandGuidelinesPdf },
  { name: 'Product overview.docx', ext: 'docx', dataUrl: productOverviewDocx },
  { name: 'Website content.xlsx', ext: 'xlsx', dataUrl: websiteContentXlsx },
  { name: SAMPLE_MANGA_NAME, ext: 'svg', dataUrl: mangaPageSvg },
]

export const STORAGE_KEYS = {
  settings: 'lingo.settings.v1',
  glossary: 'lingo.glossary.v1',
  history: 'lingo.history.v1',
} as const
