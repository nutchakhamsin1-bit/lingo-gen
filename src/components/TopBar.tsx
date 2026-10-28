import { Bell, CircleQuestionMark, LoaderCircle, Menu } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { cx, formatDateTime } from '../lib/format'
import { LANGUAGE_MAP } from '../lib/constants'
import type { HistoryEntry, View } from '../types'
import { Brand } from './Sidebar'

interface TopBarProps {
  view: View
  onOpenMenu: () => void
  onHelp: () => void
  onProfile: () => void
  onNavigate: (view: View) => void
  isRunning: boolean
  translatingCount: number
  history: HistoryEntry[]
}

const TITLES: Record<View, string> = {
  translate: 'แปลเอกสาร',
  history: 'ประวัติการแปล',
  glossary: 'คลังคำศัพท์',
}

function Popover({
  open,
  onClose,
  anchor,
  children,
  label,
}: {
  open: boolean
  onClose: () => void
  anchor: RefObject<HTMLElement | null>
  children: ReactNode
  label: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        anchor.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, anchor])
  if (!open) return null
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className="anim-fade-up absolute right-0 top-[calc(100%+8px)] z-40 w-[min(92vw,340px)] overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
    >
      {children}
    </div>
  )
}

export function TopBar({
  view,
  onOpenMenu,
  onHelp,
  onProfile,
  onNavigate,
  isRunning,
  translatingCount,
  history,
}: TopBarProps) {
  const [notifOpen, setNotifOpen] = useState(false)
  const bellRef = useRef<HTMLButtonElement>(null)
  const recent = history.slice(0, 5)

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur sm:px-6 lg:h-[72px] lg:px-9">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="เปิดเมนู"
        className="grid size-10 shrink-0 place-items-center rounded-lg text-ink hover:bg-mint-soft lg:hidden"
      >
        <Menu className="size-5" aria-hidden />
      </button>
      <div className="lg:hidden">
        <Brand className="[&>span:last-child]:hidden sm:[&>span:last-child]:inline" />
      </div>
      <nav aria-label="ตำแหน่งปัจจุบัน" className="hidden min-w-0 items-center gap-2 text-[13px] text-faint lg:flex">
        <span>Workspace</span>
        <span aria-hidden>/</span>
        <span className="font-medium text-ink">{TITLES[view]}</span>
      </nav>
      <h1 className="sr-only">{TITLES[view]} — Lingo Gen</h1>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <span className="hidden h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[12px] font-medium text-muted md:inline-flex">
          <span className="size-1.5 rounded-full bg-leaf" aria-hidden />
          Interactive demo
        </span>
        {isRunning && (
          <span
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-amber-soft px-3 text-[12px] font-medium text-amber"
            role="status"
          >
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            กำลังแปล {translatingCount}
          </span>
        )}
        <button
          type="button"
          onClick={onHelp}
          aria-label="ศูนย์ช่วยเหลือ"
          className="hidden size-10 place-items-center rounded-lg text-muted hover:bg-mint-soft hover:text-ink sm:grid"
        >
          <CircleQuestionMark className="size-5" aria-hidden />
        </button>
        <div className="relative">
          <button
            ref={bellRef}
            type="button"
            onClick={() => setNotifOpen((v) => !v)}
            aria-expanded={notifOpen}
            aria-haspopup="dialog"
            aria-label={`การแจ้งเตือน${recent.length ? ` (${recent.length} รายการล่าสุด)` : ''}`}
            className={cx(
              'relative grid size-10 place-items-center rounded-lg text-muted hover:bg-mint-soft hover:text-ink',
              notifOpen && 'bg-mint-soft text-ink',
            )}
          >
            <Bell className="size-5" aria-hidden />
            {recent.length > 0 && (
              <span className="absolute right-2 top-2 size-2 rounded-full bg-leaf ring-2 ring-canvas" aria-hidden />
            )}
          </button>
          <Popover open={notifOpen} onClose={() => setNotifOpen(false)} anchor={bellRef} label="การแจ้งเตือน">
            <div className="border-b border-line px-4 py-3">
              <p className="text-sm font-semibold text-ink">การแจ้งเตือน</p>
              <p className="text-[12px] text-faint">งานแปลที่เสร็จล่าสุดในเบราว์เซอร์นี้</p>
            </div>
            {recent.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-muted">ยังไม่มีการแจ้งเตือน — เมื่อแปลเสร็จจะแสดงที่นี่</p>
            ) : (
              <ul className="max-h-72 overflow-y-auto py-1">
                {recent.map((h) => (
                  <li key={h.id} className="px-4 py-2.5">
                    <p className="truncate text-[13px] font-medium text-ink">แปลเสร็จ: {h.fileName}</p>
                    <p className="text-[12px] text-faint">
                      → {LANGUAGE_MAP[h.settings.targetLang].label} · {formatDateTime(h.completedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-line px-2 py-2">
              <button
                type="button"
                onClick={() => {
                  setNotifOpen(false)
                  onNavigate('history')
                }}
                className="h-9 w-full rounded-lg text-[13px] font-medium text-leaf hover:bg-mint-soft"
              >
                ดูประวัติทั้งหมด
              </button>
            </div>
          </Popover>
        </div>
        <button
          type="button"
          onClick={onProfile}
          aria-label="โปรไฟล์ผู้ใช้ Nutcha"
          className="ml-1 grid size-9 place-items-center rounded-full bg-lime text-[13px] font-bold text-ink ring-2 ring-transparent hover:ring-lime-deep"
        >
          N
        </button>
      </div>
    </header>
  )
}
