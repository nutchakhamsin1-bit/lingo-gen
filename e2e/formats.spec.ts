import { expect, test } from '@playwright/test'
import JSZip from 'jszip'
import { addFiles, clearList, downloadAll, fixture, MAGIC, openApp, startsWith, translateAll } from './helpers.ts'

/** ไฟล์ข้อความ/เอกสารหลายนามสกุลในชุดเดียว — ตรวจว่าทุกไฟล์กลับมาเป็นนามสกุลเดิมและมีคำแปลอยู่ข้างใน */
const FILES: { name: string; inside?: string }[] = [
  { name: 'notes.txt' },
  { name: 'guide.md' },
  { name: 'prices.csv' },
  { name: 'strings.json' },
  { name: 'page.html' },
  { name: 'episode.srt' },
  { name: 'letter.rtf' },
  { name: 'deck.pptx', inside: 'ppt/slides/slide1.xml' },
  { name: 'report.odt', inside: 'content.xml' },
  { name: 'story.epub', inside: 'OEBPS/chapter1.xhtml' },
]

test('every format in a batch comes back with the same extension and translated text', async ({ page }) => {
  const errors = await openApp(page, { sourceLang: 'en', targetLang: 'th' })
  await clearList(page)
  await addFiles(
    page,
    FILES.map((f) => fixture(f.name)),
  )
  await translateAll(page)
  await expect(page.getByText(`แปลเสร็จครบ ${FILES.length} ไฟล์`)).toBeVisible()

  const zip = await downloadAll(page)
  for (const { name, inside } of FILES) {
    const [base, ext] = name.split('.')
    const output = zip.file(`DEMO_${base}_TH.${ext}`)
    expect(output, name).not.toBeNull()
    const bytes = await output!.async('uint8array')
    if (inside) {
      expect(startsWith(bytes, MAGIC.zip), name).toBe(true)
      const inner = await JSZip.loadAsync(bytes)
      expect(await inner.file(inside)!.async('string'), name).toContain('[TH]')
    } else if (ext === 'rtf') {
      expect(new TextDecoder().decode(bytes), name).toMatch(/^\{\\rtf1[\s\S]*\[TH\] Dear team,/)
    } else {
      expect(new TextDecoder().decode(bytes), name).toContain('[TH]')
    }
  }
  expect(errors).toEqual([])
})
