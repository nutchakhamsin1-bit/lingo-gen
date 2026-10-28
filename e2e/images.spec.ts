import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { addFiles, clearList, downloadAll, fixture, MAGIC, openApp, startsWith, translateAll } from './helpers.ts'

/** สร้างภาพนามสกุลอื่นจาก PNG ในหน้าเว็บ (JPG/WebP ด้วยเบราว์เซอร์, GIF/TIFF ด้วยไลบรารีของแอป, BMP เขียนเอง) แล้วเพิ่มเข้ารายการ */
async function addDerivedImages(page: import('@playwright/test').Page, png: Buffer) {
  await page.evaluate(
    async ({ b64, gifLib, tiffLib }) => {
      const img = new Image()
      img.src = `data:image/png;base64,${b64}`
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const { data } = ctx.getImageData(0, 0, c.width, c.height)
      const blob = (type: string) => new Promise<Blob>((r) => c.toBlob((b) => r(b!), type, 0.92))
      const gm = await import(/* @vite-ignore */ gifLib)
      const { GIFEncoder, quantize, applyPalette } = gm.quantize ? gm : gm.default
      const palette = quantize(data, 256)
      const gif = GIFEncoder()
      gif.writeFrame(applyPalette(data, palette), c.width, c.height, { palette })
      gif.finish()
      const UTIF = (await import(/* @vite-ignore */ tiffLib)).default
      const row = Math.ceil((c.width * 3) / 4) * 4
      const bmp = new DataView(new ArrayBuffer(54 + row * c.height))
      bmp.setUint16(0, 0x4d42, true)
      bmp.setUint32(2, 54 + row * c.height, true)
      bmp.setUint32(10, 54, true)
      bmp.setUint32(14, 40, true)
      bmp.setInt32(18, c.width, true)
      bmp.setInt32(22, c.height, true)
      bmp.setUint16(26, 1, true)
      bmp.setUint16(28, 24, true)
      for (let y = 0; y < c.height; y++)
        for (let x = 0; x < c.width; x++) {
          const s = ((c.height - 1 - y) * c.width + x) * 4
          const o = 54 + y * row + x * 3
          bmp.setUint8(o, data[s + 2])
          bmp.setUint8(o + 1, data[s + 1])
          bmp.setUint8(o + 2, data[s])
        }
      const files = [
        new File([await blob('image/jpeg')], 'comic.jpg', { type: 'image/jpeg' }),
        new File([await blob('image/webp')], 'comic.webp', { type: 'image/webp' }),
        new File([gif.bytes()], 'comic.gif', { type: 'image/gif' }),
        new File([bmp.buffer], 'comic.bmp', { type: 'image/bmp' }),
        new File([UTIF.encodeImage(data.buffer, c.width, c.height)], 'comic.tiff', { type: 'image/tiff' }),
      ]
      const dt = new DataTransfer()
      files.forEach((f) => dt.items.add(f))
      const input = document.querySelector<HTMLInputElement>('input[type=file]')!
      input.files = dt.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    },
    { b64: png.toString('base64'), gifLib: '/@id/gifenc', tiffLib: '/@id/utif' },
  )
}

test('OCR finds every speech bubble and each image comes back in its own format', async ({ page }) => {
  test.slow() // ครั้งแรกต้องโหลดโมเดล OCR จาก CDN
  const errors = await openApp(page, { sourceLang: 'en', targetLang: 'th' })
  await clearList(page)
  await addFiles(page, fixture('keys-comic.png'))
  await addDerivedImages(page, await readFile(fixture('keys-comic.png')))
  await translateAll(page, 240_000)
  await expect(page.getByText('แปลเสร็จครบ 6 ไฟล์')).toBeVisible()

  // หน้าเปรียบเทียบ: OCR เจอครบ 3 ช่องคำพูด ข้อความถูกทุกตัว
  await page.getByRole('button', { name: 'keys-comic.png', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('ข้อความในภาพ · 3 จุด')).toBeVisible()
  for (const bubble of ['WHERE DID YOU PUT THE KEYS?', 'I LEFT THEM ON THE TABLE.', 'NOT THERE!']) {
    await expect(dialog.getByText(bubble, { exact: true })).toBeVisible()
  }
  await dialog.getByRole('button', { name: 'ปิด', exact: true }).click()

  const zip = await downloadAll(page)
  const outputs: [string, number[]][] = [
    ['DEMO_keys-comic_TH.png', MAGIC.png],
    ['DEMO_comic_TH.jpg', MAGIC.jpg],
    ['DEMO_comic_TH.webp', MAGIC.webp],
    ['DEMO_comic_TH.gif', MAGIC.gif],
    ['DEMO_comic_TH.bmp', MAGIC.bmp],
    ['DEMO_comic_TH.tiff', MAGIC.tiff],
  ]
  for (const [name, magic] of outputs) {
    const file = zip.file(name)
    expect(file, name).not.toBeNull()
    expect(startsWith(await file!.async('uint8array'), magic), name).toBe(true)
  }
  expect(errors).toEqual([])
})
