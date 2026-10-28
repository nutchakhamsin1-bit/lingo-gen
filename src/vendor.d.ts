// ชนิดข้อมูลของไลบรารีที่ไม่มี type มาให้ — ประกาศเฉพาะส่วนที่แอปใช้

declare module 'utif' {
  interface IFD {
    width: number
    height: number
    [tag: string]: unknown
  }
  const UTIF: {
    decode(buffer: ArrayBuffer): IFD[]
    decodeImage(buffer: ArrayBuffer, ifd: IFD, ifds?: IFD[]): void
    toRGBA8(ifd: IFD): Uint8Array
    encodeImage(rgba: ArrayBuffer | Uint8Array, width: number, height: number, metadata?: Record<string, unknown>): ArrayBuffer
  }
  export default UTIF
}

declare module 'gifenc' {
  type Palette = number[][]
  interface Encoder {
    writeFrame(index: Uint8Array, width: number, height: number, options?: { palette?: Palette; transparent?: boolean; transparentIndex?: number }): void
    finish(): void
    bytes(): Uint8Array
  }
  export function GIFEncoder(): Encoder
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, options?: { format?: 'rgb565' | 'rgb444' | 'rgba4444'; oneBitAlpha?: boolean | number }): Palette
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette, format?: 'rgb565' | 'rgb444' | 'rgba4444'): Uint8Array
}
