import { Clock, Download, Eye, Trash } from 'lucide-react'
import { useState } from 'react'
import { LANGUAGE_MAP, TONE_LABEL, languageLabel } from '../../lib/constants'
import { formatBytes, formatDateTime } from '../../lib/format'
import type { HistoryEntry, TranslationResult } from '../../types'
import { DemoNotice } from '../DemoNotice'
import { Button } from '../ui/Button'
import { FileTypeIcon } from '../ui/FileTypeIcon'
import { Modal } from '../ui/Modal'

interface HistoryViewProps {
  history: HistoryEntry[]
  onOpen: (result: TranslationResult) => void
  onDownload: (result: TranslationResult) => void
  onRemove: (id: string) => void
  onClear: () => void
  onNewTranslation: () => void
}

export function HistoryView({ history, onOpen, onDownload, onRemove, onClear, onNewTranslation }: HistoryViewProps) {
  const [confirmClear, setConfirmClear] = useState(false)

  return (
    <section aria-labelledby="history-title" className="anim-fade-up">
      <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-leaf">
        <span className="size-1.5 rounded-full bg-leaf" aria-hidden />
        YOUR WORK, ALL TOGETHER.
      </p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="history-title" className="text-[28px] font-medium leading-tight tracking-[-0.02em] text-ink sm:text-[34px]">
            ประวัติการแปล
          </h2>
          <p className="mt-2 text-[15px] text-muted">กลับมาดูและดาวน์โหลดงานที่แปลเสร็จแล้ว พร้อมการตั้งค่าที่ใช้ในครั้งนั้น</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setConfirmClear(true)} disabled={!history.length}>
            ล้างประวัติ
          </Button>
          <Button variant="dark" onClick={onNewTranslation}>
            แปลเอกสารใหม่
          </Button>
        </div>
      </div>

      <DemoNotice compact className="mt-5" />
      <p className="mt-2 text-[12.5px] text-faint">ประวัติเก็บในเบราว์เซอร์นี้เท่านั้น (localStorage) · {history.length} รายการ</p>

      <div className="mt-4 overflow-hidden rounded-card border border-line bg-surface shadow-card">
        {history.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-xl bg-mint text-leaf" aria-hidden>
              <Clock className="size-6" />
            </span>
            <p className="mt-4 text-[15px] font-medium text-ink">ยังไม่มีประวัติการแปล</p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted">
              เมื่อแปลไฟล์เสร็จ รายการจะถูกบันทึกไว้ที่นี่พร้อมวันเวลา ภาษา และผลลัพธ์สำหรับดาวน์โหลดซ้ำ
            </p>
            <Button variant="primary" size="sm" className="mt-4" onClick={onNewTranslation}>
              ไปที่หน้าแปลเอกสาร
            </Button>
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[150px_minmax(0,1fr)_190px_120px] bg-canvas/70 px-5 py-2 text-[11.5px] font-medium text-faint md:grid">
              <span>วันเวลา</span>
              <span>ชื่อไฟล์</span>
              <span>ภาษาที่แปล</span>
              <span className="text-right">การทำงาน</span>
            </div>
            <ul className="divide-y divide-line">
              {history.map((h) => (
                <li
                  key={h.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3.5 md:grid-cols-[150px_minmax(0,1fr)_190px_120px] md:px-5"
                >
                  <p className="order-2 text-[12.5px] text-faint md:order-1 md:text-[13px] md:text-muted">
                    {formatDateTime(h.completedAt)}
                  </p>
                  <div className="order-1 flex min-w-0 items-center gap-3 md:order-2">
                    <FileTypeIcon ext={h.ext} size="sm" />
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onOpen(h.result)}
                        className="block max-w-full truncate text-left text-[14px] font-medium text-ink hover:text-leaf hover:underline"
                      >
                        {h.fileName}
                      </button>
                      <p className="text-[12px] text-faint">
                        {formatBytes(h.size)}
                        {h.isSample ? ' · ไฟล์ตัวอย่าง' : ''} · {TONE_LABEL[h.settings.tone]}
                      </p>
                    </div>
                  </div>
                  <p className="order-3 text-[13px] text-muted">
                    {languageLabel(h.settings.sourceLang)} <span className="text-faint">→</span>{' '}
                    <span className="font-medium text-ink">{LANGUAGE_MAP[h.settings.targetLang].label}</span>
                  </p>
                  <div className="order-4 col-start-2 row-span-2 flex items-center justify-end gap-0.5 md:col-start-4 md:row-span-1">
                    <Button size="icon" variant="ghost" onClick={() => onOpen(h.result)} aria-label={`ดูคำแปล ${h.fileName}`} title="ดูคำแปล">
                      <Eye className="size-[18px]" aria-hidden />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onDownload(h.result)}
                      aria-label={`ดาวน์โหลดผลลัพธ์เดิมของ ${h.fileName}`}
                      title="ดาวน์โหลดไฟล์ที่แปลแล้ว (นามสกุลเดิม)"
                    >
                      <Download className="size-[18px]" aria-hidden />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onRemove(h.id)}
                      aria-label={`ลบประวัติของ ${h.fileName}`}
                      title="ลบรายการนี้"
                      className="hover:text-danger"
                    >
                      <Trash className="size-[18px]" aria-hidden />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        size="sm"
        title="ล้างประวัติการแปลทั้งหมด?"
        description={`จะลบ ${history.length} รายการออกจากเบราว์เซอร์นี้ และไม่สามารถกู้คืนได้`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmClear(false)}>
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                onClear()
                setConfirmClear(false)
              }}
            >
              ล้างประวัติ
            </Button>
          </div>
        }
      >
        <p className="px-5 py-4 text-[13.5px] text-muted sm:px-6">ไฟล์ที่อยู่ในหน้าแปลเอกสารจะไม่ได้รับผลกระทบ</p>
      </Modal>
    </section>
  )
}
