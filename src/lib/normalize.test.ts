import { describe, expect, it } from 'vitest'
import { adoptIds, isNormalized, normalizeBook, rekeyBook, type RawUnit } from './normalize'

const flatBook: RawUnit = {
  id: 'zh-demo',
  lang: 'zh',
  title: '데모 교재',
  lessons: [
    {
      title: '1과',
      words: [
        { text: '去', reading: 'qù', meaning: '가다' },
        { text: '学校', reading: 'xuéxiào', meaning: '학교' },
      ],
      sentences: [{ text: '我去学校。', meaning: '나는 학교에 가요' }],
    },
    {
      title: '2과',
      words: [{ text: '吃', meaning: '먹다' }],
      sentences: [],
    },
  ],
}

describe('normalizeBook', () => {
  it('평면 구조를 단일 소단원으로 승격한다', () => {
    const book = normalizeBook(flatBook, 'fallback')
    expect(book.lessons).toHaveLength(2)
    expect(book.lessons[0].sections).toHaveLength(1)
    expect(book.lessons[0].sections[0].title).toBe('본문')
    expect(book.lessons[0].sections[0].words).toHaveLength(2)
    expect(book.lessons[0].sections[0].passages).toHaveLength(1)
  })

  it('계층 경로 id를 부여한다', () => {
    const book = normalizeBook(flatBook, 'fallback')
    expect(book.lessons[0].id).toBe('zh-demo/c1')
    expect(book.lessons[0].sections[0].id).toBe('zh-demo/c1/s1')
    expect(book.lessons[0].sections[0].words[0].id).toBe('zh-demo/c1/s1/w1')
    expect(book.lessons[0].sections[0].words[1].id).toBe('zh-demo/c1/s1/w2')
    expect(book.lessons[0].sections[0].passages[0].id).toBe('zh-demo/c1/s1/p1')
    expect(book.lessons[1].id).toBe('zh-demo/c2')
  })

  it('멱등이다 — 두 번 돌려도 id가 그대로다', () => {
    const once = normalizeBook(flatBook, 'fallback')
    const twice = normalizeBook(once, 'fallback')
    expect(twice).toEqual(once)
  })

  it('이미 있는 id는 절대 바꾸지 않는다', () => {
    const book = normalizeBook(
      {
        id: 'b',
        title: 't',
        lessons: [
          {
            id: 'b/chapter-hand-written',
            title: '1과',
            sections: [
              {
                id: 'b/sec-x',
                title: '회화',
                words: [{ id: 'b/sec-x/keep-me', text: '去', meaning: '가다' }],
              },
            ],
          },
        ],
      },
      'fallback'
    )
    expect(book.lessons[0].id).toBe('b/chapter-hand-written')
    expect(book.lessons[0].sections[0].id).toBe('b/sec-x')
    expect(book.lessons[0].sections[0].words[0].id).toBe('b/sec-x/keep-me')
  })

  it('중복 id는 떼어낸다 (id는 전역 고유여야 한다)', () => {
    const book = normalizeBook(
      {
        id: 'b',
        title: 't',
        lessons: [
          {
            id: 'b/c1',
            title: '1과',
            sections: [
              {
                id: 'b/c1/s1',
                title: 'A',
                words: [
                  { id: 'dup', text: '去', meaning: '가다' },
                  { id: 'dup', text: '吃', meaning: '먹다' },
                ],
              },
            ],
          },
        ],
      },
      'fallback'
    )
    const ids = book.lessons[0].sections[0].words.map((w) => w.id)
    expect(ids[0]).toBe('dup')
    expect(ids[1]).toBe('dup-2')
    expect(new Set(ids).size).toBe(2)
  })

  it('문법 예문에도 id를 준다', () => {
    const book = normalizeBook(
      {
        id: 'b',
        title: 't',
        lessons: [
          {
            title: '1과',
            sections: [
              {
                title: '문법',
                grammar: [{ point: '吗 의문문', examples: [{ text: '你忙吗？', meaning: '바빠요?' }] }],
              },
            ],
          },
        ],
      },
      'fallback'
    )
    const g = book.lessons[0].sections[0].grammar[0]
    expect(g.id).toBe('b/c1/s1/g1')
    expect(g.examples[0].id).toBe('b/c1/s1/g1/e1')
  })

  it('책 id가 없으면 fallback을 쓴다', () => {
    const book = normalizeBook({ title: 't', lessons: [{ title: '1과' }] }, 'zh-book-123')
    expect(book.id).toBe('zh-book-123')
    expect(book.lessons[0].id).toBe('zh-book-123/c1')
  })

  it('알 수 없는 track/sourceType/kind는 안전한 값으로 떨어진다', () => {
    const book = normalizeBook(
      { id: 'b', title: 't', track: 'nonsense', sourceType: 'nope', lessons: [{ title: '1', sections: [{ title: 's', kind: 'bogus' }] }] },
      'f'
    )
    expect(book.track).toBe('media')
    expect(book.sourceType).toBeUndefined()
    expect(book.lessons[0].sections[0].kind).toBeUndefined()
  })
})

