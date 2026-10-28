import { LANGUAGE_MAP } from '../../lib/constants'
import { escapeXml } from '../../lib/formats/segments'
import type { GlossaryEntry, LangCode, TextRegion } from '../../types'
import { translateFile } from './pipeline'
import { SAMPLE_TEXT_REGIONS } from './sampleContent'
import {
  TranslationAbortError,
  TranslationFailedError,
  type TranslateOptions,
  type TranslationOutcome,
  type TranslationRequest,
  type TranslationService,
} from './types'

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new TranslationAbortError())
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(new TranslationAbortError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

const TAG = /(<\/?[gx]\d+\/?>)/

/** แทนคำในคลังคำศัพท์ (เฉพาะข้อความ ไม่แตะแท็กรูปแบบ) */
function applyGlossary(segment: string, glossary: GlossaryEntry[]): string {
  if (!glossary.length) return segment
  return segment
    .split(TAG)
    .map((part) => {
      if (TAG.test(part)) return part
      return glossary.reduce((text, g) => {
        const term = escapeXml(g.source).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const bounded = /^\w/.test(g.source) && /\w$/.test(g.source) ? `\\b${term}\\b` : term
        return text.replace(new RegExp(bounded, 'gi'), escapeXml(g.target))
      }, part)
    })
    .join('')
}

/** คำแปลจำลอง: ติดรหัสภาษาปลายทางไว้หน้าข้อความเดิม เพื่อให้เห็นว่าข้อความไหนถูกแทนในไฟล์ */
const pseudoTranslate = (segment: string, lang: LangCode, glossary: GlossaryEntry[]) =>
  `[${LANGUAGE_MAP[lang].short}] ${applyGlossary(segment, glossary)}`

/**
 * บริการแปลจำลอง — ทำงานบนเครื่องของผู้ใช้ทั้งหมด ไม่ส่งไฟล์ไปที่ใด ไม่ต้องใช้ API key
 * เปิดไฟล์และสร้างไฟล์ผลลัพธ์นามสกุล/รูปแบบเดิมจริง แต่ข้อความเป็นคำแปลจำลอง "[TH] ข้อความเดิม"
 * (หน้ามังงะตัวอย่างใช้คำแปลจริงที่เตรียมไว้)
 *
 * เคล็ดลับทดสอบ: ตั้งชื่อไฟล์ให้มีคำว่า "error" เพื่อจำลองกรณีแปลล้มเหลว
 */
export class MockTranslationService implements TranslationService {
  readonly name = 'Mock translation (demo)'
  readonly isMock = true

  async translate(req: TranslationRequest, options: TranslateOptions): Promise<TranslationOutcome> {
    const s = req.settings
    const preset = req.isSample ? SAMPLE_TEXT_REGIONS[req.fileName] : undefined
    const presetRegions: TextRegion[] | undefined = preset?.map((r, i) => ({
      id: `region_${i + 1}`,
      box: { ...r.box },
      sourceText: r.source,
      translatedText: '',
    }))
    const shouldFail = /error|fail/i.test(req.fileName)
    const glossary = s.useGlossary ? req.glossary : []

    const outcome = await translateFile(
      req,
      options,
      async (segments, { signal, onProgress }) => {
        // ระยะเวลาจำลองตามจำนวนข้อความ — หลายไฟล์จะเสร็จไม่พร้อมกัน
        const duration = 900 + Math.min(segments.length, 300) * 6 + Math.random() * 900
        const steps = Math.ceil(duration / 110)
        const failAt = shouldFail ? 0.35 + Math.random() * 0.4 : Infinity
        for (let i = 1; i <= steps; i++) {
          await sleep(110, signal)
          if (i / steps >= failAt) throw new TranslationFailedError('บริการแปลตอบกลับผิดพลาด (จำลอง) — ลองอีกครั้งได้')
          onProgress(1 - Math.pow(1 - i / steps, 2.2))
        }
        return preset
          ? preset.map((r) => escapeXml(r.translations[s.targetLang]))
          : segments.map((seg) => pseudoTranslate(seg, s.targetLang, glossary))
      },
      { demo: true, presetRegions },
    )
    // ภาษาที่ "ตรวจจับได้" เป็นค่าจำลองเท่านั้น
    outcome.result.detectedLang = s.sourceLang === 'auto' ? (s.targetLang === 'en' ? 'th' : 'en') : null
    return outcome
  }
}
