import { describe, expect, it } from 'vitest'
import { encodePieces, parsePieces, type Piece } from './segments'
import { blobText, parseXmlStrict, readZip, roundTrip, textFile, zipFile } from './testUtils'

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
const P = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
const S = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
const ODF =
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"'

const run = (text: string, bold = false) => `<w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`

/** ลำดับ run ของย่อหน้าแรก: [ตัวหนา?, ข้อความ] */
function wordRuns(xml: string, paragraph = 0): [boolean, string][] {
  const doc = parseXmlStrict(xml)
  const p = doc.getElementsByTagName('w:p')[paragraph]
  return [...p.getElementsByTagName('w:r')].map((r) => [
    r.getElementsByTagName('w:b').length > 0,
    [...r.getElementsByTagName('w:t')].map((t) => t.textContent).join(''),
  ])
}

/** กลับลำดับกลุ่มในคำแปล (จำลองภาษาที่เรียงคำต่างจากต้นฉบับ) */
const reverseGroups = (segment: string) =>
  encodePieces(parsePieces(segment).filter((p): p is Piece & { type: 'g' } => p.type === 'g').reverse())

describe('docx', () => {
  const docx = () =>
    zipFile('a.docx', {
      'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${W}><w:body>
        <w:p>${run('Lingo turns a ')}${run('folder of documents', true)}${run(' into a set.')}</w:p>
        <w:p>${run('Key features')}</w:p>
        <w:p><w:r><w:t>Before</w:t><w:tab/><w:t>after</w:t></w:r></w:p>
        <w:p>${run('2026')}</w:p>
      </w:body></w:document>`,
      'word/styles.xml': `<w:styles ${W}/>`,
    })

  it('wraps differently formatted runs in tags and skips paragraphs without words', async () => {
    const { segments } = await roundTrip(await docx(), 'docx')
    expect(segments).toEqual([
      '<g1>Lingo turns a </g1><g2>folder of documents</g2><g3> into a set.</g3>',
      'Key features',
      'Before<x2/>after',
    ])
  })

  it('reorders runs with their formatting when the translation changes word order', async () => {
    const { output } = await roundTrip(await docx(), 'docx', (s, i) => (i === 0 ? reverseGroups(s) : `[TH] ${s}`))
    const xml = await (await readZip(output)).file('word/document.xml')!.async('string')
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')).toBe(true)
    expect(wordRuns(xml, 0)).toEqual([
      [false, ' into a set.'],
      [true, 'folder of documents'],
      [false, 'Lingo turns a '],
    ])
    expect(wordRuns(xml, 1)).toEqual([[false, '[TH] Key features']])
    // แท็บภายใน run ยังอยู่ตำแหน่งเดิม
    expect(xml).toMatch(/<w:t xml:space="preserve">\[TH\] Before<\/w:t><w:tab\/><w:t xml:space="preserve">after<\/w:t>/)
    expect(wordRuns(xml, 3)).toEqual([[false, '2026']])
  })
})

describe('pptx', () => {
  const pptx = () =>
    zipFile('d.pptx', {
      'ppt/slides/slide1.xml': `<p:sld ${A} ${P}><p:cSld><p:spTree><p:sp><p:txBody>
        <a:p><a:r><a:rPr lang="en-US"/><a:t>Revenue grew </a:t></a:r><a:r><a:rPr lang="en-US" b="1"/><a:t>twenty percent</a:t></a:r></a:p>
        <a:p><a:r><a:rPr lang="en-US"/><a:t>First</a:t></a:r><a:br><a:rPr lang="en-US"/></a:br><a:r><a:rPr lang="en-US"/><a:t>Second</a:t></a:r></a:p>
      </p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
    })

  it('keeps line breaks, sets the run language and writes one <a:t> per run', async () => {
    const { output } = await roundTrip(await pptx(), 'pptx')
    const xml = await (await readZip(output)).file('ppt/slides/slide1.xml')!.async('string')
    const doc = parseXmlStrict(xml)
    const runs = [...doc.getElementsByTagName('a:r')]
    // PowerPoint ขึ้นหน้าต่าง "ซ่อมไฟล์" ถ้า run มี <a:t> มากกว่าหนึ่งตัว
    for (const r of runs) expect(r.getElementsByTagName('a:t')).toHaveLength(1)
    expect(runs.map((r) => r.getElementsByTagName('a:rPr')[0].getAttribute('lang'))).toEqual(['th-TH', 'th-TH', 'th-TH', 'th-TH'])
    expect(runs.map((r) => r.textContent)).toEqual(['[TH] Revenue grew ', 'twenty percent', '[TH] First', 'Second'])
    expect(doc.getElementsByTagName('a:p')[1].childNodes[1].nodeName).toBe('a:br')
    expect(runs[1].getElementsByTagName('a:rPr')[0].getAttribute('b')).toBe('1')
  })
})

