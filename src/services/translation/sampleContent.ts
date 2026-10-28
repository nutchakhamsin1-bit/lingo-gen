import { SAMPLE_MANGA_NAME } from '../../lib/constants'
import type { LangCode, TextBox } from '../../types'

const MANGA_W = 800
const MANGA_H = 1120

/** แปลงพิกเซลของภาพตัวอย่าง (800×1120) เป็นสัดส่วน 0–1 */
const px = (x: number, y: number, width: number, height: number): TextBox => ({
  x: x / MANGA_W,
  y: y / MANGA_H,
  width: width / MANGA_W,
  height: height / MANGA_H,
})

/** ช่องคำพูดในหน้ามังงะตัวอย่าง พร้อมคำแปลจริง — กรอบคือพื้นที่ด้านในวงรีของ src/assets/samples/manga-page.svg */
export const SAMPLE_TEXT_REGIONS: Record<
  string,
  { box: TextBox; source: string; translations: Record<LangCode, string> }[]
> = {
  [SAMPLE_MANGA_NAME]: [
    {
      box: px(416, 85, 248, 110),
      source: 'Hey! Wait for me!',
      translations: {
        th: 'เฮ้! รอฉันด้วย!',
        en: 'Hey! Wait for me!',
        ja: 'おーい！待って！',
        zh: '喂！等等我！',
        fr: 'Hé ! Attends-moi !',
        ko: '야! 나 좀 기다려!',
        de: 'Hey! Warte auf mich!',
        es: '¡Oye! ¡Espérame!',
      },
    },
    {
      box: px(119, 429, 212, 102),
      source: 'Where are you going?',
      translations: {
        th: 'จะไปไหนเหรอ?',
        en: 'Where are you going?',
        ja: 'どこに行くの？',
        zh: '你要去哪儿？',
        fr: 'Tu vas où ?',
        ko: '어디 가?',
        de: 'Wohin gehst du?',
        es: '¿Adónde vas?',
      },
    },
    {
      box: px(476, 428, 198, 93),
      source: 'To the library.',
      translations: {
        th: 'ไปห้องสมุด',
        en: 'To the library.',
        ja: '図書館だよ。',
        zh: '去图书馆。',
        fr: 'À la bibliothèque.',
        ko: '도서관에.',
        de: 'Zur Bibliothek.',
        es: 'A la biblioteca.',
      },
    },
    {
      box: px(189, 798, 283, 85),
      source: "Then let's go together!",
      translations: {
        th: 'งั้นไปด้วยกันนะ!',
        en: "Then let's go together!",
        ja: 'じゃあ、一緒に行こう！',
        zh: '那我们一起去吧！',
        fr: 'Alors allons-y ensemble !',
        ko: '그럼 같이 가자!',
        de: 'Dann lass uns zusammen gehen!',
        es: '¡Entonces vamos juntos!',
      },
    },
  ],
}
