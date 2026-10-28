import { HttpTranslationService } from './httpTranslationService'
import { MockTranslationService } from './mockTranslationService'
import type { TranslationService } from './types'

export type { TranslationOutcome, TranslationRequest, TranslationService, TranslateOptions } from './types'
export { isAbortError, TranslationAbortError, TranslationFailedError } from './types'

/**
 * โรงงานเลือกบริการแปล — สลับด้วย environment variable ตอน build
 *   VITE_TRANSLATION_PROVIDER=mock  (ค่าเริ่มต้น)
 *   VITE_TRANSLATION_PROVIDER=http  + VITE_TRANSLATION_API_URL=https://your-backend.example.com/api
 *
 * ไม่มี API key ใน Frontend: backend เป็นผู้ถือ credential ของผู้ให้บริการแปล
 */
export function createTranslationService(): TranslationService {
  const provider = (import.meta.env.VITE_TRANSLATION_PROVIDER ?? 'mock') as string
  if (provider === 'http') {
    const baseUrl = (import.meta.env.VITE_TRANSLATION_API_URL ?? '/api') as string
    return new HttpTranslationService(baseUrl.replace(/\/$/, ''))
  }
  return new MockTranslationService()
}
