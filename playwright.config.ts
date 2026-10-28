import { defineConfig, devices } from '@playwright/test'

const PORT = 5180
const CI = !!process.env.CI

/**
 * ทดสอบแอปจริงในเบราว์เซอร์ — ส่วนที่ jsdom ทำไม่ได้: PDF (pdf.js + canvas), OCR, วาดคำแปลลงภาพ, ดาวน์โหลด ZIP
 * บนเครื่องใช้ Chrome ที่ติดตั้งอยู่แล้ว · ใน CI ใช้ Chromium ของ Playwright
 * ต้องต่ออินเทอร์เน็ต: ฟอนต์ PDF และโมเดล OCR โหลดจาก CDN (ครั้งแรก)
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chrome',
      use: { ...devices['Desktop Chrome'], channel: CI ? undefined : 'chrome', viewport: { width: 1400, height: 1000 } },
    },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !CI,
    timeout: 60_000,
  },
})
