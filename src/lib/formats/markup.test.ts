import { describe, expect, it } from 'vitest'
import { blobText, parseXmlStrict, roundTrip, textFile } from './testUtils'

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="windows-1252"><title>Lingo home</title>
<meta name="description" content="Translate documents"></head>
<body>
  <h1>Your files, going further</h1>
  <p>Upload <strong>many files</strong> now.</p>
  <img src="hero.png" alt="People sharing documents">
  <pre>code stays as is</pre>
  <script>console.log("do not translate")</script>
</body>
</html>`

describe('html', () => {
  it('translates visible text, alt, title and meta description only', async () => {
    const { segments, output } = await roundTrip(textFile('p.html', PAGE), 'html')
    expect(segments).toContain('Upload <g1>many files</g1> now.')
    expect(segments.join('|')).not.toMatch(/do not translate|code stays/)
    const out = await blobText(output)
    expect(out).toMatch(/^<!DOCTYPE html>\n<html lang="th">/)
    expect(out).toContain('<meta charset="utf-8">')
    expect(out).toContain('<title>[TH] Lingo home</title>')
    expect(out).toContain('content="[TH] Translate documents"')
    expect(out).toContain('alt="[TH] People sharing documents"')
    expect(out).toContain('<pre>code stays as is</pre>')
    expect(out).toContain('console.log("do not translate")')
  })

  it('keeps inline formatting on the right words when the translator reorders them', async () => {
    const { output } = await roundTrip(textFile('p.html', '<p>Upload <strong>many files</strong> now.</p>'), 'html', () =>
      '<g1>หลายไฟล์</g1> อัปโหลดเลย',
    )
    expect(await blobText(output)).toBe('<p><strong>หลายไฟล์</strong> อัปโหลดเลย</p>')
  })

  it('does not lose images when the translator drops their placeholder', async () => {
    const { output } = await roundTrip(textFile('p.html', '<p>See <img src="a.png"> here</p>'), 'html', () => 'ดูตรงนี้')
    expect(await blobText(output)).toBe('<p>ดูตรงนี้<img src="a.png"></p>')
  })
})

describe('xml', () => {
  it('translates text nodes, keeping tags, attributes and the declaration', async () => {
    const source = '<?xml version="1.0" encoding="UTF-8"?>\n<feed><title>News</title><entry id="a1"><summary> New screen </summary></entry></feed>'
    const { output } = await roundTrip(textFile('f.xml', source), 'xml')
    const out = await blobText(output)
    expect(out).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<feed><title>[TH] News</title><entry id="a1"><summary> [TH] New screen </summary></entry></feed>',
    )
    parseXmlStrict(out)
  })
})
