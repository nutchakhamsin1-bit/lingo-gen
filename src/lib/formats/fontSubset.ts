import subsetWasmUrl from 'harfbuzzjs/dist/harfbuzz-subset.wasm?url'

/**
 * ตัดฟอนต์ให้เหลือเฉพาะตัวอักษรที่ใช้ ด้วย HarfBuzz (hb-subset — ตัวเดียวกับที่ Google Fonts ใช้)
 * ตัวตัดฟอนต์ในตัวของ pdf-lib/fontkit ทำตัวอักษรหายกับฟอนต์ CJK ขนาดใหญ่ (เช่น Noto Sans JP)
 * จึงตัดเองก่อน แล้วค่อยฝังไฟล์ที่ตัดแล้วทั้งไฟล์ — ได้ PDF เล็กและตัวอักษรครบ
 */

interface HbSubset {
  memory: WebAssembly.Memory
  malloc(size: number): number
  free(ptr: number): void
  _initialize?(): void
  hb_blob_create(data: number, length: number, mode: number, userData: number, destroy: number): number
  hb_blob_destroy(blob: number): void
  hb_blob_get_data(blob: number, lengthPtr: number): number
  hb_blob_get_length(blob: number): number
  hb_face_create(blob: number, index: number): number
  hb_face_destroy(face: number): void
  hb_face_reference_blob(face: number): number
  hb_set_add(set: number, codepoint: number): void
  hb_subset_input_create_or_fail(): number
  hb_subset_input_destroy(input: number): void
  hb_subset_input_unicode_set(input: number): number
  hb_subset_or_fail(face: number, input: number): number
}

const HB_MEMORY_MODE_WRITABLE = 2
let module: Promise<HbSubset> | null = null

function load(): Promise<HbSubset> {
  module ??= fetch(subsetWasmUrl)
    .then((r) => r.arrayBuffer())
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then(({ instance }) => {
      const hb = instance.exports as unknown as HbSubset
      hb._initialize?.()
      return hb
    })
  module.catch(() => (module = null))
  return module
}

export async function subsetFont(font: ArrayBuffer, codepoints: Iterable<number>): Promise<Uint8Array> {
  const hb = await load()
  const ptr = hb.malloc(font.byteLength)
  new Uint8Array(hb.memory.buffer).set(new Uint8Array(font), ptr)
  const blob = hb.hb_blob_create(ptr, font.byteLength, HB_MEMORY_MODE_WRITABLE, 0, 0)
  const face = hb.hb_face_create(blob, 0)
  hb.hb_blob_destroy(blob)
  const input = hb.hb_subset_input_create_or_fail()
  const unicodes = hb.hb_subset_input_unicode_set(input)
  for (const cp of codepoints) hb.hb_set_add(unicodes, cp)
  const subset = hb.hb_subset_or_fail(face, input)
  hb.hb_subset_input_destroy(input)
  try {
    if (!subset) throw new Error('ตัดฟอนต์สำหรับไฟล์ PDF ไม่สำเร็จ')
    const out = hb.hb_face_reference_blob(subset)
    const data = hb.hb_blob_get_data(out, 0)
    const length = hb.hb_blob_get_length(out)
    // คัดลอกออกก่อนคืนหน่วยความจำ (memory ของ wasm อาจขยายแล้วเปลี่ยน buffer)
    const bytes = new Uint8Array(hb.memory.buffer, data, length).slice()
    hb.hb_blob_destroy(out)
    return bytes
  } finally {
    if (subset) hb.hb_face_destroy(subset)
    hb.hb_face_destroy(face)
    hb.free(ptr)
  }
}