describe('xlsx', () => {
  it('translates text cells but not keys, codes or numbers', async () => {
    const file = await zipFile('w.xlsx', {
      'xl/sharedStrings.xml': `<sst ${S}><si><t>hero.headline</t></si><si><t>Your files, going further.</t></si><si><t>SKU-001</t></si><si><r><rPr><b/></rPr><t>Bold</t></r><r><t> text</t></r></si></sst>`,
      'xl/worksheets/sheet1.xml': `<worksheet ${S}><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Inline note</t></is></c><c r="B1"><v>42</v></c></row></sheetData></worksheet>`,
    })
    const { segments, output } = await roundTrip(file, 'xlsx')
    expect(segments).toEqual(['Your files, going further.', '<g1>Bold</g1><g2> text</g2>', 'Inline note'])
    const zip = await readZip(output)
    const strings = parseXmlStrict(await zip.file('xl/sharedStrings.xml')!.async('string'))
    expect([...strings.getElementsByTagName('si')].map((si) => si.textContent)).toEqual([
      'hero.headline',
      '[TH] Your files, going further.',
      'SKU-001',
      '[TH] Bold text',
    ])
    const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    expect(sheet).toContain('<t xml:space="preserve">[TH] Inline note</t>')
    expect(sheet).toContain('<v>42</v>')
  })
})

/** ไฟล์ zip ของ ODF/EPUB: mimetype ต้องเป็นไฟล์แรกและไม่บีบอัด (method 0) */
async function expectMimetypeFirst(blob: Blob, mime: string) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const view = new DataView(bytes.buffer)
  expect(view.getUint32(0, true)).toBe(0x04034b50)
  expect(view.getUint16(8, true)).toBe(0) // STORE
  const nameLength = view.getUint16(26, true)
  const extraLength = view.getUint16(28, true)
  expect(new TextDecoder().decode(bytes.slice(30, 30 + nameLength))).toBe('mimetype')
  const start = 30 + nameLength + extraLength
  expect(new TextDecoder().decode(bytes.slice(start, start + mime.length))).toBe(mime)
}

describe('OpenDocument', () => {
  it('keeps spans and writes mimetype first, uncompressed', async () => {
    const mime = 'application/vnd.oasis.opendocument.text'
    const file = await zipFile(
      'r.odt',
      {
        'content.xml': `<office:document-content ${ODF}><office:body><office:text><text:h>Annual report</text:h><text:p>Sales were <text:span text:style-name="B">very strong</text:span>.</text:p></office:text></office:body></office:document-content>`,
      },
      ['mimetype', mime],
    )
    const { segments, output } = await roundTrip(file, 'odt')
    expect(segments).toEqual(['Annual report', 'Sales were <g1>very strong</g1>.'])
    await expectMimetypeFirst(output, mime)
    const xml = await (await readZip(output)).file('content.xml')!.async('string')
    expect(xml).toContain('<text:p>[TH] Sales were <text:span text:style-name="B">very strong</text:span>.</text:p>')
  })
})

describe('epub', () => {
  it('translates chapters and metadata, sets the language, keeps mimetype first', async () => {
    const file = await zipFile(
      's.epub',
      {
        'META-INF/container.xml': '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>',
        'OEBPS/content.opf':
          '<package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>The Long Road</dc:title><dc:language>en</dc:language></metadata><manifest><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest></package>',
        'OEBPS/ch1.xhtml':
          '<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter 1</title></head><body><p>The road was <em>long</em>.</p></body></html>',
      },
      ['mimetype', 'application/epub+zip'],
    )
    const { output } = await roundTrip(file, 'epub')
    await expectMimetypeFirst(output, 'application/epub+zip')
    const zip = await readZip(output)
    const opf = await zip.file('OEBPS/content.opf')!.async('string')
    expect(opf).toContain('<dc:title>[TH] The Long Road</dc:title>')
    expect(opf).toContain('<dc:language>th</dc:language>')
    const chapter = await zip.file('OEBPS/ch1.xhtml')!.async('string')
    parseXmlStrict(chapter)
    expect(chapter).toContain('<p>[TH] The road was <em>long</em>.</p>')
  })
})

describe('rtf', () => {
  const source = String.raw`{\rtf1\ansi\ansicpg874\deff0{\fonttbl{\f0 Tahoma;}}{\*\generator Test}\f0 Dear team,\par
This is an {\b important} update.\par
\'a1\'d2\'c3\par
}`

  it('keeps groups and formatting, writes Thai as \\uN? escapes', async () => {
    const { segments, output } = await roundTrip(textFile('l.rtf', source), 'rtf', (s) => s.replace('Dear team,', 'เรียนทีม'))
    expect(segments).toEqual(['Dear team,', '<g1>This is an </g1><g2>important</g2><g3> update.</g3>', 'การ'])
    const out = await blobText(output)
    expect(out).toContain('{\\fonttbl{\\f0 Tahoma;}}{\\*\\generator Test}')
    expect(out).toContain('{\\uc1 \\u3648?\\u3619?') // "เร…" = U+0E40 U+0E23
    expect(out).toContain('{\\b important}')
    expect(out.split('{').length).toBe(out.split('}').length)
  })
})
