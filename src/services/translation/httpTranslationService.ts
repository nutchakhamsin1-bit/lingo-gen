import { canBuildLocally, OUTPUT_MIME, outputFileName } from '../../lib/formats'
import { uid } from '../../lib/format'
import { translateFile } from './pipeline'
import {
  TranslationAbortError,
  TranslationFailedError,
  type TranslateOptions,
  type TranslationOutcome,
  type TranslationRequest,
  type TranslationService,
} from './types'

interface JobStatus {
  status: 'queued' | 'running' | 'done' | 'error'
  progress?: number
  error?: string
  /** งานแปลข้อความ: คำแปลตามลำดับ segments */
  translations?: string[]
  /** งานแปลทั้งไฟล์ (รูปแบบที่เบราว์เซอร์สร้างเองไม่ได้): ลิงก์ดาวน์โหลดไฟล์ที่แปลแล้ว */
  outputUrl?: string
}

/**
 * บริการแปลผ่าน Backend ของคุณเอง — API key ของผู้ให้บริการแปลอยู่ฝั่ง backend เท่านั้น
 *
 * 1) ไฟล์ที่เบราว์เซอร์อ่าน/สร้างเองได้ (เกือบทุกนามสกุล): แอปแยกข้อความ (และ OCR รูปภาพ) บนเครื่อง
 *    ส่งเฉพาะข้อความไปแปล แล้วสร้างไฟล์ผลลัพธ์นามสกุล/รูปแบบเดิมเอง — ตัวไฟล์ไม่ถูกส่งออกไป
 *      POST {baseUrl}/jobs   JSON { fileName, ext, segments: string[], settings, glossary } → { jobId }
 *      GET  {baseUrl}/jobs/{jobId} → { status, progress, translations?: string[], error? }
 *    segments อาจมีแท็ก <g1>…</g1> / <x1/> (รูปแบบตัวหนา ลิงก์ ขึ้นบรรทัด) และ escape แบบ XML
 *    — ต้องคงแท็กไว้ในคำแปล (เช่น DeepL tag_handling=xml หรือสั่ง LLM ให้คงแท็ก)
 *
 * 2) DOC XLS PPT HEIC (เบราว์เซอร์สร้างไฟล์เหล่านี้ไม่ได้): อัปโหลดไฟล์ให้ backend แปลงและแปลทั้งไฟล์
 *      POST {baseUrl}/jobs   multipart { file, settings, glossary } → { jobId }
 *      GET  {baseUrl}/jobs/{jobId} → { status, progress, outputUrl?, error? }
 */
export class HttpTranslationService implements TranslationService {
  readonly name = 'Lingo API'
  readonly isMock = false
  private readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  async translate(req: TranslationRequest, options: TranslateOptions): Promise<TranslationOutcome> {
    if (!canBuildLocally(req.ext)) return this.translateOnServer(req, options)
    return translateFile(
      req,
      options,
      async (segments, { signal, onProgress }) => {
        const body = JSON.stringify({ fileName: req.fileName, ext: req.ext, segments, settings: req.settings, glossary: req.glossary })
        const done = await this.runJob(
          fetch(`${this.baseUrl}/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal }),
          signal,
          onProgress,
        )
        if (!Array.isArray(done.translations)) throw new TranslationFailedError('บริการแปลไม่ได้ส่งคำแปลกลับมา')
        return done.translations
      },
      { demo: false },
    )
  }

  private async translateOnServer(req: TranslationRequest, { signal, onProgress }: TranslateOptions): Promise<TranslationOutcome> {
    if (!req.file) throw new TranslationFailedError('ไม่พบไฟล์ต้นฉบับ — เพิ่มไฟล์อีกครั้ง')
    const startedAt = new Date().toISOString()
    const form = new FormData()
    form.append('file', req.file, req.fileName)
    form.append('settings', JSON.stringify(req.settings))
    form.append('glossary', JSON.stringify(req.glossary))
    const done = await this.runJob(fetch(`${this.baseUrl}/jobs`, { method: 'POST', body: form, signal }), signal, (r) =>
      onProgress(Math.round(r * 95)),
    )
    if (!done.outputUrl) throw new TranslationFailedError('บริการแปลไม่ได้ส่งไฟล์ที่แปลแล้วกลับมา')
    const res = await fetch(new URL(done.outputUrl, `${this.baseUrl}/`), { signal })
    if (!res.ok) throw new TranslationFailedError(`ดาวน์โหลดไฟล์ที่แปลแล้วไม่สำเร็จ (HTTP ${res.status})`)
    const output = new Blob([await res.arrayBuffer()], { type: OUTPUT_MIME[req.ext] })
    onProgress(100)
    return {
      output,
      result: {
        jobId: uid('job'),
        fileId: req.fileId,
        fileName: req.fileName,
        ext: req.ext,
        size: req.size,
        isSample: req.isSample,
        settings: { ...req.settings },
        detectedLang: null,
        sourceText: null,
        sourceNote: 'แปลทั้งไฟล์บนเซิร์ฟเวอร์ — ดาวน์โหลดไฟล์เพื่อดูผลลัพธ์',
        translatedText: 'แปลทั้งไฟล์บนเซิร์ฟเวอร์ — ดาวน์โหลดไฟล์เพื่อดูผลลัพธ์',
        outputName: outputFileName(req.fileName, req.settings.targetLang, false),
        segmentCount: 0,
        glossaryApplied: req.settings.useGlossary ? req.glossary.map((g) => ({ ...g })) : [],
        isDemo: false,
        startedAt,
        completedAt: new Date().toISOString(),
      },
    }
  }

  /** สร้างงาน แล้วถามสถานะทุก 1 วินาทีจนเสร็จ */
  private async runJob(create: Promise<Response>, signal: AbortSignal, onProgress: (ratio: number) => void): Promise<JobStatus> {
    const created = await create
    if (!created.ok) throw new TranslationFailedError(`สร้างงานแปลไม่สำเร็จ (HTTP ${created.status})`)
    const { jobId } = (await created.json()) as { jobId: string }
    for (;;) {
      if (signal.aborted) throw new TranslationAbortError()
      await new Promise((r) => setTimeout(r, 1000))
      const res = await fetch(`${this.baseUrl}/jobs/${encodeURIComponent(jobId)}`, { signal })
      if (!res.ok) throw new TranslationFailedError(`ตรวจสอบสถานะงานไม่สำเร็จ (HTTP ${res.status})`)
      const data = (await res.json()) as JobStatus
      if (typeof data.progress === 'number') onProgress(Math.max(0, Math.min(100, data.progress)) / 100)
      if (data.status === 'done') return data
      if (data.status === 'error') throw new TranslationFailedError(data.error ?? 'บริการแปลตอบกลับผิดพลาด')
    }
  }
}
