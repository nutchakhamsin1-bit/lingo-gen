import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { useToast, type ToastKind } from '../../hooks/useToast'
import { cx } from '../../lib/format'

const styles: Record<ToastKind, { icon: typeof Info; cls: string }> = {
  success: { icon: CircleCheck, cls: 'text-leaf' },
  error: { icon: CircleAlert, cls: 'text-danger' },
  info: { icon: Info, cls: 'text-sky-ink' },
}

export function Toaster() {
  const { toasts, dismiss } = useToast()
  if (!toasts.length) return null
  return (
    <div
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const Icon = styles[t.kind].icon
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className="anim-fade-up pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-pop"
          >
            <Icon className={cx('mt-0.5 size-5 shrink-0', styles[t.kind].cls)} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{t.title}</p>
              {t.detail && <p className="mt-0.5 text-[13px] text-muted">{t.detail}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="ปิดการแจ้งเตือน"
              className="-mr-1 grid size-7 shrink-0 place-items-center rounded-md text-faint hover:bg-mint-soft hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )
      })}
    </div>
  )
}
