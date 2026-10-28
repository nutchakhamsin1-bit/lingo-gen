import { describe, expect, it } from 'vitest'
import { blobText, pseudo, roundTrip, textFile } from './testUtils'

describe('plain text (.txt)', () => {
  it('translates each line and keeps blank lines, indentation and CRLF', async () => {
    const source = 'Meeting notes\r\n\r\n  Ship it on Friday.\r\n42\r\n'
    const { segments, output } = await roundTrip(textFile('a.txt', source), 'txt')
    expect(segments).toEqual(['Meeting notes', 'Ship it on Friday.'])
    expect(await blobText(output)).toBe('[TH] Meeting notes\r\n\r\n  [TH] Ship it on Friday.\r\n42\r\n')
  })

  it('reads legacy Thai encoding (windows-874) and writes UTF-8', async () => {
    // "สวัสดี" ในรหัส windows-874: อักษรไทย U+0E01–U+0E5B อยู่ที่ไบต์ 0xA1–0xFB
    const bytes = Uint8Array.from([...'สวัสดี'].map((c) => c.codePointAt(0)! - 0x0e01 + 0xa1))
    const { segments, output } = await roundTrip(textFile('old.txt', bytes), 'txt', pseudo, { sourceLang: 'th' })
    expect(segments).toEqual(['สวัสดี'])
    expect(await blobText(output)).toBe('[TH] สวัสดี')
  })

  it('keeps the UTF-8 byte order mark', async () => {
    const { output } = await roundTrip(textFile('bom.txt', '﻿Hello'), 'txt')
    expect([...new Uint8Array(await output.arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
  })
})

describe('markdown (.md)', () => {
  const source = [
    '---',
    'title: Guide',
    '---',
    '# Getting started',
    '',
    'Run `npm run dev` and open [the docs](https://example.com/docs).',
    '',
    '```bash',
    'npm install',
    '```',
    '',
    '| Step | Action |',
    '|------|--------|',
    '| 1 | Open it |',
    '',
  ].join('\n')

  it('translates prose but keeps front matter, code, URLs and table structure', async () => {
    const { segments, output } = await roundTrip(textFile('g.md', source), 'md')
    expect(segments).toContain('Getting started')
    expect(segments.some((s) => s.includes('npm install'))).toBe(false)
    const out = await blobText(output)
    expect(out).toContain('---\ntitle: Guide\n---')
    expect(out).toContain('# [TH] Getting started')
    expect(out).toContain('`npm run dev`')
    expect(out).toContain('[the docs](https://example.com/docs)')
    expect(out).toContain('```bash\nnpm install\n```')
    expect(out).toContain('|------|--------|')
    expect(out).toContain('| [TH] Open it |')
  })

  it('keeps code and link URLs even if the translator drops their tags', async () => {
    const { output } = await roundTrip(textFile('g.md', 'Run `npm test` now'), 'md', () => 'รันเดี๋ยวนี้')
    expect(await blobText(output)).toBe('รันเดี๋ยวนี้ `npm test`')
  })
})

describe('subtitles (.srt / .vtt)', () => {
  it('keeps cue numbers, timings and inline tags', async () => {
    const source = '1\n00:00:01,000 --> 00:00:03,500\n<i>Hello</i> there!\nSecond line\n\n2\n00:00:04,000 --> 00:00:06,000\nBye.\n'
    const { segments, output } = await roundTrip(textFile('e.srt', source), 'srt')
    expect(segments).toHaveLength(2)
    expect(await blobText(output)).toBe(
      '1\n00:00:01,000 --> 00:00:03,500\n[TH] <i>Hello</i> there!\nSecond line\n\n2\n00:00:04,000 --> 00:00:06,000\n[TH] Bye.\n',
    )
  })

  it('does not translate the WEBVTT header or NOTE blocks', async () => {
    const source = 'WEBVTT\n\nNOTE internal comment\n\n00:00.000 --> 00:02.000\nWelcome.\n'
    const { segments } = await roundTrip(textFile('t.vtt', source), 'vtt')
    expect(segments).toEqual(['Welcome.'])
  })
})

describe('gettext (.po)', () => {
  it('fills msgstr (including plural forms) and leaves the header alone', async () => {
    const source = [
      'msgid ""',
      'msgstr ""',
      '"Content-Type: text/plain; charset=UTF-8\\n"',
      '',
      '#: app.js:10',
      'msgid "Say \\"hi\\""',
      'msgstr ""',
      '',
      'msgid "One file"',
      'msgid_plural "%d files"',
      'msgstr[0] ""',
      'msgstr[1] ""',
      '',
    ].join('\n')
    const { segments, output } = await roundTrip(textFile('a.po', source), 'po')
    expect(segments).toEqual(['Say "hi"', 'One file', '%d files'])
    const out = await blobText(output)
    expect(out).toContain('msgid ""\nmsgstr ""\n"Content-Type')
    expect(out).toContain('#: app.js:10\nmsgid "Say \\"hi\\""\nmsgstr "[TH] Say \\"hi\\""')
    expect(out).toContain('msgstr[0] "[TH] One file"\nmsgstr[1] "[TH] %d files"')
  })
})

describe('delimited tables (.csv / .tsv)', () => {
  it('handles quoted cells, keeps numbers/IDs, CRLF and quoting', async () => {
    const source = 'item,price,note\r\nCoffee,60,"Hot, fresh ""brew"""\r\nSKU-001,12,ID only\r\n'
    const { segments, output } = await roundTrip(textFile('p.csv', source), 'csv')
    expect(segments).not.toContain('SKU-001')
    expect(await blobText(output)).toBe(
      '[TH] item,[TH] price,[TH] note\r\n[TH] Coffee,60,"[TH] Hot, fresh ""brew"""\r\nSKU-001,12,[TH] ID only\r\n',
    )
  })

  it('detects semicolon-separated CSV', async () => {
    const { output } = await roundTrip(textFile('eu.csv', 'name;city\nAnna;Berlin\n'), 'csv')
    expect(await blobText(output)).toBe('[TH] name;[TH] city\n[TH] Anna;[TH] Berlin\n')
  })

  it('reads tab-separated files', async () => {
    const { output } = await roundTrip(textFile('w.tsv', 'key\ttext\nbtn.save\tSave changes\n'), 'tsv')
    expect(await blobText(output)).toBe('[TH] key\t[TH] text\nbtn.save\t[TH] Save changes\n')
  })
})

describe('data files (.json / .yaml)', () => {
  it('translates JSON string values only, keeping keys, ids, URLs, numbers and indentation', async () => {
    const source = '{\n    "title": "Welcome back",\n    "id": "user_42",\n    "url": "https://x.io",\n    "count": 3,\n    "tips": ["Drag files here"]\n}\n'
    const { output } = await roundTrip(textFile('s.json', source), 'json')
    expect(JSON.parse(await blobText(output))).toEqual({
      title: '[TH] Welcome back',
      id: 'user_42',
      url: 'https://x.io',
      count: 3,
      tips: ['[TH] Drag files here'],
    })
    expect(await blobText(output)).toMatch(/^\{\n {4}"title"/)
  })

  it('rejects broken JSON with a readable message', async () => {
    await expect(roundTrip(textFile('bad.json', '{ nope'), 'json')).rejects.toThrow('JSON')
  })

  it('keeps YAML comments, numbers and identifier-like values', async () => {
    const source = '# settings\napp:\n  tagline: Translate many files # shown on home\n  theme: dark-green\nversion: 2\n'
    const { output } = await roundTrip(textFile('c.yaml', source), 'yaml')
    const out = await blobText(output)
    expect(out).toContain('# settings')
    expect(out).toContain('tagline: "[TH] Translate many files" # shown on home')
    expect(out).toContain('theme: dark-green')
    expect(out).toContain('version: 2')
  })
})
