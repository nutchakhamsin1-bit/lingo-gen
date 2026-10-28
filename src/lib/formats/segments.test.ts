import { describe, expect, it } from 'vitest'
import {
  encodePieces,
  groupsInOrder,
  looksLikeText,
  parsePieces,
  splitPadding,
  toPlainText,
  type Piece,
} from './segments'

describe('segment encoding', () => {
  it('round-trips text, nested groups and placeholders', () => {
    const pieces: Piece[] = [
      { type: 'text', text: 'A & B < C ' },
      { type: 'g', id: 1, children: [{ type: 'text', text: 'bold ' }, { type: 'g', id: 2, children: [{ type: 'text', text: 'link' }] }] },
      { type: 'x', id: 3 },
      { type: 'text', text: '>' },
    ]
    const encoded = encodePieces(pieces)
    expect(encoded).toBe('A &amp; B &lt; C <g1>bold <g2>link</g2></g1><x3/>&gt;')
    expect(parsePieces(encoded)).toEqual(pieces)
  })

  it('tolerates tags the translator dropped, left open or closed twice', () => {
    expect(parsePieces('<g1>open only')).toEqual([{ type: 'g', id: 1, children: [{ type: 'text', text: 'open only' }] }])
    expect(parsePieces('stray </g2> close')).toEqual([
      { type: 'text', text: 'stray ' },
      { type: 'text', text: ' close' },
    ])
    expect(parsePieces('<x4 />')).toEqual([{ type: 'x', id: 4 }])
  })

  it('reads plain text without tags', () => {
    expect(toPlainText('Save <g1>all</g1> &amp; exit<x2/>!')).toBe('Save all & exit!')
    expect(toPlainText('a<x1/>b', ' ')).toBe('a b')
  })

  it('splits leading and trailing whitespace', () => {
    expect(splitPadding('  hello world \n')).toEqual(['  ', 'hello world', ' \n'])
    expect(splitPadding('   ')).toEqual(['   ', '', ''])
  })
})

describe('groupsInOrder', () => {
  it('keeps the translated order and attaches loose text to a neighbouring group', () => {
    const order = groupsInOrder(parsePieces('[TH] <g3>C</g3> <g1>A</g1>'), 1)
    expect(order.map((g) => [g.id, toPlainText(encodePieces(g.content))])).toEqual([
      [3, '[TH] C '],
      [1, 'A'],
    ])
  })
})

describe('looksLikeText (data files)', () => {
  it.each([
    ['Save', true],
    ['Save changes', true],
    ['บันทึก', true],
    ['Welcome back!', true],
    ['user_42', false],
    ['SKU-001', false],
    ['https://example.com', false],
    ['a@b.co', false],
    ['./images/logo.png', false],
    ['dark-green', false],
    ['camelCaseKey', false],
    ['#20e3a2', false],
    ['42', false],
    ['', false],
  ])('%s → %s', (value, expected) => {
    expect(looksLikeText(value)).toBe(expected)
  })
})
