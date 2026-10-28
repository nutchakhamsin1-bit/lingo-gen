import { Archive, Download, Eye, FolderOpen, RefreshCw, Search, Trash, X } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { cx, formatBytes } from '../lib/format'
import { LANGUAGE_MAP } from '../lib/constants'
import type { WorkFile } from '../types'
import { Button } from './ui/Button'
import { FileTypeIcon } from './ui/FileTypeIcon'
import { StatusBadge } from './ui/StatusBadge'

interface FileListProps {
  files: WorkFile[]
  counts: { total: number; ready: number; translating: number; done: number; error: number }
  batchProgress: number
  isRunning: boolean
  zipping: boolean
  onOpen: (file: WorkFile) => void
  onRemove: (id: string) => void
  onRetry: (id: string) => void
  onDownload: (file: WorkFile) => void
  onDownloadAll: () => void
  onClear: () => void
  onLoadSamples: () => void
  onPick: () => void
}

type Tab = 'all' | 'done'

export function FileList({
  files,
  counts,
  batchProgress,
  isRunning,
  zipping,
  onOpen,
  onRemove,
  onRetry,
  onDownload,
  onDownloadAll,
  onClear,
  onLoadSamples,
  onPick,
}: FileListProps) {
  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')
  const id = useId()

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return files.filter((f) => (tab === 'done' ? f.status === 'done' : true) && (!q || f.name.toLowerCase().includes(q)))
  }, [files, tab, query])

  const batchLabel = isRunning
    ? `กำลังแปล ${counts.translating} ไฟล์ · ${batchProgress}%`
    : counts.total === 0
      ? 'ยังไม่มีไฟล์ในชุดนี้'
      : counts.done === counts.total
        ? `แปลเสร็จครบ ${counts.done} ไฟล์`
        : `${counts.ready} ไฟล์พร้อมแปล${counts.done ? ` · เสร็จแล้ว ${counts.done}` : ''}${
            counts.error ? ` · ผิดพลาด ${counts.error}` : ''
          }`

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="mt-5 overflow-hidden rounded-card border border-line bg-surface shadow-card"
    >
      <h3 id={`${id}-title`} className="sr-only">
        รายการไฟล์
      </h3>

      {/* Tabs + toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 sm:px-5">
        <div role="tablist" aria-label="กรองรายการไฟล์" className="flex gap-6">
          {(
            [
              { key: 'all', label: 'ไฟล์ทั้งหมด', count: counts.total },
              { key: 'done', label: 'แปลเสร็จแล้ว', count: counts.done },
            ] as { key: Tab; label: string; count: number }[]
          ).map((t) => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                className={cx(
                  'relative flex h-12 items-center gap-2 text-[13.5px] transition-colors',
                  active ? 'font-semibold text-ink-soft' : 'text-muted hover:text-ink',
                )}
              >
                {t.label}
                <span
                  className={cx(
                    'rounded-md px-1.5 py-px text-[11px] font-semibold tabular-nums',
                    active ? 'bg-lime text-ink' : 'bg-mint-soft text-muted',
                  )}
                >
                  {t.count}
                </span>
                {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-leaf" aria-hidden />}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2 py-2">
          <label className="relative block">
            <span className="sr-only">ค้นหาตามชื่อไฟล์</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาชื่อไฟล์"
              className="h-9 w-40 rounded-lg border border-transparent bg-canvas pl-8 pr-7 text-[13px] text-ink placeholder:text-faint hover:border-line focus:border-leaf focus:bg-surface sm:w-52"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="ล้างคำค้นหา"
                className="absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-faint hover:text-ink"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            )}
          </label>
          <Button variant="ghost" size="sm" onClick={onClear} disabled={!files.length || isRunning}>
            ล้างรายการ
          </Button>
        </div>
      </div>

      {/* Header row */}
      {visible.length > 0 && (
        <div className="hidden grid-cols-[minmax(0,1fr)_132px_120px] bg-canvas/70 px-5 py-2 text-[11.5px] font-medium text-faint sm:grid">
          <span>ชื่อไฟล์</span>
          <span>สถานะ</span>
          <span className="text-right">การทำงาน</span>
        </div>
      )}

      {/* Rows */}
      {visible.length === 0 ? (
        <EmptyState
          hasFiles={files.length > 0}
          query={query}
          tab={tab}
          onPick={onPick}
          onLoadSamples={onLoadSamples}
          onReset={() => {
            setQuery('')
            setTab('all')
          }}
        />
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((f) => (
            <FileRow key={f.id} file={f} onOpen={onOpen} onRemove={onRemove} onRetry={onRetry} onDownload={onDownload} />
          ))}
        </ul>
      )}

      {/* Footer: batch status */}
      <div className="border-t border-line px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-muted" aria-live="polite">
            {batchLabel}
          </p>
          <Button
            size="sm"
            variant="outline"
            leading={<Archive className="size-4" aria-hidden />}
            onClick={onDownloadAll}
            disabled={counts.done === 0}
            loading={zipping}
            loadingText="กำลังสร้าง ZIP…"
          >
            ดาวน์โหลดทั้งหมด (ZIP){counts.done ? ` · ${counts.done}` : ''}
          </Button>
        </div>
        {(isRunning || (counts.total > 0 && counts.done > 0)) && (
          <div
            className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-mint"
            role="progressbar"
            aria-label="ความคืบหน้ารวมทั้งชุด"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={batchProgress}
          >
            <div className="h-full rounded-full bg-leaf transition-[width] duration-300" style={{ width: `${batchProgress}%` }} />
          </div>
        )}
      </div>
    </section>
  )
}

