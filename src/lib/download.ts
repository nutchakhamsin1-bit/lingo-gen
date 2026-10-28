import type { TranslationResult } from '../types'
import { formatDateForFile } from './format'

export function zipFileName(demo: boolean, completedAt = new Date().toISOString()): string {
  return `${demo ? 'DEMO_' : ''}lingo_translations_${formatDateForFile(completedAt)}.zip`
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

/** รวมไฟล์ที่แปลแล้ว (นามสกุลเดิมของแต่ละไฟล์) เป็น ZIP — คืนจำนวนไฟล์ที่ใส่ได้ */
export async function downloadResultsZip(
  results: TranslationResult[],
  getOutput: (result: TranslationResult) => Promise<Blob | null>,
): Promise<number> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const used = new Set<string>()
  const unique = (name: string) => {
    let candidate = name
    let n = 2
    while (used.has(candidate.toLowerCase())) candidate = name.replace(/(\.[^.]+)?$/, ` (${n++})$1`)
    used.add(candidate.toLowerCase())
    return candidate
  }
  let count = 0
  for (const r of results) {
    const blob = await getOutput(r)
    if (!blob) continue
    zip.file(unique(r.outputName), blob)
    count++
  }
  if (!count) return 0
  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(blob, zipFileName(results.some((r) => r.isDemo)))
  return count
}
