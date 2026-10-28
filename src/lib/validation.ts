import type { Rejection, WorkFile } from '../types'
import { MAX_FILES, MAX_FILE_SIZE } from './constants'
import { formatBytes, getExt, uid } from './format'

export interface ValidationOutcome {
  accepted: WorkFile[]
  rejected: Rejection[]
}

/**
 * ตรวจไฟล์ที่ผู้ใช้เลือก: ประเภท ขนาด ไฟล์ว่าง ไฟล์ซ้ำ และจำนวนสูงสุดต่อชุด
 * ไม่อ่านเนื้อหาไฟล์ และไม่ส่งไฟล์ไปที่ใด
 */
export function validateIncoming(incoming: File[], existing: WorkFile[]): ValidationOutcome {
  const accepted: WorkFile[] = []
  const rejected: Rejection[] = []
  const seen = new Set(existing.map((f) => `${f.name.toLowerCase()}::${f.size}`))
  let slots = Math.max(0, MAX_FILES - existing.length)

  for (const file of incoming) {
    const ext = getExt(file.name)
    if (!ext) {
      rejected.push({
        name: file.name,
        reason: 'ประเภทไฟล์ไม่รองรับ (รองรับเอกสาร สไลด์ ตาราง ข้อความ เว็บ คำบรรยาย อีบุ๊ก และรูปภาพ)',
      })
      continue
    }
    if (file.size === 0) {
      rejected.push({ name: file.name, reason: 'ไฟล์ว่าง (0 B) ไม่มีเนื้อหาให้แปล' })
      continue
    }
    if (file.size > MAX_FILE_SIZE) {
      rejected.push({
        name: file.name,
        reason: `ขนาด ${formatBytes(file.size)} เกิน ${formatBytes(MAX_FILE_SIZE)} ต่อไฟล์`,
      })
      continue
    }
    const key = `${file.name.toLowerCase()}::${file.size}`
    if (seen.has(key)) {
      rejected.push({ name: file.name, reason: 'มีไฟล์นี้อยู่ในรายการแล้ว (ชื่อและขนาดเดียวกัน)' })
      continue
    }
    if (slots <= 0) {
      rejected.push({ name: file.name, reason: `เกินจำนวนสูงสุด ${MAX_FILES} ไฟล์ต่อชุด` })
      continue
    }
    seen.add(key)
    slots--
    accepted.push({
      id: uid('file'),
      name: file.name,
      size: file.size,
      ext,
      isSample: false,
      file,
      status: 'ready',
      progress: 0,
      addedAt: new Date().toISOString(),
    })
  }
  return { accepted, rejected }
}
