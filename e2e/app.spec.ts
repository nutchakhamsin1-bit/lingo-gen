import { expect, test } from '@playwright/test'
import JSZip from 'jszip'
import { addFiles, clearList, downloadAll, fixture, MAGIC, openApp, startsWith, translateAll } from './helpers.ts'

test('sample files come back in their original formats', async ({ page }) => {
  const errors = await openApp(page, { sourceLang: 'en', targetLang: 'th' })
  await translateAll(page)
  await expect(page.getByText('แปลเสร็จครบ 4 ไฟล์')).toBeVisible()

  const zip = await downloadAll(page)
  expect(Object.keys(zip.files).sort()).toEqual([
    'DEMO_Brand guidelines_TH.pdf',
    'DEMO_Manga page_TH.svg',
    'DEMO_Product overview_TH.docx',
    'DEMO_Website content_TH.xlsx',
  ])
  expect(startsWith(await zip.file('DEMO_Brand guidelines_TH.pdf')!.async('uint8array'), MAGIC.pdf)).toBe(true)

  const word = await JSZip.loadAsync(await zip.file('DEMO_Product overview_TH.docx')!.async('uint8array'))
  expect(await word.file('word/document.xml')!.async('string')).toContain('[TH] Product Overview')

  // หน้ามังงะตัวอย่าง: คำแปลจริงวางเป็นตัวอักษรเวกเตอร์ใน SVG
  const svg = await zip.file('DEMO_Manga page_TH.svg')!.async('string')
  expect(svg).toContain('id="lingo-translation"')
  expect(svg).toContain('เฮ้! รอฉันด้วย!')
  expect(errors).toEqual([])
})

test('rejects unsupported files with a reason', async ({ page }) => {
  await openApp(page, { sourceLang: 'en', targetLang: 'th' })
  await addFiles(page, { name: 'movie.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not a video') })
  const alert = page.getByRole('alert').filter({ hasText: 'movie.mp4' })
  await expect(alert).toContainText('ประเภทไฟล์ไม่รองรับ')
})

test('legacy .doc explains that it needs a server', async ({ page }) => {
  await openApp(page, { sourceLang: 'en', targetLang: 'th' })
  await clearList(page)
  // ลายเซ็นไฟล์ Word รุ่นเก่า (OLE)
  await addFiles(page, { name: 'old memo.doc', mimeType: 'application/msword', buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, ...new Array(64).fill(0)]) })
  await translateAll(page)
  await expect(page.getByText(/ไฟล์ \.doc สร้างใหม่ในเบราว์เซอร์ไม่ได้ — บันทึกเป็น \.docx/)).toBeVisible()
})

test('history downloads still work after a reload', async ({ page }) => {
  await openApp(page, { sourceLang: 'en', targetLang: 'th' })
  await clearList(page)
  await addFiles(page, fixture('notes.txt'))
  await translateAll(page)
  await page.reload()
  await page.getByRole('button', { name: 'ประวัติการแปล' }).first().click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTitle('ดาวน์โหลดไฟล์ที่แปลแล้ว (นามสกุลเดิม)').first().click(),
  ])
  expect(download.suggestedFilename()).toBe('DEMO_notes_TH.txt')
})

test('stopping mid-translation returns files to ready without errors', async ({ page }) => {
  const errors = await openApp(page, { sourceLang: 'en', targetLang: 'th' })
  await clearList(page)
  await addFiles(page, fixture('keys-comic.png'))
  await page.getByRole('button', { name: /แปลทั้งหมด/ }).click()
  await page.getByRole('button', { name: /หยุดการแปล/ }).click()
  await expect(page.getByText('หยุดการแปลแล้ว')).toBeVisible()
  await expect(page.getByText(/กำลังแปล \d+ ไฟล์/)).toHaveCount(0)
  // งาน OCR ที่ค้างอยู่ปิดตัวหลังจบงาน — รอให้ถ้ามี error ก็โผล่ออกมาก่อนตรวจ
  await page.waitForTimeout(3000)
  expect(errors).toEqual([])
})
