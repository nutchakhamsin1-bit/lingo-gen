import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react'
import { cx } from '../../lib/format'
import type { FileStatus } from '../../types'

const config: Record<FileStatus, { label: string; cls: string }> = {
  ready: { label: 'พร้อมแปล', cls: 'bg-mint-soft text-muted border-line' },
  translating: { label: 'กำลังแปล', cls: 'bg-amber-soft text-amber border-[#efe6c6]' },
  done: { label: 'แปลสำเร็จ', cls: 'bg-[#edf7ec] text-[#3f7446] border-[#d8ecd4]' },
  error: { label: 'เกิดข้อผิดพลาด', cls: 'bg-danger-soft text-danger border-[#f1d4d0]' },
}

export function StatusBadge({ status, progress }: { status: FileStatus; progress?: number }) {
  const c = config[status]
  return (
    <span
      className={cx(
        'inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-[12px] font-medium',
        c.cls,
      )}
    >
      {status === 'translating' && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />}
      {status === 'done' && <CircleCheck className="size-3.5" aria-hidden />}
      {status === 'error' && <CircleAlert className="size-3.5" aria-hidden />}
      {status === 'ready' && <span className="size-1.5 rounded-full bg-faint" aria-hidden />}
      {c.label}
      {status === 'translating' && typeof progress === 'number' && (
        <span className="tabular-nums text-amber/80">{progress}%</span>
      )}
    </span>
  )
}
