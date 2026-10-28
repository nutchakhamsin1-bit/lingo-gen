import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { addFiles, clearList, downloadAll, fixture, openApp, pdfText, translateAll } from './helpers.ts'

test('Chrome-printed Thai PDF: lost tone marks are recovered, mixed Thai/Japanese text is extractable', async ({ page }) => {
  const errors = await openApp(page, { sourceLang: 'auto', targetLang: 'ja' })

  // เงื่อนไขของการทดสอบ: ไฟล์ตัวอย่างต้องมีวรรณยุกต์ที่ Chrome เก็บเป็นรหัสว่างจริง ไม่งั้นการทดสอบนี้ไม่ได้พิสูจน์อะไร
  const source = await pdfText(page, await readFile(fixture('thai-quotation.pdf')))
  expect(source).toContain('\u0000')

  await clearList(page)
  await addFiles(page, fixture('thai-quotation.pdf'))
  await translateAll(page)
  await expect(page.getByText('แปลเสร็จครบ 1 ไฟล์')).toBeVisible()

  const zip = await downloadAll(page)
  const text = await pdfText(page, await zip.file('DEMO_thai-quotation_JA.pdf')!.async('uint8array'))
  for (const phrase of ['[JA] ใบเสนอราคา', '[JA] รวมเป็นเงินทั้งสิ้น', 'เงื่อนไข', 'ทั้งหมด', 'เพิ่มฟังก์ชัน', 'หนึ่งเดือน']) {
    expect(text).toContain(phrase)
  }
  expect(text).not.toContain('\u0000')
  expect(errors).toEqual([])
})

test('sample PDF keeps Latin text intact with a CJK target font', async ({ page }) => {
  const errors = await openApp(page, { sourceLang: 'en', targetLang: 'ja' })
  await translateAll(page)
  const zip = await downloadAll(page)
  const text = await pdfText(page, await zip.file('DEMO_Brand guidelines_JA.pdf')!.async('uint8array'))
  expect(text).toContain('[JA] Brand Guidelines')
  expect(text).toContain('[JA] Our voice is clear, warm and confident.')
  expect(errors).toEqual([])
})
