import { Download, ImageOff } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FILE_KIND, LANGUAGE_MAP, TONE_LABEL, languageLabel } from '../lib/constants'
import { formatBytes, formatDateTime } from '../lib/format'
import { renderTranslatedImage } from '../lib/imageText'
import type { LangCode, TextRegion, TranslationResult } from '../types'
import { DemoNotice } from './DemoNotice'
import { Button } from './ui/Button'
import { FileTypeIcon } from './ui/FileTypeIcon'
import { Modal } from './ui/Modal'

interface TranslationPreviewProps {
  result: TranslationResult | null
  /** ไฟล์ต้นฉบับบนเครื่อง (ถ้ายังอยู่ในรายการ) — ใช้แสดงภาพต้นฉบับและภาพที่แปลแล้ว */
  sourceFile?: File
  onClose: () => void
  /** ดาวน์โหลดไฟล์ที่แปลแล้ว (นามสกุลและรูปแบบเดิม) */
  onDownload: (result: TranslationResult) => void
}

export function TranslationPreview({ result, sourceFile, onClose, onDownload }: TranslationPreviewProps) {
  const open = !!result
  const r = result
  const s = r?.settings
  const regions = r?.textRegions ?? []
  const isImage = !!r && FILE_KIND[r.ext] === 'image'
  const imageMode = isImage && regions.length > 0 && !!sourceFile
  // ตัวอย่างคำแปลเป็นค่าจำลอง ยกเว้นไฟล์ตัวอย่างที่มีคำแปลจริงเตรียมไว้ (หน้ามังงะ)
  const pseudo = !!r?.isDemo && !(r.isSample && regions.length)

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={
        r ? (
          <span className="flex items-center gap-3">
            <FileTypeIcon ext={r.ext} size="sm" />
            <span className="min-w-0">
              <span className="block truncate">{r.fileName}</span>
              <span className="block text-[12.5px] font-normal text-faint">
                {formatBytes(r.size)}
                {r.isSample ? ' · ไฟล์ตัวอย่าง' : ''} · แปลเสร็จ {formatDateTime(r.completedAt)}
              </span>
            </span>
          </span>
        ) : (
          ''
        )
      }
      footer={
        r && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 text-[12.5px] text-faint">
              ดาวน์โหลดเป็น <span className="break-all font-medium text-muted">{r.outputName}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={onClose}>
                ปิด
              </Button>
              <Button variant="primary" leading={<Download className="size-4" aria-hidden />} onClick={() => onDownload(r)}>
                ดาวน์โหลด .{r.ext}
              </Button>
            </div>
          </div>
        )
      }
    >
      {r && s && (
        <div className="px-5 py-5 sm:px-6">
          <div className="mb-4 flex flex-wrap gap-2 text-[12.5px]">
            <Chip label="ต้นฉบับ" value={`${languageLabel(s.sourceLang)}${s.sourceLang === 'auto' && r.detectedLang ? ` → ${LANGUAGE_MAP[r.detectedLang].label} (จำลอง)` : ''}`} />
            <Chip label="ปลายทาง" value={languageLabel(s.targetLang)} />
            <Chip label="โทน" value={TONE_LABEL[s.tone]} />
            <Chip label="คลังคำศัพท์" value={s.useGlossary ? `เปิด · ${r.glossaryApplied.length} คำ` : 'ปิด'} />
            {r.segmentCount > 0 && <Chip label="แปล" value={`${r.segmentCount.toLocaleString()} ส่วน`} />}
          </div>
          <DemoNotice compact className="mb-5" />

          <div className="grid gap-4 md:grid-cols-2">
            <Pane title="ต้นฉบับ" note={r.sourceNote} text={r.sourceText}>
              {isImage &&
                (sourceFile ? (
                  <ImageSource key={r.jobId} file={sourceFile} ext={r.ext} regions={regions} />
                ) : (
                  <p className="py-8 text-center text-[13px] text-muted">
                    ภาพต้นฉบับไม่ได้เก็บไว้ในประวัติ — ดาวน์โหลดไฟล์เพื่อดูภาพที่แปลแล้ว
                  </p>
                ))}
            </Pane>
            {imageMode && sourceFile ? (
              <Pane
                title={`ภาพที่แปลแล้ว · ${LANGUAGE_MAP[s.targetLang].native}`}
                note={
                  pseudo
                    ? 'โหมดทดลอง: ยังไม่ได้แปลจริง — วางข้อความที่ OCR อ่านได้พร้อมรหัสภาษาไว้ตำแหน่งที่จะวางคำแปล'
                    : 'แปลเฉพาะข้อความ แล้ววางกลับตำแหน่งเดิม — ภาพประกอบไม่ถูกแตะ'
                }
                text={null}
                highlight
              >
                <TranslatedImage key={r.jobId} file={sourceFile} regions={regions} lang={s.targetLang} />
              </Pane>
            ) : (
              <Pane
                title={`คำแปล · ${LANGUAGE_MAP[s.targetLang].native}`}
                note={
                  pseudo
                    ? 'โหมดทดลอง: คำแปลจำลอง [รหัสภาษา] + ข้อความเดิม — ไฟล์ที่ดาวน์โหลดใช้ข้อความชุดนี้'
                    : `ตัวอย่างข้อความในไฟล์ ${r.outputName}`
                }
                text={r.translatedText}
                highlight
              />
            )}
          </div>

          {regions.length > 0 && (
            <section className="mt-5 overflow-hidden rounded-[10px] border border-line">
              <header className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line bg-canvas px-4 py-2.5">
                <p className="text-[13px] font-semibold text-ink">ข้อความในภาพ · {regions.length} จุด</p>
                <p className="text-[11.5px] text-faint">แปลเฉพาะข้อความ ภาพประกอบคงเดิม</p>
              </header>
              <ol className="divide-y divide-line bg-surface">
                {regions.map((g, i) => (
                  <li
                    key={g.id}
                    className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-3 gap-y-0.5 px-4 py-2.5 sm:grid-cols-[24px_minmax(0,1fr)_minmax(0,1fr)]"
                  >
                    <span className="grid size-6 place-items-center rounded-full bg-ink text-[11px] font-semibold text-white">
                      {i + 1}
                    </span>
                    <p className="text-[13px] text-muted">{g.sourceText}</p>
                    <p className="col-start-2 text-[13.5px] font-medium text-ink sm:col-start-auto">{g.translatedText}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {r.glossaryApplied.length > 0 && (
            <div className="mt-5 rounded-[10px] border border-line bg-canvas/60 px-4 py-3">
              <p className="text-[13px] font-semibold text-ink">คลังคำศัพท์ที่แนบไปกับงานนี้ ({r.glossaryApplied.length})</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {r.glossaryApplied.map((g) => (
                  <li key={g.id} className="rounded-md border border-line bg-surface px-2 py-1 text-[12.5px]">
                    <span className="text-muted">{g.source}</span> <span className="text-faint">→</span>{' '}
                    <span className="font-medium text-ink">{g.target}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-canvas px-2">
      <span className="text-faint">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </span>
  )
}

function Pane({
  title,
  note,
  text,
  highlight,
  children,
}: {
  title: string
  note: string
  text: string | null
  highlight?: boolean
  children?: ReactNode
}) {
  return (
    <section className="flex min-h-[240px] flex-col overflow-hidden rounded-[10px] border border-line">
      <header className={`border-b border-line px-4 py-2.5 ${highlight ? 'bg-mint' : 'bg-canvas'}`}>
        <p className="text-[13px] font-semibold text-ink">{title}</p>
        <p className="text-[11.5px] text-faint">{note}</p>
      </header>
      <div className="flex-1 bg-surface px-4 py-3">
        {children ? (
          children
        ) : text ? (
          <pre className="max-h-[48vh] overflow-auto whitespace-pre-wrap font-sans text-[13.5px] leading-relaxed text-ink">{text}</pre>
        ) : (
          <p className="py-8 text-center text-[13px] text-muted">ยังไม่ได้อ่านเนื้อหาไฟล์นี้ในโหมดทดลอง</p>
        )}
      </div>
    </section>
  )
}

function ImageSource({ file, ext, regions }: { file: File; ext: string; regions: TextRegion[] }) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [failed, setFailed] = useState(false)

  // object URL ผูกกับอายุของ component — คืนหน่วยความจำเมื่อปิดหน้าเปรียบเทียบ
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file)
    if (imgRef.current) imgRef.current.src = objectUrl
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  if (failed) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center text-[13px] text-muted">
        <ImageOff className="size-5 text-faint" aria-hidden />
        <p>เบราว์เซอร์นี้แสดงตัวอย่างไฟล์ .{ext} ไม่ได้ แต่ยังส่งแปลได้ตามปกติ</p>
      </div>
    )
  }
  return (
    <div className="relative mx-auto w-fit max-w-full">
      <img
        ref={imgRef}
        alt={`ภาพต้นฉบับ ${file.name}`}
        onError={() => setFailed(true)}
        className="block max-h-[48vh] w-auto max-w-full rounded-md object-contain"
      />
      {/* กรอบข้อความที่พบในภาพ — เลขตรงกับรายการ "ข้อความในภาพ" ด้านล่าง */}
      {regions.map((g, i) => (
        <span
          key={g.id}
          aria-hidden
          className="pointer-events-none absolute rounded-[4px] border-2 border-dashed border-leaf"
          style={{
            left: `${g.box.x * 100}%`,
            top: `${g.box.y * 100}%`,
            width: `${g.box.width * 100}%`,
            height: `${g.box.height * 100}%`,
          }}
        >
          <b className="absolute -left-2.5 -top-2.5 grid size-5 place-items-center rounded-full bg-ink text-[10px] font-semibold text-white">
            {i + 1}
          </b>
        </span>
      ))}
    </div>
  )
}

function TranslatedImage({ file, regions, lang }: { file: File; regions: TextRegion[]; lang: LangCode }) {
  const [state, setState] = useState<{ url: string } | { error: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    let url: string | undefined
    renderTranslatedImage(file, regions, lang).then(
      (blob) => {
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setState({ url })
      },
      (err: unknown) => {
        if (!cancelled) setState({ error: err instanceof Error ? err.message : 'สร้างภาพที่แปลแล้วไม่สำเร็จ' })
      },
    )
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [file, regions, lang])

  if (!state) return <div className="min-h-[200px]" aria-busy="true" />
  if ('error' in state) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center text-[13px] text-muted">
        <ImageOff className="size-5 text-faint" aria-hidden />
        <p>{state.error} — ดาวน์โหลดไฟล์เพื่อดูผลลัพธ์</p>
      </div>
    )
  }
  return (
    <img
      src={state.url}
      alt={`ภาพ ${file.name} ที่แปลข้อความแล้ว`}
      className="mx-auto block max-h-[48vh] w-auto max-w-full rounded-md object-contain"
    />
  )
}
