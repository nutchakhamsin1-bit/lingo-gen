import { OUTPUT_MIME } from './mime'
import { encodePieces, groupsInOrder, hasWords, parsePieces, toPlainText, type Piece } from './segments'
import type { FormatHandler } from './types'

/**
 * Rich Text Format — อ่านเป็นลำดับ token (กลุ่ม {} คำสั่ง \word ข้อความ)
 * ข้อความแต่ละย่อหน้า (\par) เป็น 1 segment, ช่วงที่คั่นด้วยคำสั่งจัดรูปแบบ (\b \i \cf…) ห่อด้วย <gN>
 * คำแปลถูกเขียนกลับเป็น \uN? จึงรองรับภาษาไทย/จีน/ญี่ปุ่นได้ทุกโปรแกรม
 */

type Token =
  | { kind: 'group'; raw: string; open: boolean }
  | { kind: 'word'; raw: string; name: string; param: number | null; delimited: boolean }
  | { kind: 'symbol'; raw: string; char: string }
  | { kind: 'text'; raw: string; text: string }

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === '{' || c === '}') {
      tokens.push({ kind: 'group', raw: c, open: c === '{' })
      i++
    } else if (c === '\\') {
      const word = /^\\([a-zA-Z]{1,32})(-?\d{1,10})? ?/.exec(src.slice(i, i + 48))
      if (word) {
        tokens.push({ kind: 'word', raw: word[0], name: word[1], param: word[2] ? Number(word[2]) : null, delimited: word[0].endsWith(' ') })
        i += word[0].length
      } else if (src[i + 1] === "'") {
        tokens.push({ kind: 'symbol', raw: src.slice(i, i + 4), char: "'" })
        i += 4
      } else {
        tokens.push({ kind: 'symbol', raw: src.slice(i, i + 2), char: src[i + 1] ?? '' })
        i += 2
      }
    } else if (c === '\r' || c === '\n') {
      tokens.push({ kind: 'text', raw: c, text: '' })
      i++
    } else {
      const m = /^[^\\{}\r\n]+/.exec(src.slice(i))!
      tokens.push({ kind: 'text', raw: m[0], text: m[0] })
      i += m[0].length
    }
  }
  return tokens
}

/** กลุ่มที่ไม่ใช่เนื้อหาที่ผู้อ่านเห็น */
const SKIP_DEST = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'themedata', 'colorschememapping', 'latentstyles',
  'datastore', 'xmlnstbl', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'fldinst', 'pntext', 'pntxta',
  'pntxtb', 'listtext', 'filetbl', 'revtbl', 'shpinst', 'nonshppict', 'bkmkstart', 'bkmkend', 'mmathPr', 'falt',
])
/** จบย่อหน้า → ปิด segment */
const BREAK_PARA = new Set(['par', 'sect', 'page', 'cell', 'row', 'nestcell', 'nestrow'])
/** ขึ้นบรรทัด/แท็บภายในย่อหน้า → <xN/> */
const INLINE_MARK = new Set(['line', 'tab'])

const CODEPAGE: Record<number, string> = {
  874: 'windows-874', 932: 'shift_jis', 936: 'gbk', 949: 'euc-kr', 950: 'big5', 1250: 'windows-1250',
  1251: 'windows-1251', 1252: 'windows-1252', 1253: 'windows-1253', 1254: 'windows-1254', 1257: 'windows-1257',
}

/** ข้อความ → RTF: อักษรนอก ASCII เป็น \uN? (N เป็นเลขฐาน 10 แบบมีเครื่องหมาย 16 บิต) */
function encodeRtf(text: string): string {
  let out = ''
  for (const ch of text) {
    for (let k = 0; k < ch.length; k++) {
      const code = ch.charCodeAt(k)
      if (ch === '\\' || ch === '{' || ch === '}') out += `\\${ch}`
      else if (ch === '\n') out += '\\line '
      else if (ch === '\t') out += '\\tab '
      else if (code < 0x80) out += ch[k]
      else out += `\\u${code > 32767 ? code - 65536 : code}?`
    }
  }
  return out
}

