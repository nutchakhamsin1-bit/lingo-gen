import { CircleAlert, CloudUpload, X } from 'lucide-react'
import { useId, useRef, useState, type DragEvent } from 'react'
import { ACCEPT_ATTR, FILE_KIND_GROUPS, KIND_META, MAX_FILES, MAX_FILE_SIZE } from '../lib/constants'
import { cx, formatBytes } from '../lib/format'
import type { Rejection } from '../types'

interface UploadDropzoneProps {
  onFiles: (files: File[]) => void
  fileCount: number
  rejections: Rejection[]
  onClearRejections: () => void
}

export function UploadDropzone({ onFiles, fileCount, rejections, onClearRejections }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const id = useId()
  const full = fileCount >= MAX_FILES
  const remaining = Math.max(0, MAX_FILES - fileCount)

  const pick = () => {
    if (full) return
    inputRef.current?.click()
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files ?? [])
    if (files.length) onFiles(files)
  }

  return (
    <section aria-labelledby={`${id}-title`}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-leaf">
            <span className="size-1.5 rounded-full bg-leaf" aria-hidden />
            BATCH TRANSLATION
          </p>
          <h3 id={`${id}-title`} className="mt-1 text-[18px] font-semibold text-ink">
            เริ่มการแปลใหม่
          </h3>
        </div>
        <p className="text-[12.5px] text-faint">ไฟล์อยู่บนอุปกรณ์ของคุณ — ไม่ถูกส่งออกไปภายนอก</p>
      </div>

      <div
        role="button"
        tabIndex={full ? -1 : 0}
        aria-disabled={full || undefined}
        aria-describedby={`${id}-hint`}
        onClick={pick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            pick()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!full) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cx(
          'rounded-card border border-dashed bg-surface px-4 py-7 text-center transition-colors sm:py-9',
          full
            ? 'cursor-not-allowed border-line bg-canvas'
            : dragging
              ? 'cursor-copy border-leaf bg-mint-soft shadow-[inset_0_0_0_1px_#7e9f66]'
              : 'cursor-pointer border-line-strong hover:border-leaf hover:bg-mint-soft',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = ''
            if (files.length) onFiles(files)
          }}
        />
        <span
          className={cx(
            'mx-auto grid size-12 place-items-center rounded-xl',
            dragging ? 'bg-lime text-ink' : 'bg-mint text-leaf',
          )}
          aria-hidden
        >
          <CloudUpload className="size-6" />
        </span>
        <p className="mt-4 text-[15px] font-medium text-ink">
          {full ? `ครบ ${MAX_FILES} ไฟล์ต่อชุดแล้ว` : dragging ? 'ปล่อยไฟล์ที่นี่' : 'ลากไฟล์มาวาง แล้วเริ่มไปด้วยกัน'}
        </p>
        <p className="mt-1.5 text-[13px] text-muted">
          {full ? (
            'ลบไฟล์บางรายการหรือล้างรายการก่อนเพิ่มไฟล์ใหม่'
          ) : (
            <>
              หรือ <span className="font-semibold text-leaf underline-offset-2 hover:underline">เลือกไฟล์จากอุปกรณ์</span> ·
              อัปโหลดได้หลายไฟล์พร้อมกัน
            </>
          )}
        </p>
        <p id={`${id}-hint`} className="mt-4 flex flex-wrap items-center justify-center gap-1.5 text-[11.5px] text-faint">
          {FILE_KIND_GROUPS.map(({ kind, exts }) => (
            <span
              key={kind}
              title={exts.map((e) => e.toUpperCase()).join(', ')}
              className="rounded border border-line px-1.5 py-0.5 font-medium text-muted"
            >
              {KIND_META[kind].label}
            </span>
          ))}
          <span className="ml-1">
            สูงสุด {formatBytes(MAX_FILE_SIZE)} / ไฟล์ · {MAX_FILES} ไฟล์ / ชุด
            {!full && fileCount > 0 && ` · เพิ่มได้อีก ${remaining}`}
          </span>
        </p>
      </div>

      {rejections.length > 0 && (
        <div
          role="alert"
          className="anim-fade-up mt-3 rounded-[10px] border border-[#f1d4d0] bg-danger-soft px-4 py-3 text-[13px] text-danger"
        >
          <div className="flex items-start gap-2.5">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">ไม่สามารถเพิ่ม {rejections.length} ไฟล์</p>
              <ul className="mt-1.5 space-y-1">
                {rejections.map((r, i) => (
                  <li key={`${r.name}-${i}`} className="flex flex-wrap gap-x-1.5">
                    <span className="max-w-full truncate font-medium">{r.name}</span>
                    <span className="text-danger/80">— {r.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              onClick={onClearRejections}
              aria-label="ปิดข้อความแจ้งเตือน"
              className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-md hover:bg-white/60"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
