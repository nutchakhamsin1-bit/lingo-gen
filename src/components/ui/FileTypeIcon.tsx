import { BookOpen, Captions, File, FileCode, FileImage, FileSpreadsheet, FileText, Presentation } from 'lucide-react'
import { FILE_KIND, KIND_META } from '../../lib/constants'
import type { FileExt, FileKind } from '../../types'

const icons: Record<FileKind, typeof File> = {
  pdf: FileText,
  document: FileText,
  presentation: Presentation,
  spreadsheet: FileSpreadsheet,
  text: File,
  web: FileCode,
  subtitle: Captions,
  ebook: BookOpen,
  image: FileImage,
}

export function FileTypeIcon({ ext, size = 'md' }: { ext: FileExt; size?: 'sm' | 'md' }) {
  // ประวัติเก่าใน localStorage อาจมีนามสกุลที่ไม่รู้จัก — ใช้หมวดข้อความเป็นค่าสำรอง
  const kind = FILE_KIND[ext] ?? 'text'
  const meta = KIND_META[kind]
  const Icon = icons[kind]
  const label = ext.toUpperCase()
  const dim = size === 'sm' ? 'h-9 w-8' : 'h-11 w-10'
  return (
    <span
      className={`relative grid shrink-0 place-items-center rounded-lg ${dim}`}
      style={{ background: meta.bg, color: meta.fg }}
      aria-label={`ไฟล์ ${label} (${meta.label})`}
      role="img"
    >
      <Icon className={size === 'sm' ? 'size-4 opacity-60' : 'size-5 opacity-60'} aria-hidden />
      <b
        className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded-[3px] px-1 text-[8px] font-semibold tracking-wide text-white"
        style={{ background: meta.fg }}
        aria-hidden
      >
        {label}
      </b>
    </span>
  )
}
