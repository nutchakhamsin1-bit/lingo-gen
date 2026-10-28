import { ArrowUpRight, Languages, Sparkles } from 'lucide-react'

const GREETINGS = [
  { text: 'Hello', lang: 'ENGLISH', cls: 'left-[6%] top-[14%] rotate-[-4deg]' },
  { text: 'สวัสดี', lang: 'THAI', cls: 'right-[8%] top-[10%] rotate-[3deg]' },
  { text: 'Bonjour', lang: 'FRENCH', cls: 'left-[12%] bottom-[14%] rotate-[2deg]' },
  { text: 'こんにちは', lang: 'JAPANESE', cls: 'right-[10%] bottom-[16%] rotate-[-3deg]' },
]

export function Hero({ onTrySamples }: { onTrySamples: () => void }) {
  return (
    <section aria-labelledby="hero-title" className="mb-6 lg:mb-8">
      <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-leaf">
        <span className="size-1.5 rounded-full bg-leaf" aria-hidden />
        LESS TRANSLATING. MORE CONNECTING.
      </p>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 id="hero-title" className="text-[30px] font-medium leading-[1.12] tracking-[-0.02em] text-ink sm:text-[36px] lg:text-[42px]">
            ทุกไฟล์ของคุณ <br className="hidden sm:block" />
            ไปได้ไกลกว่าเดิม.
          </h2>
          <p className="mt-3 max-w-xl text-[15px] text-muted">เปลี่ยนหลายไฟล์ให้เป็นอีกภาษา ในพื้นที่ทำงานเดียว</p>
        </div>
      </div>

      <div className="grain relative mt-6 overflow-hidden rounded-[14px] border border-[#e1e9d7] bg-mint">
        <div className="relative z-10 grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.1fr_1fr] lg:gap-4 lg:p-9">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-[#6d8260]">
              <Sparkles className="size-3.5" aria-hidden />
              MADE FOR YOUR GLOBAL AMBITIONS
            </p>
            <p className="mt-3 text-[32px] font-medium leading-[1.08] tracking-[-0.03em] text-ink-soft sm:text-[38px] lg:text-[44px]">
              A whole world.
              <br />
              <span className="text-[#7f9670]">One workspace.</span>
            </p>
            <p className="mt-4 max-w-md text-[14px] leading-relaxed text-[#6f7f64]">
              อัปโหลดครั้งเดียว แปลพร้อมกันหลายไฟล์
              <br className="hidden sm:block" /> ให้ทีมของคุณมีเวลาโฟกัสกับสิ่งที่สำคัญกว่า
            </p>
            <button
              type="button"
              onClick={onTrySamples}
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-[10px] bg-white/70 px-4 text-[13.5px] font-semibold text-[#3f6136] ring-1 ring-[#d4e2c6] transition-colors hover:bg-white"
            >
              ลองใช้งานด้วยไฟล์ตัวอย่าง
              <ArrowUpRight className="size-4" aria-hidden />
            </button>
          </div>

          {/* Decorative greeting cards */}
          <div className="relative hidden min-h-[220px] lg:block" aria-hidden>
            <div className="absolute left-1/2 top-1/2 size-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#cfdcc0]/80" />
            <div className="absolute left-1/2 top-1/2 size-[170px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-[#bfd0ad]" />
            <div className="absolute left-1/2 top-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl bg-ink text-lime shadow-pop">
              <Languages className="size-7" />
            </div>
            {GREETINGS.map((g, i) => (
              <div
                key={g.lang}
                className={`anim-float absolute ${g.cls} rounded-xl border border-[#dfe8d4] bg-white px-4 py-2.5 shadow-card`}
                style={{ animationDelay: `${i * 0.7}s` }}
              >
                <p className="text-[17px] font-semibold leading-tight text-ink">{g.text}</p>
                <p className="mt-0.5 text-[9.5px] font-semibold tracking-[0.14em] text-faint">{g.lang}</p>
              </div>
            ))}
            <p className="absolute bottom-0 right-0 flex items-center gap-2 text-[11px] font-medium text-[#6d8260]">
              <span className="size-1.5 rounded-full bg-leaf" />
              Ideas travel better together.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 lg:hidden" aria-hidden>
            {GREETINGS.map((g) => (
              <div key={g.lang} className="rounded-xl border border-[#dfe8d4] bg-white px-3.5 py-2 shadow-card">
                <p className="text-[15px] font-semibold leading-tight text-ink">{g.text}</p>
                <p className="mt-0.5 text-[9px] font-semibold tracking-[0.14em] text-faint">{g.lang}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
