import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_SETTINGS, SAMPLE_FILES, STORAGE_KEYS } from '../lib/constants'
import { uid } from '../lib/format'
import { deleteOutputs, saveOutput } from '../lib/outputStore'
import { validateIncoming } from '../lib/validation'
import { isAbortError, type TranslationService } from '../services/translation'
import type {
  GlossaryEntry,
  HistoryEntry,
  Rejection,
  TranslationSettings,
  WorkFile,
} from '../types'
import { useLocalStorage } from './useLocalStorage'
import type { ToastKind } from './useToast'

const HISTORY_LIMIT = 100

/** data URL (base64) → File */
function dataUrlToFile(dataUrl: string, name: string): File {
  const [head, body] = dataUrl.split(',')
  const type = /data:([^;,]+)/.exec(head)?.[1] ?? 'application/octet-stream'
  const bytes = head.includes(';base64') ? Uint8Array.from(atob(body), (c) => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(body))
  return new File([bytes], name, { type })
}

function makeSampleFiles(): WorkFile[] {
  const now = new Date().toISOString()
  return SAMPLE_FILES.map((s) => {
    const file = dataUrlToFile(s.dataUrl, s.name)
    return {
      id: uid('sample'),
      name: s.name,
      size: file.size,
      ext: s.ext,
      isSample: true,
      file,
      status: 'ready',
      progress: 0,
      addedAt: now,
    }
  })
}

function sanitizeSettings(raw: unknown): TranslationSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<TranslationSettings>
  return { ...DEFAULT_SETTINGS, ...r }
}

export type Notify = (kind: ToastKind, title: string, detail?: string) => void

