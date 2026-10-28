import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // ไฟล์ตัวอย่างใน src/assets/samples ที่ Vite ไม่รู้จักเป็น asset โดยค่าเริ่มต้น
  assetsInclude: ['**/*.docx', '**/*.xlsx'],
})
