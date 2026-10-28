import { loadFormatHandler, outputFileName, serverOnlyMessage } from '../../lib/formats'
import { toPlainText } from '../../lib/formats/segments'
import type { OpenedDocument } from '../../lib/formats'
import { uid } from '../../lib/format'
import type { TextRegion } from '../../types'
import {
  isAbortError,
  TranslationAbortError,
  TranslationFailedError,
  type TranslateOptions,
  type TranslationOutcome,
  type TranslationRequest,
} from './types'

/** แปลรายการ segment (รูปแบบใน lib/formats/segments.ts) — คืนคำแปลตามลำดับเดิม จำนวนเท่าเดิม */
export type SegmentTranslator = (
  segments: string[],
  options: { signal: AbortSignal; onProgress: (ratio: number) => void },
) => Promise<string[]>

const PREVIEW_LIMIT = 60

const preview = (segments: string[]) =>
  segments
    .slice(0, PREVIEW_LIMIT)
    .map((s) => toPlainText(s, ' '))
    .join('\n\n') + (segments.length > PREVIEW_LIMIT ? `\n\n… และอีก ${segments.length - PREVIEW_LIMIT} ส่วน` : '')

const wrapError = (err: unknown, fallback: string) =>
  isAbortError(err)
    ? new TranslationAbortError()
    : err instanceof TranslationFailedError
      ? err
      : new TranslationFailedError(err instanceof Error && err.message ? err.message : fallback)

/**
 * เปิดไฟล์ → แปลเฉพาะข้อความ → สร้างไฟล์ใหม่นามสกุลและรูปแบบเดิม
 * แถบความคืบหน้า: เปิดไฟล์/OCR 0–60% · แปล 60–90% · สร้างไฟล์ 90–100%
 */
export async function translateFile(
  req: TranslationRequest,
  { signal, onProgress }: TranslateOptions,
  translateSegments: SegmentTranslator,
  options: { demo: boolean; presetRegions?: TextRegion[] },
): Promise<TranslationOutcome> {
  const startedAt = new Date().toISOString()
  if (!req.file) throw new TranslationFailedError('ไม่พบไฟล์ต้นฉบับ — เพิ่มไฟล์อีกครั้ง')
  const loader = loadFormatHandler(req.ext)
  if (!loader) throw new TranslationFailedError(serverOnlyMessage(req.ext))
  const s = req.settings

  let doc: OpenedDocument
  try {
    doc = await (await loader).open(req.file, {
      ext: req.ext,
      sourceLang: s.sourceLang,
      targetLang: s.targetLang,
      signal,
      onProgress: (r) => onProgress(Math.round(r * 60)),
      presetRegions: options.presetRegions,
    })
  } catch (err) {
    throw wrapError(err, `เปิดไฟล์ .${req.ext} ไม่สำเร็จ`)
  }
  if (signal.aborted) throw new TranslationAbortError()
  onProgress(60)

  let translations: string[] = []
  if (doc.segments.length) {
    try {
      translations = await translateSegments(doc.segments, {
        signal,
        onProgress: (r) => onProgress(60 + Math.round(r * 30)),
      })
    } catch (err) {
      throw wrapError(err, 'บริการแปลตอบกลับผิดพลาด')
    }
    if (translations.length !== doc.segments.length) {
      throw new TranslationFailedError('บริการแปลส่งคำแปลกลับมาไม่ครบทุกส่วน — ลองอีกครั้ง')
    }
  }

  let output: Blob
  try {
    output = await doc.build(translations)
  } catch (err) {
    throw wrapError(err, `สร้างไฟล์ .${req.ext} ที่แปลแล้วไม่สำเร็จ`)
  }
  onProgress(100)

  const count = doc.segments.length
  return {
    output,
    result: {
      jobId: uid('job'),
      fileId: req.fileId,
      fileName: req.fileName,
      ext: req.ext,
      size: req.size,
      isSample: req.isSample,
      settings: { ...s },
      detectedLang: null,
      sourceText: count ? preview(doc.segments) : null,
      sourceNote:
        doc.note ?? (count ? `พบข้อความ ${count.toLocaleString()} ส่วน — รูป ตาราง และรูปแบบเอกสารคงเดิม` : 'ไม่พบข้อความให้แปลในไฟล์นี้'),
      translatedText: count ? preview(translations) : 'ไม่มีข้อความให้แปล — ไฟล์ผลลัพธ์เหมือนต้นฉบับ',
      outputName: outputFileName(req.fileName, s.targetLang, options.demo),
      segmentCount: count,
      textRegions: doc.regions?.map((r, i) => ({ ...r, translatedText: toPlainText(translations[i] ?? '') })),
      glossaryApplied: s.useGlossary ? req.glossary.map((g) => ({ ...g })) : [],
      isDemo: options.demo,
      startedAt,
      completedAt: new Date().toISOString(),
    },
  }
}