function FileRow({
  file,
  onOpen,
  onRemove,
  onRetry,
  onDownload,
}: {
  file: WorkFile
  onOpen: (f: WorkFile) => void
  onRemove: (id: string) => void
  onRetry: (id: string) => void
  onDownload: (f: WorkFile) => void
}) {
  const translating = file.status === 'translating'
  const done = file.status === 'done'
  const target = file.result ? LANGUAGE_MAP[file.result.settings.targetLang] : null

  return (
    <li className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_132px_120px] sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <FileTypeIcon ext={file.ext} />
        <div className="min-w-0">
          {done ? (
            <button
              type="button"
              onClick={() => onOpen(file)}
              className="block max-w-full truncate text-left text-[14px] font-medium text-ink hover:text-leaf hover:underline"
              title="เปิดดูคำแปล"
            >
              {file.name}
            </button>
          ) : (
            <p className="truncate text-[14px] font-medium text-ink" title={file.name}>
              {file.name}
            </p>
          )}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-faint">
            <span>{formatBytes(file.size)}</span>
            {file.isSample && (
              <>
                <span aria-hidden>·</span>
                <span className="rounded bg-mint-soft px-1.5 py-px font-medium text-muted">ไฟล์ตัวอย่าง</span>
              </>
            )}
            {done && target && (
              <>
                <span aria-hidden>·</span>
                <span>→ {target.label}</span>
              </>
            )}
            {file.status === 'error' && file.error && (
              <>
                <span aria-hidden>·</span>
                <span className="text-danger">{file.error}</span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="col-start-1 row-start-2 sm:col-start-2 sm:row-start-1">
        <StatusBadge status={file.status} progress={file.progress} />
      </div>

      <div className="col-start-2 row-span-2 flex items-center justify-end gap-0.5 sm:col-start-3 sm:row-span-1">
        {done && (
          <>
            <Button size="icon" variant="ghost" onClick={() => onOpen(file)} aria-label={`ดูคำแปล ${file.name}`} title="ดูคำแปล">
              <Eye className="size-[18px]" aria-hidden />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onDownload(file)}
              aria-label={`ดาวน์โหลดผลลัพธ์ตัวอย่าง ${file.name}`}
              title="ดาวน์โหลดไฟล์ที่แปลแล้ว"
            >
              <Download className="size-[18px]" aria-hidden />
            </Button>
          </>
        )}
        {file.status === 'error' && (
          <Button size="icon" variant="ghost" onClick={() => onRetry(file.id)} aria-label={`ลองแปล ${file.name} อีกครั้ง`} title="ลองอีกครั้ง">
            <RefreshCw className="size-[18px]" aria-hidden />
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onRemove(file.id)}
          disabled={translating}
          aria-label={`ลบ ${file.name} ออกจากรายการ`}
          title={translating ? 'หยุดการแปลก่อนจึงจะลบได้' : 'ลบออกจากรายการ'}
          className="hover:text-danger"
        >
          <Trash className="size-[18px]" aria-hidden />
        </Button>
      </div>

      {translating && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-mint" aria-hidden>
          <div className="h-full bg-leaf transition-[width] duration-200" style={{ width: `${file.progress}%` }} />
        </div>
      )}
    </li>
  )
}

function EmptyState({
  hasFiles,
  query,
  tab,
  onPick,
  onLoadSamples,
  onReset,
}: {
  hasFiles: boolean
  query: string
  tab: Tab
  onPick: () => void
  onLoadSamples: () => void
  onReset: () => void
}) {
  if (hasFiles) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-[15px] font-medium text-ink">
          {query ? `ไม่พบไฟล์ที่ชื่อมีคำว่า “${query}”` : tab === 'done' ? 'ยังไม่มีไฟล์ที่แปลเสร็จ' : 'ไม่มีไฟล์'}
        </p>
        <p className="mt-1 text-[13px] text-muted">
          {query ? 'ลองใช้คำค้นสั้นลง หรือล้างตัวกรอง' : 'กด “แปลทั้งหมด” ในแผงตั้งค่าด้านขวา แล้วไฟล์ที่เสร็จจะมาแสดงที่นี่'}
        </p>
        <Button variant="subtle" size="sm" className="mt-4" onClick={onReset}>
          แสดงไฟล์ทั้งหมด
        </Button>
      </div>
    )
  }
  return (
    <div className="px-6 py-12 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-xl bg-mint text-leaf" aria-hidden>
        <FolderOpen className="size-6" />
      </span>
      <p className="mt-4 text-[15px] font-medium text-ink">ยังไม่มีไฟล์ในชุดนี้</p>
      <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted">
        ลากไฟล์มาวางด้านบน หรือเลือกจากอุปกรณ์ จากนั้นตั้งค่าภาษาทางขวาแล้วกด “แปลทั้งหมด”
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button variant="primary" size="sm" onClick={onPick}>
          เลือกไฟล์จากอุปกรณ์
        </Button>
        <Button variant="outline" size="sm" onClick={onLoadSamples}>
          ใช้ไฟล์ตัวอย่าง
        </Button>
      </div>
    </div>
  )
}
