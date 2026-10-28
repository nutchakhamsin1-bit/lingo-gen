import { ArrowLeftRight, ArrowRight, Briefcase, Globe, SlidersHorizontal, Sparkles, Square } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { LANGUAGES, LANGUAGE_MAP, TONES } from '../lib/constants'
import type { LangCode, SourceLang, Tone, TranslationSettings as Settings } from '../types'
import { Button } from './ui/Button'
import { FieldLabel, Select } from './ui/Field'
import { Switch } from './ui/Switch'

interface TranslationSettingsProps {
  settings: Settings
  settingsError: string | null
  onChange: (patch: Partial<Settings>) => void
  glossaryCount: number
  readyCount: number
  translatingCount: number
  isRunning: boolean
  onTranslate: () => void
  onStop: () => void
  onGoGlossary: () => void
  serviceName: string
}

export function TranslationSettings({
  settings,
  settingsError,
  onChange,
  glossaryCount,
  readyCount,
  translatingCount,
  isRunning,
  onTranslate,
  onStop,
  onGoGlossary,
  serviceName,
}: TranslationSettingsProps) {
  const id = useId()
  const sourceRef = useRef<HTMLSelectElement>(null)
  const [swapHint, setSwapHint] = useState<string | null>(null)
  const tone = TONES.find((t) => t.value === settings.tone)

  const swap = () => {
    if (settings.sourceLang === 'auto') {
      setSwapHint('เลือกภาษาต้นฉบับก่อน จึงจะสลับภาษาได้')
      sourceRef.current?.focus()
      return
    }
    setSwapHint(null)
    onChange({ sourceLang: settings.targetLang, targetLang: settings.sourceLang })
  }

  const canTranslate = !isRunning && readyCount > 0 && !settingsError

  return (
    <aside aria-labelledby={`${id}-title`} className="overflow-hidden rounded-card border border-line bg-surface shadow-card lg:sticky lg:top-[88px]">
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-mint text-leaf" aria-hidden>
          <SlidersHorizontal className="size-[18px]" />
        </span>
        <div>
          <h3 id={`${id}-title`} className="text-[15px] font-semibold text-ink">
            ตั้งค่าการแปล
          </h3>
          <p className="text-[12.5px] text-faint">หนึ่งการตั้งค่า ใช้กับทุกไฟล์ในชุดนี้</p>
        </div>
      </div>

      <div className="space-y-4 px-5 py-5">
        <div>
          <FieldLabel htmlFor={`${id}-source`}>ภาษาต้นฉบับ</FieldLabel>
          <Select
            id={`${id}-source`}
            ref={sourceRef}
            value={settings.sourceLang}
            invalid={!!settingsError}
            leading={<Globe className="size-4" aria-hidden />}
            onChange={(e) => {
              setSwapHint(null)
              onChange({ sourceLang: e.target.value as SourceLang })
            }}
            aria-describedby={settingsError ? `${id}-error` : undefined}
          >
            <option value="auto">ตรวจจับภาษาอัตโนมัติ</option>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code} disabled={l.code === settings.targetLang}>
                {l.native} · {l.label}
                {l.code === settings.targetLang ? ' (เป็นภาษาปลายทางอยู่)' : ''}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-line" aria-hidden />
          <Button
            size="icon"
            variant="outline"
            onClick={swap}
            aria-label="สลับภาษาต้นฉบับและปลายทาง"
            title="สลับภาษา"
            className="rounded-full"
          >
            <ArrowLeftRight className="size-4" aria-hidden />
          </Button>
          <span className="h-px flex-1 bg-line" aria-hidden />
        </div>
        {swapHint && (
          <p className="-mt-2 text-center text-[12.5px] text-amber" role="status">
            {swapHint}
          </p>
        )}

        <div>
          <FieldLabel htmlFor={`${id}-target`}>แปลเป็น</FieldLabel>
          <Select
            id={`${id}-target`}
            value={settings.targetLang}
            invalid={!!settingsError}
            leading={
              <span className="rounded-md bg-lime px-1.5 py-0.5 text-[11px] font-bold text-ink" aria-hidden>
                {LANGUAGE_MAP[settings.targetLang].short}
              </span>
            }
            onChange={(e) => onChange({ targetLang: e.target.value as LangCode })}
            aria-describedby={settingsError ? `${id}-error` : undefined}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code} disabled={l.code === settings.sourceLang}>
                {l.native} · {l.label}
                {l.code === settings.sourceLang ? ' (เป็นภาษาต้นฉบับอยู่)' : ''}
              </option>
            ))}
          </Select>
          {settingsError && (
            <p id={`${id}-error`} className="mt-1.5 text-[12.5px] text-danger" role="alert">
              {settingsError}
            </p>
          )}
        </div>

        <hr className="border-line" />

        <div>
          <FieldLabel htmlFor={`${id}-tone`} hint="ปรับให้เข้ากับงานของคุณ">
            โทนภาษา
          </FieldLabel>
          <Select
            id={`${id}-tone`}
            value={settings.tone}
            leading={<Briefcase className="size-4" aria-hidden />}
            onChange={(e) => onChange({ tone: e.target.value as Tone })}
          >
            {TONES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          {tone && <p className="mt-1.5 text-[12px] text-faint">{tone.hint}</p>}
        </div>

        <Switch
          id={`${id}-glossary`}
          label="ใช้คลังคำศัพท์"
          description={
            glossaryCount > 0 ? `แนบ ${glossaryCount} คำไปกับทุกไฟล์ในชุดนี้` : 'ยังไม่มีคำในคลัง — เพิ่มได้ที่เมนูคลังคำศัพท์'
          }
          checked={settings.useGlossary}
          onChange={(v) => onChange({ useGlossary: v })}
        />
        {settings.useGlossary && glossaryCount === 0 && (
          <button type="button" onClick={onGoGlossary} className="-mt-2 text-[12.5px] font-medium text-leaf hover:underline">
            ไปเพิ่มคำศัพท์ →
          </button>
        )}

        <hr className="border-line" />

        <div className="flex items-center justify-between text-[13.5px]">
          <span className="text-muted">พร้อมแปลทั้งหมด</span>
          <strong className="font-semibold tabular-nums text-ink">{readyCount} ไฟล์</strong>
        </div>

        {isRunning ? (
          <div className="space-y-2">
            <Button variant="primary" size="lg" block loading loadingText={`กำลังแปล ${translatingCount} ไฟล์…`} />
            <Button
              variant="danger"
              size="md"
              block
              onClick={onStop}
              leading={<Square className="size-3.5 fill-current" aria-hidden />}
            >
              หยุดการแปล
            </Button>
          </div>
        ) : (
          <Button
            variant="primary"
            size="lg"
            block
            onClick={onTranslate}
            disabled={!canTranslate}
            leading={<Sparkles className="size-[18px]" aria-hidden />}
            trailing={<ArrowRight className="size-[18px]" aria-hidden />}
            title={
              settingsError ? settingsError : readyCount === 0 ? 'ยังไม่มีไฟล์ที่พร้อมแปล' : 'เริ่มแปลไฟล์ที่พร้อมทั้งหมด'
            }
          >
            แปลทั้งหมด
          </Button>
        )}
        <p className="flex items-center justify-center gap-1.5 text-[12px] text-faint">
          <span className="size-1.5 rounded-full bg-leaf" aria-hidden />
          {serviceName} · ทดลอง workflow ได้โดยไม่เสียค่าใช้จ่าย
        </p>
      </div>
    </aside>
  )
}
