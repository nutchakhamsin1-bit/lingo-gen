import { OUTPUT_MIME } from './mime'
import { looksLikeText, plainSegment, splitPadding, toPlainText } from './segments'
import { readText, textBlob } from './text'
import type { FormatHandler } from './types'

interface Cell {
  value: string
  quoted: boolean
}

/** ตัวคั่นที่พบมากที่สุดในบรรทัดแรก (นอกเครื่องหมายคำพูด) — CSV จากเครื่องภาษาอื่นอาจใช้ ; */
function detectDelimiter(text: string, ext: string): string {
  if (ext === 'tsv') return '\t'
  const end = text.search(/\r|\n/)
  const firstLine = (end < 0 ? text : text.slice(0, end)).replace(/"[^"]*"/g, '')
  const [best] = [',', ';', '\t']
    .map((d) => ({ d, count: firstLine.split(d).length - 1 }))
    .sort((a, b) => b.count - a.count)
  return best.count > 0 ? best.d : ','
}

/** แยกแถว/เซลล์ตาม RFC 4180 (รองรับ "" และขึ้นบรรทัดในเซลล์) */
function parse(text: string, delim: string): { rows: Cell[][]; eol: string; trailingEol: boolean } {
  const rows: Cell[][] = []
  let row: Cell[] = []
  let value = ''
  let quoted = false
  let inQuotes = false
  let i = 0
  const endCell = () => {
    row.push({ value, quoted })
    value = ''
    quoted = false
  }
  while (i < text.length) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        value += '"'
        i += 2
        continue
      }
      if (c === '"') inQuotes = false
      else value += c
      i++
      continue
    }
    if (c === '"' && value === '') {
      inQuotes = quoted = true
    } else if (c === delim) {
      endCell()
    } else if (c === '\r' || c === '\n') {
      endCell()
      rows.push(row)
      row = []
      if (c === '\r' && text[i + 1] === '\n') i++
    } else value += c
    i++
  }
  const trailingEol = /[\r\n]$/.test(text)
  if (!trailingEol || value || row.length) {
    endCell()
    rows.push(row)
  }
  return { rows, eol: text.includes('\r\n') ? '\r\n' : '\n', trailingEol }
}

function serialize(rows: Cell[][], delim: string, eol: string, trailingEol: boolean): string {
  const cell = ({ value, quoted }: Cell) =>
    quoted || value.includes(delim) || /["\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
  return rows.map((r) => r.map(cell).join(delim)).join(eol) + (trailingEol ? eol : '')
}

/** CSV/TSV: แปลเฉพาะเซลล์ที่เป็นข้อความ — ตัวเลข รหัส ลิงก์ ตัวคั่น และเครื่องหมายคำพูดคงเดิม */
export const delimited: FormatHandler = {
  async open(file, { ext, sourceLang }) {
    const { text, bom } = await readText(file, sourceLang)
    const delim = detectDelimiter(text, ext)
    const { rows, eol, trailingEol } = parse(text, delim)
    const cells = rows.flat().filter((c) => looksLikeText(c.value))
    const parts = cells.map((c) => splitPadding(c.value))
    return {
      segments: parts.map(([, core]) => plainSegment(core)),
      build: async (tr) => {
        cells.forEach((c, i) => {
          const [lead, core, trail] = parts[i]
          c.value = lead + toPlainText(tr[i] ?? plainSegment(core)) + trail
        })
        return textBlob(serialize(rows, delim, eol, trailingEol), bom, OUTPUT_MIME[ext])
      },
    }
  },
}
