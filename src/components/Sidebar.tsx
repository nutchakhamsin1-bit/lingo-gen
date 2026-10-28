import { BookOpen, ChevronsUpDown, Clock, CircleQuestionMark, Languages, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { cx } from '../lib/format'
import type { View } from '../types'

interface SidebarProps {
  view: View
  onNavigate: (view: View) => void
  mobileOpen: boolean
  onCloseMobile: () => void
  onHelp: () => void
  onProfile: () => void
  fileCount: number
  glossaryCount: number
}

const NAV: { view: View; label: string; icon: typeof Languages }[] = [
  { view: 'translate', label: 'แปลเอกสาร', icon: Languages },
  { view: 'history', label: 'ประวัติการแปล', icon: Clock },
  { view: 'glossary', label: 'คลังคำศัพท์', icon: BookOpen },
]

export function Brand({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2 font-semibold tracking-tight text-ink', className)}>
      <span className="grid size-8 place-items-center rounded-lg bg-ink text-[13px] font-bold text-lime" aria-hidden>
        l.
      </span>
      <span className="text-[20px] leading-none">
        lingo<span className="text-leaf">.</span>
      </span>
    </span>
  )
}

export function Sidebar({
  view,
  onNavigate,
  mobileOpen,
  onCloseMobile,
  onHelp,
  onProfile,
  fileCount,
  glossaryCount,
}: SidebarProps) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!mobileOpen) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseMobile()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [mobileOpen, onCloseMobile])

  const content = (
    <>
      <div className="flex items-center justify-between px-5 pt-6 pb-2 lg:px-6 lg:pt-7">
        <Brand />
        <button
          ref={closeRef}
          type="button"
          onClick={onCloseMobile}
          aria-label="ปิดเมนู"
          className="grid size-10 place-items-center rounded-lg text-muted hover:bg-mint-soft hover:text-ink lg:hidden"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <nav aria-label="เมนูหลัก" className="mt-5 px-3 lg:px-4">
        <p className="mb-2 px-3 text-[11px] font-semibold tracking-[0.14em] text-faint">WORKSPACE</p>
        <ul className="space-y-1">
          {NAV.map(({ view: v, label, icon: Icon }) => {
            const active = v === view
            const count = v === 'translate' ? fileCount : v === 'glossary' ? glossaryCount : 0
            return (
              <li key={v}>
                <button
                  type="button"
                  onClick={() => onNavigate(v)}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex h-11 w-full items-center gap-3 rounded-[10px] px-3 text-left text-[14px] transition-colors',
                    active ? 'bg-mint font-semibold text-ink-soft' : 'text-muted hover:bg-mint-soft hover:text-ink',
                  )}
                >
                  <Icon className={cx('size-[18px] shrink-0', active ? 'text-leaf' : 'text-faint')} aria-hidden />
                  <span className="flex-1 truncate">{label}</span>
                  {count > 0 && (
                    <span
                      className={cx(
                        'rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                        active ? 'bg-white text-leaf' : 'bg-mint-soft text-muted',
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="mt-auto space-y-1 border-t border-line px-3 py-4 lg:px-4">
        <button
          type="button"
          onClick={onHelp}
          className="flex h-11 w-full items-center gap-3 rounded-[10px] px-3 text-left text-[14px] text-muted transition-colors hover:bg-mint-soft hover:text-ink"
        >
          <CircleQuestionMark className="size-[18px] shrink-0 text-faint" aria-hidden />
          <span className="flex-1">ศูนย์ช่วยเหลือ</span>
        </button>
        <button
          type="button"
          onClick={onProfile}
          className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors hover:bg-mint-soft"
          aria-label="โปรไฟล์ผู้ใช้ Nutcha"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-lime text-[14px] font-bold text-ink" aria-hidden>
            N
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[14px] font-semibold text-ink">Nutcha</span>
            <span className="block truncate text-[12px] text-faint">Personal account · Demo</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-faint" aria-hidden />
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-surface lg:flex">
        {content}
      </aside>

      {/* Mobile drawer */}
      <div
        className={cx('fixed inset-0 z-50 lg:hidden', mobileOpen ? '' : 'pointer-events-none')}
        aria-hidden={!mobileOpen}
        inert={!mobileOpen}
      >
        <div
          className={cx(
            'absolute inset-0 bg-ink/40 transition-opacity duration-200',
            mobileOpen ? 'opacity-100' : 'opacity-0',
          )}
          onClick={onCloseMobile}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="เมนู"
          className={cx(
            'absolute inset-y-0 left-0 flex w-[min(86vw,300px)] flex-col bg-surface shadow-pop transition-transform duration-200',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          {content}
        </aside>
      </div>
    </>
  )
}