describe('isNormalized', () => {
  it('평면 구조는 false', () => {
    expect(isNormalized(flatBook)).toBe(false)
  })
  it('정규화 결과는 true', () => {
    expect(isNormalized(normalizeBook(flatBook, 'f'))).toBe(true)
  })
})

describe('adoptIds', () => {
  const existing = normalizeBook(flatBook, 'zh-demo')

  it('텍스트가 같으면 기존 id를 물려받는다', () => {
    const reimported: RawUnit = {
      title: '데모 교재',
      lessons: [
        {
          title: '1과 (AI가 다시 만든 것)',
          sections: [
            {
              title: '본문',
              words: [
                { text: '学校', meaning: '학교' }, // 순서가 바뀌어도
                { text: '去', meaning: '가다·떠나다' }, // 뜻을 고쳐도
              ],
              passages: [{ text: '我去学校。', meaning: '학교에 갑니다' }],
            },
          ],
        },
      ],
    }
    const book = normalizeBook(adoptIds(reimported, existing), existing.id)
    const words = book.lessons[0].sections[0].words
    expect(words.find((w) => w.text === '去')!.id).toBe('zh-demo/c1/s1/w1')
    expect(words.find((w) => w.text === '学校')!.id).toBe('zh-demo/c1/s1/w2')
    expect(book.lessons[0].sections[0].passages[0].id).toBe('zh-demo/c1/s1/p1')
  })

  it('없던 단어는 새 id를 받는다', () => {
    const book = normalizeBook(
      adoptIds(
        { title: 't', lessons: [{ title: '1과', sections: [{ title: '본문', words: [{ text: '新', meaning: '새롭다' }] }] }] },
        existing
      ),
      existing.id
    )
    expect(book.lessons[0].sections[0].words[0].id).toBe('zh-demo/c1/s1/w1')
  })

  it('같은 텍스트가 두 번 오면 id를 하나만 물려준다', () => {
    const book = normalizeBook(
      adoptIds(
        {
          title: 't',
          lessons: [
            {
              title: '1과',
              sections: [
                {
                  title: '본문',
                  words: [
                    { text: '去', meaning: '가다' },
                    { text: '去', meaning: '가다(중복)' },
                  ],
                },
              ],
            },
          ],
        },
        existing
      ),
      existing.id
    )
    const ids = book.lessons[0].sections[0].words.map((w) => w.id)
    expect(ids[0]).toBe('zh-demo/c1/s1/w1')
    expect(ids[1]).not.toBe(ids[0])
  })
})


describe('langOf (책의 언어)', () => {
  it('lang 필드를 최우선으로 쓴다', () => {
    expect(normalizeBook({ id: 'zh-x', lang: 'ja', title: 't' }, 'f').lang).toBe('ja')
  })

  it('lang이 없으면 id 접두사에서 유추한다 (예전 데이터)', () => {
    expect(normalizeBook({ id: 'ja-spy-family', title: 't' }, 'f').lang).toBe('ja')
    expect(normalizeBook({ id: 'en-book-123', title: 't' }, 'f').lang).toBe('en')
  })

  it('유추할 수 없으면 기본값', () => {
    expect(normalizeBook({ id: 'mybook', title: 't' }, 'f').lang).toBe('zh')
  })
})

describe('rekeyBook', () => {
  const book = normalizeBook(flatBook, 'zh-demo')

  it('책 id와 하위 id를 전부 따라 바꾼다', () => {
    const moved = rekeyBook(book, 'en-book-999')
    expect(moved.id).toBe('en-book-999')
    expect(moved.lessons[0].id).toBe('en-book-999/c1')
    expect(moved.lessons[0].sections[0].id).toBe('en-book-999/c1/s1')
    expect(moved.lessons[0].sections[0].words[0].id).toBe('en-book-999/c1/s1/w1')
    expect(moved.lessons[0].sections[0].passages[0].id).toBe('en-book-999/c1/s1/p1')
  })

  it('같은 id면 원본을 그대로 돌려준다', () => {
    expect(rekeyBook(book, 'zh-demo')).toBe(book)
  })

  it('책 id를 접두사로 쓰지 않는 id는 건드리지 않는다', () => {
    const odd = normalizeBook(
      { id: 'b', lang: 'zh', title: 't', lessons: [{ id: '손으로-쓴-id', title: '1과' }] },
      'b'
    )
    expect(rekeyBook(odd, 'c').lessons[0].id).toBe('손으로-쓴-id')
  })

  it('내용은 그대로다', () => {
    const moved = rekeyBook(book, 'x')
    expect(moved.lessons[0].sections[0].words[0].text).toBe('去')
    expect(moved.title).toBe('데모 교재')
  })
})
