import { BookOpen, Plus, Trash } from 'lucide-react'
import { useId, useMemo, useState, type FormEvent } from 'react'
import { formatDateTime } from '../../lib/format'
import type { GlossaryEntry } from '../../types'
import { Button } from '../ui/Button'
import { FieldLabel, TextInput } from '../ui/Field'

interface GlossaryViewProps {
  glossary: GlossaryEntry[]
  onAdd: (source: string, target: string) => string | null
  onRemove: (id: string) => void
  persisted: boolean
}

export function GlossaryView({ glossary, onAdd, onRemove, persisted }: GlossaryViewProps) {
  const id = useId()
  const [source, setSource] = useState('')
  const [target, setTarget] = useState('')
  const [touched, setTouched] = useState({ source: false, target: false })
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [justAdded, setJustAdded] = useState<string | null>(null)

  const sourceError = touched.source && !source.trim() ? 'กรอกคำต้นฉบับ' : null
  const targetError = touched.target && !target.trim() ? 'กรอกคำแปล' : null

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return glossary
    return glossary.filter((g) => g.source.toLowerCase().includes(q) || g.target.toLowerCase().includes(q))
  }, [glossary, query])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTouched({ source: true, target: true })
    const err = onAdd(source, target)
    setError(err)
    if (!err) {
      setJustAdded(source.trim())
      setSource('')
      setTarget('')
      setTouched({ source: false, target: false })
      document.getElementById(`${id}-source`)?.focus()
      window.setTimeout(() => setJustAdded(null), 2500)
    }
  }

  return (
    <section aria-labelledby="glossary-title" className="anim-fade-up">
      <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-leaf">
        <span className="size-1.5 rounded-full bg-leaf" aria-hidden />
        CONSISTENT WORDS. STRONGER BRAND.
      </p>
      <h2 id="glossary-title" className="text-[28px] font-medium leading-tight tracking-[-0.02em] text-ink sm:text-[34px]">
        คลังคำศัพท์ของทีม
      </h2>
      <p className="mt-2 max-w-2xl text-[15px] text-muted">
        บันทึกคำเฉพาะและคำแปล ให้ทุกไฟล์พูดภาษาเดียวกับแบรนด์คุณ — เปิดสวิตช์ “ใช้คลังคำศัพท์” ในหน้าแปลเอกสารเพื่อแนบไปกับงาน
      </p>

      <div className="mt-6 grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <form
          onSubmit={submit}
          noValidate
          className="h-fit rounded-card border border-line bg-surface p-5 shadow-card lg:sticky lg:top-[88px]"
          aria-labelledby={`${id}-form-title`}
        >
          <h3 id={`${id}-form-title`} className="text-[15px] font-semibold text-ink">
            เพิ่มคำศัพท์
          </h3>
          <p className="mt-0.5 text-[12.5px] text-faint">คู่คำต้นฉบับ–คำแปล ใช้ได้กับทุกภาษาปลายทาง</p>

          <div className="mt-4 space-y-3.5">
            <div>
              <FieldLabel htmlFor={`${id}-source`}>คำต้นฉบับ</FieldLabel>
              <TextInput
                id={`${id}-source`}
                value={source}
                invalid={!!sourceError}
                placeholder="เช่น Lingo Gen"
                autoComplete="off"
                aria-describedby={sourceError ? `${id}-source-err` : undefined}
                onChange={(e) => {
                  setSource(e.target.value)
                  if (error) setError(null)
                }}
                onBlur={() => setTouched((t) => ({ ...t, source: true }))}
              />
              {sourceError && (
                <p id={`${id}-source-err`} className="mt-1 text-[12.5px] text-danger">
                  {sourceError}
                </p>
              )}
            </div>
            <div>
              <FieldLabel htmlFor={`${id}-target`}>คำแปลที่ต้องการ</FieldLabel>
              <TextInput
                id={`${id}-target`}
                value={target}
                invalid={!!targetError}
                placeholder="เช่น ลิงโก้ เจน (คงชื่อแบรนด์)"
                autoComplete="off"
                aria-describedby={targetError ? `${id}-target-err` : undefined}
                onChange={(e) => {
                  setTarget(e.target.value)
                  if (error) setError(null)
                }}
                onBlur={() => setTouched((t) => ({ ...t, target: true }))}
              />
              {targetError && (
                <p id={`${id}-target-err`} className="mt-1 text-[12.5px] text-danger">
                  {targetError}
                </p>
              )}
            </div>
            {error && (
              <p className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger" role="alert">
                {error}
              </p>
            )}
            {justAdded && !error && (
              <p className="rounded-lg bg-[#edf7ec] px-3 py-2 text-[12.5px] text-[#3f7446]" role="status">
                เพิ่ม “{justAdded}” แล้ว
              </p>
            )}
            <Button type="submit" variant="primary" block leading={<Plus className="size-4" aria-hidden />}>
              เพิ่มคำศัพท์
            </Button>
            {!persisted && (
              <p className="text-[12px] text-amber">บันทึกลง localStorage ไม่สำเร็จ — คำศัพท์จะหายเมื่อปิดแท็บ</p>
            )}
          </div>
        </form>

        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
            <h3 className="text-[15px] font-semibold text-ink">
              คำที่ใช่ สำหรับทุกโปรเจกต์ <span className="ml-1 rounded-md bg-mint-soft px-1.5 py-0.5 text-[12px] font-semibold text-muted">{glossary.length}</span>
            </h3>
            <label className="block">
              <span className="sr-only">ค้นหาคำศัพท์</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหาคำศัพท์"
                className="h-9 w-44 rounded-lg border border-transparent bg-canvas px-3 text-[13px] text-ink placeholder:text-faint hover:border-line focus:border-leaf focus:bg-surface"
              />
            </label>
          </div>
          {visible.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-xl bg-mint text-leaf" aria-hidden>
                <BookOpen className="size-6" />
              </span>
              <p className="mt-4 text-[15px] font-medium text-ink">
                {glossary.length ? `ไม่พบคำที่ตรงกับ “${query}”` : 'คลังคำศัพท์ยังว่างอยู่'}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted">
                {glossary.length
                  ? 'ลองคำค้นอื่น หรือล้างช่องค้นหา'
                  : 'เริ่มจากชื่อแบรนด์ ชื่อผลิตภัณฑ์ หรือศัพท์เฉพาะที่ต้องแปลเหมือนกันทุกไฟล์'}
              </p>
              {glossary.length > 0 && (
                <Button variant="subtle" size="sm" className="mt-4" onClick={() => setQuery('')}>
                  แสดงทั้งหมด
                </Button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {visible.map((g) => (
                <li key={g.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="grid min-w-0 flex-1 gap-0.5 sm:grid-cols-2 sm:gap-3">
                    <p className="truncate text-[14px] text-muted" title={g.source}>
                      {g.source}
                    </p>
                    <p className="truncate text-[14px] font-medium text-ink" title={g.target}>
                      <span className="mr-1.5 text-faint sm:hidden" aria-hidden>
                        →
                      </span>
                      {g.target}
                    </p>
                  </div>
                  <span className="hidden text-[12px] text-faint md:block">{formatDateTime(g.createdAt)}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onRemove(g.id)}
                    aria-label={`ลบคำว่า ${g.source}`}
                    title="ลบคำนี้"
                    className="hover:text-danger"
                  >
                    <Trash className="size-[18px]" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-line px-5 py-3 text-[12.5px] text-faint">
            คำศัพท์จะถูกบันทึกไว้ในเบราว์เซอร์ และแนบไปกับข้อมูลการตั้งค่าในไฟล์ผลลัพธ์ตัวอย่าง
          </p>
        </div>
      </div>
    </section>
  )
}
