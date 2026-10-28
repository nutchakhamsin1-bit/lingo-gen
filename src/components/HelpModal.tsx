import { FILE_KIND_GROUPS, KIND_META } from '../lib/constants'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { DemoNotice } from './DemoNotice'

const SUPPORTED_TYPES = FILE_KIND_GROUPS.map(
  ({ kind, exts }) => `${KIND_META[kind].label} (${exts.map((e) => e.toUpperCase()).join(', ')})`,
).join(' · ')

const FAQ: { q: string; a: string }[] = [
  {
    q: 'เพิ่มไฟล์ได้กี่ไฟล์ และประเภทใดบ้าง?',
    a: `รองรับ ${SUPPORTED_TYPES} สูงสุด 10 ไฟล์ต่อชุด และไม่เกิน 20 MB ต่อไฟล์ ไฟล์ซ้ำ ไฟล์ว่าง หรือประเภทที่ไม่รองรับจะถูกแจ้งพร้อมเหตุผล`,
  },
  {
    q: 'แปลรูปภาพที่มีทั้งภาพและตัวอักษร เช่น มังงะ ได้อย่างไร?',
    a: 'ระบบแปลเฉพาะข้อความในภาพ แล้ววางคำแปลกลับตำแหน่งเดิม ภาพประกอบไม่ถูกแตะ ได้ไฟล์ภาพนามสกุลเดิม (SVG ได้คำแปลเป็นตัวอักษรจริง) ระบบอ่านข้อความในภาพ (OCR) บนเครื่องของคุณ ภาพไม่ถูกส่งออก ครั้งแรกจะดาวน์โหลดโมเดลภาษาสักครู่ เลือกภาษาต้นฉบับให้ตรงกับภาพเพื่อให้อ่านแม่นขึ้น (ตรวจจับอัตโนมัติจะอ่านเป็นภาษาอังกฤษ) ในโหมดทดลองคำแปลยังเป็นค่าจำลอง',
  },
  {
    q: 'การตั้งค่าใช้กับไฟล์ใดบ้าง?',
    a: 'การตั้งค่าด้านขวาใช้กับทุกไฟล์ที่ “พร้อมแปล” ในชุดเดียวกัน และจะถูกบันทึกไว้กับงานนั้น การเปลี่ยนค่าภายหลังจะไม่กระทบไฟล์ที่แปลเสร็จแล้ว',
  },
  {
    q: 'ทำไมสลับภาษาไม่ได้?',
    a: 'ปุ่มสลับต้องรู้ว่าภาษาต้นฉบับคืออะไร หากยังอยู่ในโหมดตรวจจับอัตโนมัติ ให้เลือกภาษาต้นฉบับก่อน',
  },
  {
    q: 'ไฟล์ที่ดาวน์โหลดคืออะไร?',
    a: 'ไฟล์นามสกุลเดิมและรูปแบบเดิม (Word เป็น Word, PDF เป็น PDF, รูปเป็นรูป) แทนเฉพาะข้อความด้วยคำแปล — สไตล์ ตาราง รูป และเลย์เอาต์คงเดิม ในโหมดทดลองข้อความเป็นคำแปลจำลอง “[TH] ข้อความเดิม” และชื่อไฟล์ขึ้นต้นด้วย DEMO_ ไฟล์ .doc .xls .ppt .heic รุ่นเก่าต้องแปลผ่านเซิร์ฟเวอร์',
  },
  {
    q: 'ข้อมูลถูกเก็บที่ไหน?',
    a: 'การตั้งค่า คลังคำศัพท์ และประวัติเก็บใน localStorage ของเบราว์เซอร์นี้ ไฟล์ที่อัปโหลดอยู่บนเครื่องของคุณและไม่ถูกส่งออกไปภายนอก',
  },
  {
    q: 'ทดสอบกรณีผิดพลาดได้อย่างไร?',
    a: 'ตั้งชื่อไฟล์ให้มีคำว่า “error” แล้วสั่งแปล ระบบจำลองจะคืนสถานะผิดพลาดเพื่อให้ทดลองปุ่มลองอีกครั้ง',
  },
]

export function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="ศูนย์ช่วยเหลือ"
      description="คำถามที่พบบ่อยเกี่ยวกับการใช้งาน Lingo Gen"
      footer={
        <div className="flex justify-end">
          <Button variant="dark" onClick={onClose}>
            เข้าใจแล้ว
          </Button>
        </div>
      }
    >
      <div className="px-5 py-5 sm:px-6">
        <DemoNotice className="mb-5" />
        <dl className="space-y-4">
          {FAQ.map((f) => (
            <div key={f.q}>
              <dt className="text-[14px] font-semibold text-ink">{f.q}</dt>
              <dd className="mt-1 text-[13.5px] leading-relaxed text-muted">{f.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Modal>
  )
}

export function ProfileModal({ open, onClose, stats }: { open: boolean; onClose: () => void; stats: { history: number; glossary: number } }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="โปรไฟล์ผู้ใช้"
      footer={
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            ปิด
          </Button>
        </div>
      }
    >
      <div className="px-5 py-5 sm:px-6">
        <div className="flex items-center gap-4">
          <span className="grid size-14 place-items-center rounded-full bg-lime text-[20px] font-bold text-ink" aria-hidden>
            N
          </span>
          <div>
            <p className="text-[16px] font-semibold text-ink">Nutcha</p>
            <p className="text-[13px] text-muted">Personal account · โหมดทดลอง</p>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-[10px] border border-line bg-canvas px-4 py-3">
            <dt className="text-[12px] text-faint">งานที่แปลเสร็จ</dt>
            <dd className="text-[22px] font-semibold tabular-nums text-ink">{stats.history}</dd>
          </div>
          <div className="rounded-[10px] border border-line bg-canvas px-4 py-3">
            <dt className="text-[12px] text-faint">คำในคลังคำศัพท์</dt>
            <dd className="text-[22px] font-semibold tabular-nums text-ink">{stats.glossary}</dd>
          </div>
        </dl>
        <p className="mt-4 text-[12.5px] text-faint">
          ระบบบัญชีผู้ใช้และการเข้าสู่ระบบยังไม่เปิดใช้ในโหมดทดลอง ข้อมูลทั้งหมดเก็บในเบราว์เซอร์นี้เท่านั้น
        </p>
      </div>
    </Modal>
  )
}
