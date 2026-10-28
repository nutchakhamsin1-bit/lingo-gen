import { Info } from 'lucide-react'
import { cx } from '../lib/format'

export function DemoNotice({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div
      role="note"
      className={cx(
        'flex items-start gap-2.5 rounded-[10px] border border-[#e8e2c9] bg-amber-soft px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber',
        className,
      )}
    >
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        <strong className="font-semibold">โหมดทดลอง</strong> — ยังไม่ได้แปลเนื้อหาไฟล์ของคุณจริง
        {!compact && (
          <>
            {' '}
            ไฟล์ที่ดาวน์โหลดเป็นนามสกุลและรูปแบบเดิม แต่ข้อความเป็นคำแปลจำลอง “[TH] ข้อความเดิม” การตรวจจับภาษาและโทนภาษายังไม่ได้ประมวลผลจริง และไม่มีการส่งไฟล์ออกไปภายนอก
          </>
        )}
      </p>
    </div>
  )
}
