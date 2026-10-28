import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// ทดสอบส่วนที่ไม่ต้องวาดภาพ (อ่าน/เขียนไฟล์แต่ละนามสกุล) ใน jsdom — ส่วนที่ต้องใช้ canvas/PDF/OCR ทดสอบใน e2e/
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.ts'],
    },
  }),
)
