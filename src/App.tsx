import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DemoNotice } from './components/DemoNotice'
import { FileList } from './components/FileList'
import { HelpModal, ProfileModal } from './components/HelpModal'
import { Hero } from './components/Hero'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { TranslationPreview } from './components/TranslationPreview'
import { TranslationSettings } from './components/TranslationSettings'
import { UploadDropzone } from './components/UploadDropzone'
import { Button } from './components/ui/Button'
import { Modal } from './components/ui/Modal'
import { Toaster } from './components/ui/Toaster'
import { GlossaryView } from './components/views/GlossaryView'
import { HistoryView } from './components/views/HistoryView'
import { ToastProvider, useToast } from './hooks/useToast'
import { useWorkspace } from './hooks/useWorkspace'
import { downloadBlob, downloadResultsZip } from './lib/download'
import { ACCEPT_ATTR } from './lib/constants'
import { loadOutput } from './lib/outputStore'
import { createTranslationService } from './services/translation'
import type { TranslationResult, View, WorkFile } from './types'

const translationService = createTranslationService()

function AppShell() {
  const { push } = useToast()
  const ws = useWorkspace(translationService, push)
  const [view, setView] = useState<View>('translate')
  const [menuOpen, setMenuOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [preview, setPreview] = useState<TranslationResult | null>(null)
  const [zipping, setZipping] = useState(false)
  const pickerRef = useRef<HTMLInputElement>(null)
  const mainRef = useRef<HTMLElement>(null)

  const navigate = useCallback((v: View) => {
    setView(v)
    setMenuOpen(false)
    mainRef.current?.scrollTo?.({ top: 0 })
    window.scrollTo({ top: 0 })
  }, [])

  // เตือนก่อนปิดแท็บขณะกำลังแปล
  useEffect(() => {
    if (!ws.isRunning) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [ws.isRunning])

  const glossaryPersisted = useMemo(() => {
    try {
      const probe = '__lingo_probe__'
      window.localStorage.setItem(probe, '1')
      window.localStorage.removeItem(probe)
      return true
    } catch {
      return false
    }
  }, [])

  const openPreview = useCallback((file: WorkFile) => {
    if (file.result) setPreview(file.result)
  }, [])

  /** ไฟล์ต้นฉบับบนเครื่องของผลลัพธ์ (มีเฉพาะเมื่อไฟล์ยังอยู่ในรายการ) */
  const sourceFileOf = useCallback(
    (result: TranslationResult) => ws.files.find((f) => f.id === result.fileId)?.file,
    [ws.files],
  )

  const downloadOne = useCallback(
    async (result: TranslationResult) => {
      const blob = await loadOutput(result.jobId)
      if (!blob) {
        push('error', 'ไม่พบไฟล์ที่แปลแล้ว', 'ไฟล์ผลลัพธ์เก่าถูกลบออกจากเบราว์เซอร์แล้ว — แปลไฟล์นี้อีกครั้ง')
        return
      }
      try {
        downloadBlob(blob, result.outputName)
        push('success', 'เริ่มดาวน์โหลดแล้ว', result.outputName)
      } catch {
        push('error', 'ดาวน์โหลดไม่สำเร็จ', 'เบราว์เซอร์อาจบล็อกการดาวน์โหลด ลองอีกครั้ง')
      }
    },
    [push],
  )

  const downloadAll = useCallback(async () => {
    const results = ws.files.filter((f) => f.status === 'done' && f.result).map((f) => f.result as TranslationResult)
    if (!results.length) return
    setZipping(true)
    try {
      const count = await downloadResultsZip(results, (r) => loadOutput(r.jobId))
      if (count) push('success', `รวม ${count} ไฟล์เป็น ZIP แล้ว`, 'ทุกไฟล์เป็นนามสกุลและรูปแบบเดิม')
      else push('error', 'ไม่พบไฟล์ที่แปลแล้ว', 'แปลไฟล์อีกครั้งแล้วดาวน์โหลดใหม่')
    } catch {
      push('error', 'สร้างไฟล์ ZIP ไม่สำเร็จ', 'ลองอีกครั้ง หรือดาวน์โหลดทีละไฟล์')
    } finally {
      setZipping(false)
    }
  }, [ws.files, push])

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[80] focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
      >
        ข้ามไปยังเนื้อหาหลัก
      </a>
      <Sidebar
        view={view}
        onNavigate={navigate}
        mobileOpen={menuOpen}
        onCloseMobile={() => setMenuOpen(false)}
        onHelp={() => {
          setMenuOpen(false)
          setHelpOpen(true)
        }}
        onProfile={() => {
          setMenuOpen(false)
          setProfileOpen(true)
        }}
        fileCount={ws.files.length}
        glossaryCount={ws.glossary.length}
      />

      <div className="lg:pl-[248px]">
        <TopBar
          view={view}
          onOpenMenu={() => setMenuOpen(true)}
          onHelp={() => setHelpOpen(true)}
          onProfile={() => setProfileOpen(true)}
          onNavigate={navigate}
          isRunning={ws.isRunning}
          translatingCount={ws.counts.translating}
          history={ws.history}
        />

        <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-[1400px] px-4 pb-16 pt-6 outline-none sm:px-6 lg:px-9 lg:pt-8">
          {view === 'translate' && (
            <div className="anim-fade-up">
              <Hero onTrySamples={ws.loadSamples} />

              <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
                <div className="min-w-0">
                  <UploadDropzone
                    onFiles={ws.addFiles}
                    fileCount={ws.files.length}
                    rejections={ws.rejections}
                    onClearRejections={ws.clearRejections}
                  />
                  <FileList
                    files={ws.files}
                    counts={ws.counts}
                    batchProgress={ws.batchProgress}
                    isRunning={ws.isRunning}
                    zipping={zipping}
                    onOpen={openPreview}
                    onRemove={ws.removeFile}
                    onRetry={ws.retryFile}
                    onDownload={(f) => f.result && downloadOne(f.result)}
                    onDownloadAll={downloadAll}
                    onClear={() => setConfirmClear(true)}
                    onLoadSamples={ws.loadSamples}
                    onPick={() => pickerRef.current?.click()}
                  />
                  <input
                    ref={pickerRef}
                    type="file"
                    multiple
                    accept={ACCEPT_ATTR}
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? [])
                      e.target.value = ''
                      if (files.length) ws.addFiles(files)
                    }}
                  />
                  <DemoNotice className="mt-4" />
                </div>

                <TranslationSettings
                  settings={ws.settings}
                  settingsError={ws.settingsError}
                  onChange={ws.updateSettings}
                  glossaryCount={ws.glossary.length}
                  readyCount={ws.counts.ready}
                  translatingCount={ws.counts.translating}
                  isRunning={ws.isRunning}
                  onTranslate={ws.translateAll}
                  onStop={ws.stopAll}
                  onGoGlossary={() => navigate('glossary')}
                  serviceName={translationService.isMock ? 'โหมดทดลอง' : translationService.name}
                />
              </div>

              <section aria-label="จุดเด่น" className="mt-10 grid gap-4 sm:grid-cols-3">
                {[
                  ['หลายไฟล์ ในครั้งเดียว', 'ลดงานซ้ำ เพิ่มเวลาให้ไอเดีย'],
                  ['ออกแบบมาเพื่อทุกไฟล์', 'เอกสาร สไลด์ ตาราง คำบรรยาย ไปจนถึงรูปภาพ'],
                  ['คิดไกลได้ทุกภาษา', 'จากทีมเล็ก สู่โอกาสระดับโลก'],
                ].map(([t, d]) => (
                  <div key={t} className="rounded-card border border-line bg-surface px-5 py-4 shadow-card">
                    <p className="text-[15px] font-semibold text-ink">{t}</p>
                    <p className="mt-1 text-[13px] text-muted">{d}</p>
                  </div>
                ))}
              </section>
            </div>
          )}

          {view === 'history' && (
            <HistoryView
              history={ws.history}
              onOpen={setPreview}
              onDownload={downloadOne}
              onRemove={ws.removeHistoryEntry}
              onClear={() => {
                ws.clearHistory()
                push('success', 'ล้างประวัติแล้ว')
              }}
              onNewTranslation={() => navigate('translate')}
            />
          )}

          {view === 'glossary' && (
            <GlossaryView
              glossary={ws.glossary}
              onAdd={ws.addGlossaryEntry}
              onRemove={ws.removeGlossaryEntry}
              persisted={glossaryPersisted}
            />
          )}

          <footer className="mt-14 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-5 text-[12.5px] text-faint">
            <span>Made for a world without barriers.</span>
            <span className="font-semibold text-ink">
              lingo<span className="text-leaf">.</span> <span className="text-faint">· Interactive prototype</span>
            </span>
          </footer>
        </main>
      </div>

      <TranslationPreview
        result={preview}
        sourceFile={preview ? sourceFileOf(preview) : undefined}
        onClose={() => setPreview(null)}
        onDownload={downloadOne}
      />
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        stats={{ history: ws.history.length, glossary: ws.glossary.length }}
      />
      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        size="sm"
        title="ล้างรายการไฟล์ทั้งหมด?"
        description={`จะนำ ${ws.files.length} ไฟล์ออกจากชุดนี้ (ประวัติที่แปลเสร็จแล้วยังคงอยู่)`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmClear(false)}>
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                ws.clearFiles()
                setConfirmClear(false)
                push('success', 'ล้างรายการแล้ว')
              }}
            >
              ล้างรายการ
            </Button>
          </div>
        }
      >
        <p className="px-5 py-4 text-[13.5px] text-muted sm:px-6">ไฟล์ที่เพิ่มจากอุปกรณ์จะต้องเลือกใหม่หากต้องการแปลอีกครั้ง</p>
      </Modal>
      <Toaster />
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  )
}