export const rtf: FormatHandler = {
  async open(file) {
    // RTF เป็น ASCII 7 บิต — อ่านแบบ latin1 เพื่อเก็บทุกไบต์ตามเดิม
    const src = new TextDecoder('latin1').decode(await file.arrayBuffer())
    if (!src.startsWith('{\\rtf')) throw new Error('ไฟล์ .rtf นี้ไม่ใช่ Rich Text Format ที่ถูกต้อง')
    const tokens = tokenize(src)
    const cp = Number(/\\ansicpg(\d+)/.exec(src)?.[1] ?? 1252)
    const decoder = new TextDecoder(CODEPAGE[cp] ?? 'windows-1252')

    // ไล่ token: รู้ว่าอยู่ในกลุ่มที่ข้ามหรือไม่ และนับตัวอักษรสำรองหลัง \uN (\ucN)
    interface Run { tokens: number[]; text: string }
    interface Para { runs: Run[]; marks: number[]; order: ({ run: number } | { mark: number })[] }
    const paras: Para[] = []
    let para: Para = { runs: [], marks: [], order: [] }
    let run: Run | null = null
    const skipStack: boolean[] = [false]
    const ucStack: number[] = [1]
    let skipping = false
    let fallback = 0
    let pendingBytes: number[] = []

    const flushBytes = () => {
      if (!pendingBytes.length || !run) return
      run.text += decoder.decode(new Uint8Array(pendingBytes))
      pendingBytes = []
    }
    const endRun = () => {
      flushBytes()
      run = null
    }
    const endPara = () => {
      endRun()
      if (para.runs.some((r) => hasWords(r.text))) paras.push(para)
      para = { runs: [], marks: [], order: [] }
    }
    const addToRun = (index: number, text: string) => {
      if (!run) {
        run = { tokens: [], text: '' }
        para.runs.push(run)
        para.order.push({ run: para.runs.length - 1 })
      }
      run.tokens.push(index)
      run.text += text
    }

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]
      if (t.kind === 'group') {
        endRun()
        if (t.open) {
          skipStack.push(skipping)
          ucStack.push(ucStack[ucStack.length - 1])
          const next = tokens[i + 1]
          const dest = next?.kind === 'symbol' && next.char === '*' ? 'star' : next?.kind === 'word' ? next.name : ''
          if (dest === 'star' || SKIP_DEST.has(dest)) skipping = true
        } else {
          skipping = skipStack.pop() ?? false
          ucStack.pop()
        }
        continue
      }
      if (skipping) continue
      if (t.kind === 'word') {
        if (t.name === 'uc') ucStack[ucStack.length - 1] = t.param ?? 1
        if (t.name === 'u' && t.param !== null) {
          flushBytes()
          addToRun(i, String.fromCharCode(t.param < 0 ? t.param + 65536 : t.param))
          fallback = ucStack[ucStack.length - 1]
          continue
        }
        if (BREAK_PARA.has(t.name)) {
          endPara()
          continue
        }
        if (INLINE_MARK.has(t.name)) {
          endRun()
          para.marks.push(i)
          para.order.push({ mark: para.marks.length - 1 })
          continue
        }
        endRun() // คำสั่งจัดรูปแบบ → เริ่มช่วงข้อความใหม่
        continue
      }
      if (t.kind === 'symbol') {
        if (t.char === "'") {
          if (fallback > 0) {
            fallback--
            continue
          }
          addToRun(i, '')
          pendingBytes.push(parseInt(t.raw.slice(2, 4), 16))
          continue
        }
        flushBytes()
        if (t.char === '~') addToRun(i, ' ')
        else if (t.char === '\\' || t.char === '{' || t.char === '}') addToRun(i, t.char)
        else if (t.char === '\n' || t.char === '\r') endPara()
        continue
      }
      // ข้อความ
      if (!t.text) continue
      flushBytes()
      let text = t.text
      if (fallback > 0) {
        const skip = Math.min(fallback, text.length)
        fallback -= skip
        text = text.slice(skip)
      }
      addToRun(i, text)
    }
    endPara()

    // segment ต่อย่อหน้า
    const segments = paras.map((p) => {
      if (p.runs.length === 1 && !p.marks.length) return encodePieces([{ type: 'text', text: p.runs[0].text }])
      const pieces: Piece[] = p.order.map((o) =>
        'run' in o
          ? { type: 'g', id: o.run + 1, children: [{ type: 'text', text: p.runs[o.run].text }] }
          : { type: 'x', id: p.runs.length + o.mark + 1 },
      )
      return encodePieces(pieces)
    })

    return {
      segments,
      build: async (tr) => {
        const replaced = new Map<number, string>()
        paras.forEach((p, k) => {
          const pieces = parsePieces(tr[k] ?? segments[k])
          const texts = new Map<number, string>()
          if (p.runs.length === 1 && !p.marks.length) texts.set(0, toPlainText(tr[k] ?? segments[k]))
          else {
            // คำสั่งจัดรูปแบบอยู่กับที่ — คำแปลของแต่ละช่วงใส่กลับตำแหน่งเดิมของช่วงนั้น
            for (const entry of groupsInOrder(pieces, 1)) {
              const index = entry.id - 1
              if (index >= p.runs.length) continue
              const text = entry.content.map((c) => (c.type === 'text' ? c.text : '')).join('')
              texts.set(index, (texts.get(index) ?? '') + text)
            }
          }
          p.runs.forEach((r, index) => {
            const [first, ...rest] = r.tokens
            const prev = tokens[first - 1]
            const text = texts.get(index) ?? ''
            // ข้อความที่ต่อจากคำสั่งที่ไม่มีช่องว่างคั่น ต้องเติมช่องว่าง ไม่งั้นจะถูกอ่านเป็นส่วนของคำสั่ง
            const guard = prev?.kind === 'word' && !prev.delimited && /^[a-zA-Z0-9 ]/.test(text) ? ' ' : ''
            replaced.set(first, guard + encodeRtf(text))
            rest.forEach((idx) => replaced.set(idx, ''))
          })
        })
        // \uN ที่ถูกแทนแล้ว ต้องลบตัวอักษรสำรองที่ตามหลังด้วย
        const out = tokens.map((t, i) => replaced.get(i) ?? t.raw)
        tokens.forEach((t, i) => {
          if (t.kind === 'word' && t.name === 'u' && replaced.has(i)) {
            let skip = ucStack[0] ?? 1
            for (let j = i + 1; j < tokens.length && skip > 0; j++) {
              const n = tokens[j]
              if (replaced.has(j) && replaced.get(j) !== '') break
              if (n.kind === 'symbol' && n.char === "'") {
                out[j] = ''
                skip--
              } else if (n.kind === 'text' && n.text) {
                out[j] = n.raw.slice(Math.min(skip, n.raw.length))
                skip -= Math.min(skip, n.raw.length)
              } else break
            }
          }
        })
        const bytes = Uint8Array.from(out.join(''), (c) => c.charCodeAt(0) & 0xff)
        return new Blob([bytes], { type: OUTPUT_MIME.rtf })
      },
    }
  },
}
