import { expect, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))

/** เปิดแอปด้วยการตั้งค่าภาษาที่กำหนด และเก็บ error ทั้งหมดของหน้าเว็บไว้ตรวจท้ายการทดสอบ */
export async function openApp(page: Page, settings: { sourceLang: string; targetLang: string; useGlossary?: boolean }) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.addInitScript((s) => {
    if (!sessionStorage.getItem('e2e-init')) {
      localStorage.setItem('lingo.settings.v1', JSON.stringify({ tone: 'natural', useGlossary: false, ...s }))
      sessionStorage.setItem('e2e-init', '1')
    }
  }, settings)
  await page.goto('/')
  await expect(page.getByText('Manga page.svg')).toBeVisible()
  return errors
}

export async function clearList(page: Page) {
  await page.getByRole('button', { name: 'ล้างรายการ' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'ล้างรายการ' }).click()
  await expect(page.getByText('Manga page.svg')).toHaveCount(0)
}

export async function addFiles(page: Page, files: Parameters<Page['setInputFiles']>[1]) {
  await page.locator('input[type=file]').first().setInputFiles(files)
}

/** สั่งแปลทั้งหมด แล้วรอจนทุกไฟล์เสร็จ (หรือผิดพลาด) */
export async function translateAll(page: Page, timeout = 90_000) {
  await page.getByRole('button', { name: /แปลทั้งหมด/ }).click()
  // รอข้อความสรุปตอนจบงาน (แปลเสร็จ/ไม่สำเร็จ) — ไฟล์ที่ล้มทันทีจะไม่ทันแสดง "กำลังแปล"
  await expect(page.getByText(/^(แปลเสร็จ \d+ ไฟล์|แปลไม่สำเร็จ \d+ ไฟล์)/).first()).toBeVisible({ timeout })
  await expect(page.getByText(/กำลังแปล \d+ ไฟล์/)).toHaveCount(0)
}

/** กดดาวน์โหลดทั้งหมด (ZIP) แล้วเปิดไฟล์ ZIP ที่ได้ */
export async function downloadAll(page: Page): Promise<JSZip> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /ดาวน์โหลดทั้งหมด/ }).click(),
  ])
  return JSZip.loadAsync(await readFile(await download.path()))
}

/** ข้อความทั้งหมดในหน้าแรกของ PDF (อ่านด้วย pdf.js ของแอปในเบราว์เซอร์) */
export async function pdfText(page: Page, bytes: Uint8Array): Promise<string> {
  return page.evaluate(
    async ({ b64, lib, worker }) => {
      const pdfjs = await import(/* @vite-ignore */ lib)
      pdfjs.GlobalWorkerOptions.workerSrc = (await import(/* @vite-ignore */ worker)).default
      const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const doc = await pdfjs.getDocument({ data }).promise
      const content = await (await doc.getPage(1)).getTextContent()
      return content.items.map((i: { str?: string }) => i.str ?? '').join('')
    },
    {
      b64: Buffer.from(bytes).toString('base64'),
      lib: '/@id/pdfjs-dist',
      worker: '/@id/pdfjs-dist/build/pdf.worker.min.mjs?url',
    },
  )
}

/** ลายเซ็นต้นไฟล์ — ยืนยันว่าเนื้อไฟล์ตรงกับนามสกุลจริง */
export const MAGIC: Record<string, number[]> = {
  pdf: [0x25, 0x50, 0x44, 0x46],
  png: [0x89, 0x50, 0x4e, 0x47],
  jpg: [0xff, 0xd8, 0xff],
  webp: [0x52, 0x49, 0x46, 0x46],
  gif: [0x47, 0x49, 0x46, 0x38],
  bmp: [0x42, 0x4d],
  tiff: [0x4d, 0x4d, 0x00, 0x2a],
  zip: [0x50, 0x4b, 0x03, 0x04],
}

export const startsWith = (bytes: Uint8Array, magic: number[]) => magic.every((b, i) => bytes[i] === b)
