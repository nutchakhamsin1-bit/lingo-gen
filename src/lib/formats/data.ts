import { OUTPUT_MIME } from './mime'
import { looksLikeText, plainSegment, toPlainText } from './segments'
import { readText, textBlob } from './text'
import type { FormatHandler } from './types'

/* ---------- JSON ---------- */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

/** แปลเฉพาะค่าที่เป็นข้อความ (ไม่แปลชื่อคีย์) — โครงสร้าง ลำดับคีย์ และการย่อหน้าคงเดิม */
export const json: FormatHandler = {
  async open(file, { sourceLang }) {
    const { text, bom } = await readText(file, sourceLang)
    let data: Json
    try {
      data = JSON.parse(text) as Json
    } catch {
      throw new Error('ไฟล์ JSON นี้มีรูปแบบไม่ถูกต้อง จึงแปลโดยคงโครงสร้างไม่ได้')
    }
    const targets: { parent: Json[] | { [key: string]: Json }; key: string | number; value: string }[] = []
    const walk = (node: Json) => {
      if (Array.isArray(node)) node.forEach((v, i) => (typeof v === 'string' ? collect(node, i, v) : walk(v)))
      else if (node && typeof node === 'object')
        Object.entries(node).forEach(([k, v]) => (typeof v === 'string' ? collect(node, k, v) : walk(v)))
    }
    const collect = (parent: Json[] | { [key: string]: Json }, key: string | number, value: string) => {
      if (looksLikeText(value)) targets.push({ parent, key, value })
    }
    // ห่อรากไว้ในกล่อง เพื่อให้ไฟล์ที่เป็นสตริงเดี่ยวแปลได้ด้วยวิธีเดียวกัน
    const box: { [key: string]: Json } = { root: data }
    walk(box)

    const indent = /\n([ \t]+)"/.exec(text)?.[1] ?? (text.includes('\n') ? 2 : 0)
    return {
      segments: targets.map((t) => plainSegment(t.value)),
      build: async (tr) => {
        targets.forEach((t, i) => {
          ;(t.parent as Record<string | number, Json>)[t.key] = toPlainText(tr[i] ?? plainSegment(t.value))
        })
        const out = JSON.stringify(box.root, null, indent) + (/\n\s*$/.test(text) ? '\n' : '')
        return textBlob(out, bom, OUTPUT_MIME.json)
      },
    }
  },
}

/* ---------- YAML ---------- */

/** แปลเฉพาะค่าข้อความ — คอมเมนต์ ลำดับ anchor และรูปแบบการเขียนคงเดิม */
export const yaml: FormatHandler = {
  async open(file, { ext, sourceLang }) {
    const { text, bom } = await readText(file, sourceLang)
    const { parseAllDocuments, isScalar, visit } = await import('yaml')
    const docs = parseAllDocuments(text)
    if (!Array.isArray(docs) || docs.some((d) => d.errors.length)) {
      throw new Error('ไฟล์ YAML นี้มีรูปแบบไม่ถูกต้อง จึงแปลโดยคงโครงสร้างไม่ได้')
    }
    const nodes: { value: string }[] = []
    for (const doc of docs) {
      visit(doc, {
        Scalar(key, node) {
          if (key !== 'key' && isScalar(node) && typeof node.value === 'string' && looksLikeText(node.value)) {
            nodes.push(node as { value: string })
          }
        },
      })
    }
    const originals = nodes.map((n) => n.value)
    return {
      segments: originals.map(plainSegment),
      build: async (tr) => {
        nodes.forEach((n, i) => (n.value = toPlainText(tr[i] ?? plainSegment(originals[i]))))
        const out = docs.map((d) => d.toString({ lineWidth: 0 })).join('')
        return textBlob(out, bom, OUTPUT_MIME[ext])
      },
    }
  },
}