export function useWorkspace(service: TranslationService, notify: Notify) {
  const [files, setFiles] = useState<WorkFile[]>(makeSampleFiles)
  const [rawSettings, setRawSettings] = useLocalStorage<TranslationSettings>(STORAGE_KEYS.settings, DEFAULT_SETTINGS)
  const [glossary, setGlossary] = useLocalStorage<GlossaryEntry[]>(STORAGE_KEYS.glossary, [])
  const [history, setHistory] = useLocalStorage<HistoryEntry[]>(STORAGE_KEYS.history, [])
  const [rejections, setRejections] = useState<Rejection[]>([])
  const [isRunning, setIsRunning] = useState(false)

  const settings = useMemo(() => sanitizeSettings(rawSettings), [rawSettings])
  const settingsRef = useRef(settings)
  const glossaryRef = useRef(glossary)
  const filesRef = useRef(files)
  const abortRef = useRef<AbortController | null>(null)
  const activeCount = useRef(0)

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])
  useEffect(() => {
    glossaryRef.current = glossary
  }, [glossary])
  useEffect(() => {
    filesRef.current = files
  }, [files])

  const settingsError = settings.sourceLang === settings.targetLang ? 'ภาษาต้นฉบับและภาษาปลายทางต้องไม่เหมือนกัน' : null

  const updateSettings = useCallback(
    (patch: Partial<TranslationSettings>) => setRawSettings((prev) => ({ ...sanitizeSettings(prev), ...patch })),
    [setRawSettings],
  )

  const updateFile = useCallback((id: string, patch: Partial<WorkFile>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }, [])

  /* ---------- ไฟล์ ---------- */

  const addFiles = useCallback(
    (incoming: File[]) => {
      const { accepted, rejected } = validateIncoming(incoming, filesRef.current)
      if (accepted.length) {
        setFiles((prev) => [...prev, ...accepted])
        notify('success', `เพิ่ม ${accepted.length} ไฟล์เข้ารายการแล้ว`)
      }
      if (rejected.length) {
        setRejections(rejected)
        if (!accepted.length) notify('error', `ไม่สามารถเพิ่ม ${rejected.length} ไฟล์`, rejected[0].reason)
      }
      return { accepted, rejected }
    },
    [notify],
  )

  const clearRejections = useCallback(() => setRejections([]), [])

  const removeFile = useCallback(
    (id: string) => {
      const target = filesRef.current.find((f) => f.id === id)
      if (!target) return
      if (target.status === 'translating') {
        notify('info', 'ไฟล์นี้กำลังแปลอยู่', 'กดหยุดการแปลก่อนจึงจะลบได้')
        return
      }
      setFiles((prev) => prev.filter((f) => f.id !== id))
    },
    [notify],
  )

  const clearFiles = useCallback(() => {
    if (activeCount.current > 0) {
      notify('info', 'กำลังแปลอยู่', 'กดหยุดการแปลก่อนจึงจะล้างรายการได้')
      return
    }
    setFiles([])
    setRejections([])
  }, [notify])

  const loadSamples = useCallback(() => {
    const existing = new Set(filesRef.current.map((f) => f.name.toLowerCase()))
    const fresh = makeSampleFiles().filter((s) => !existing.has(s.name.toLowerCase()))
    if (!fresh.length) {
      notify('info', 'ไฟล์ตัวอย่างอยู่ในรายการแล้ว')
      return
    }
    setFiles((prev) => [...prev, ...fresh])
    notify('success', `เพิ่มไฟล์ตัวอย่าง ${fresh.length} รายการ`)
  }, [notify])

  /* ---------- การแปล ---------- */

  const runFiles = useCallback(
    async (ids: string[]) => {
      const current = settingsRef.current
      if (current.sourceLang === current.targetLang) {
        notify('error', 'ตั้งค่าภาษายังไม่ถูกต้อง', 'ภาษาต้นฉบับและปลายทางต้องไม่เหมือนกัน')
        return
      }
      const targets = filesRef.current.filter(
        (f) => ids.includes(f.id) && (f.status === 'ready' || f.status === 'error'),
      )
      if (!targets.length) return

      if (!abortRef.current || abortRef.current.signal.aborted) abortRef.current = new AbortController()
      const controller = abortRef.current

      // snapshot การตั้งค่าและคลังคำศัพท์ให้เป็นชุดเดียวกับงานนี้
      const settingsSnapshot: TranslationSettings = { ...current }
      const glossarySnapshot = current.useGlossary ? glossaryRef.current.map((g) => ({ ...g })) : []

      activeCount.current += targets.length
      setIsRunning(true)
      const targetIds = new Set(targets.map((t) => t.id))
      setFiles((prev) =>
        prev.map((f) =>
          targetIds.has(f.id) ? { ...f, status: 'translating', progress: 0, error: undefined, result: undefined } : f,
        ),
      )

      let done = 0
      let failed = 0
      let aborted = 0
      await Promise.allSettled(
        targets.map(async (t) => {
          try {
            const { result, output } = await service.translate(
              {
                fileId: t.id,
                fileName: t.name,
                ext: t.ext,
                size: t.size,
                isSample: t.isSample,
                file: t.file,
                settings: settingsSnapshot,
                glossary: glossarySnapshot,
              },
              { signal: controller.signal, onProgress: (p) => updateFile(t.id, { progress: p }) },
            )
            await saveOutput(result.jobId, output)
            updateFile(t.id, { status: 'done', progress: 100, result, error: undefined })
            const entry: HistoryEntry = {
              id: uid('hist'),
              completedAt: result.completedAt,
              fileName: t.name,
              ext: t.ext,
              size: t.size,
              isSample: t.isSample,
              settings: result.settings,
              result,
            }
            setHistory((prev) => [entry, ...prev].slice(0, HISTORY_LIMIT))
            done++
          } catch (err) {
            if (isAbortError(err)) {
              aborted++
              updateFile(t.id, { status: 'ready', progress: 0 })
            } else {
              failed++
              const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'
              updateFile(t.id, { status: 'error', progress: 0, error: message })
            }
          } finally {
            activeCount.current = Math.max(0, activeCount.current - 1)
            if (activeCount.current === 0) {
              setIsRunning(false)
              abortRef.current = null
            }
          }
        }),
      )

      if (aborted && !done && !failed) notify('info', 'หยุดการแปลแล้ว', `${aborted} ไฟล์กลับไปสถานะพร้อมแปล`)
      else if (failed && !done) notify('error', `แปลไม่สำเร็จ ${failed} ไฟล์`, 'ดูเหตุผลในรายการไฟล์ แล้วลองอีกครั้งได้')
      else if (done)
        notify(
          failed ? 'info' : 'success',
          `แปลเสร็จ ${done} ไฟล์${failed ? ` · ไม่สำเร็จ ${failed}` : ''}`,
          service.isMock ? 'ไฟล์นามสกุลและรูปแบบเดิม · ข้อความเป็นคำแปลจำลอง (โหมดทดลอง)' : 'ดาวน์โหลดได้เป็นไฟล์นามสกุลและรูปแบบเดิม',
        )
    },
    [notify, service, setHistory, updateFile],
  )

  const translateAll = useCallback(() => {
    const ids = filesRef.current.filter((f) => f.status === 'ready').map((f) => f.id)
    if (!ids.length) {
      notify('info', 'ไม่มีไฟล์ที่พร้อมแปล', 'เพิ่มไฟล์ หรือกดลองอีกครั้งที่ไฟล์ที่ผิดพลาด')
      return
    }
    void runFiles(ids)
  }, [notify, runFiles])

  const retryFile = useCallback((id: string) => void runFiles([id]), [runFiles])

  const stopAll = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  /* ---------- คลังคำศัพท์ ---------- */

  const addGlossaryEntry = useCallback(
    (source: string, target: string): string | null => {
      const s = source.trim()
      const t = target.trim()
      if (!s || !t) return 'กรอกทั้งคำต้นฉบับและคำแปล'
      if (glossaryRef.current.some((g) => g.source.toLowerCase() === s.toLowerCase())) {
        return `มีคำว่า “${s}” ในคลังแล้ว`
      }
      setGlossary((prev) => [{ id: uid('term'), source: s, target: t, createdAt: new Date().toISOString() }, ...prev])
      return null
    },
    [setGlossary],
  )

  const removeGlossaryEntry = useCallback(
    (id: string) => setGlossary((prev) => prev.filter((g) => g.id !== id)),
    [setGlossary],
  )

  /* ---------- ประวัติ ---------- */

  /** ลบไฟล์ผลลัพธ์ที่ไม่มีใครอ้างถึงแล้ว (ไฟล์ที่ยังอยู่ในหน้าแปลเอกสารต้องดาวน์โหลดได้ต่อ) */
  const dropOutputs = useCallback((entries: HistoryEntry[]) => {
    const inWorkspace = new Set(filesRef.current.map((f) => f.result?.jobId))
    void deleteOutputs(entries.map((h) => h.result.jobId).filter((id) => !inWorkspace.has(id)))
  }, [])

  const removeHistoryEntry = useCallback(
    (id: string) => {
      dropOutputs(history.filter((h) => h.id === id))
      setHistory((prev) => prev.filter((h) => h.id !== id))
    },
    [history, setHistory, dropOutputs],
  )
  const clearHistory = useCallback(() => {
    dropOutputs(history)
    setHistory([])
  }, [history, setHistory, dropOutputs])

  /* ---------- ค่าที่คำนวณ ---------- */

  const counts = useMemo(() => {
    const c = { total: files.length, ready: 0, translating: 0, done: 0, error: 0 }
    for (const f of files) c[f.status]++
    return c
  }, [files])

  const batchProgress = useMemo(() => {
    if (!files.length) return 0
    const sum = files.reduce((acc, f) => acc + (f.status === 'done' ? 100 : f.status === 'translating' ? f.progress : 0), 0)
    return Math.round(sum / files.length)
  }, [files])

  return {
    files,
    settings,
    settingsError,
    updateSettings,
    glossary,
    history,
    rejections,
    clearRejections,
    isRunning,
    counts,
    batchProgress,
    addFiles,
    removeFile,
    clearFiles,
    loadSamples,
    translateAll,
    retryFile,
    stopAll,
    addGlossaryEntry,
    removeGlossaryEntry,
    removeHistoryEntry,
    clearHistory,
  }
}

export type Workspace = ReturnType<typeof useWorkspace>
