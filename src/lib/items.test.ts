import { describe, expect, it } from 'vitest'
import type { Unit } from '../types'
import { normalizeBook } from './normalize'
import { allItems, bookItems, chapterItems, itemIndex, quizable, sectionItems } from './items'

const book: Unit = normalizeBook(
  {
    id: 'zh-t',
    lang: 'zh',
    title: '테스트',
    lessons: [
      {
        title: '1과',
        sections: [
          {
            title: '회화',
            kind: 'passage',
            words: [
              { text: '去', reading: 'qù', meaning: '가다', pos: '동사' },
              { text: '빈뜻', meaning: '' }, // 뜻 없음 → 출제 제외
            ],
            passages: [{ text: '我去学校。', meaning: '나는 학교에 가요', tokens: ['我', '去', '学校'] }],
            grammar: [
              { point: '吗 의문문', explanation: '문장 끝 吗', examples: [{ text: '你忙吗？', meaning: '바빠요?' }] },
            ],
          },
        ],
      },
      { title: '2과', words: [{ text: '吃', meaning: '먹다' }] },
    ],
  },
  'zh-t'
)

describe('sectionItems', () => {
  const items = sectionItems(book, book.lessons[0], book.lessons[0].sections[0])

  it('새단어 · 본문 문장 · 문법 예문을 한 줄로 편다', () => {
    expect(items).toHaveLength(4) // 단어 2 + 문장 1 + 문법 예문 1
    expect(items.map((i) => i.type)).toEqual(['word', 'word', 'sentence', 'sentence'])
  })

  it('문법 예문도 빠짐없이 들어온다', () => {
    // 저장 구조에서 한 단계 더 깊이 있어 빠뜨리기 쉬운 지점
    expect(items.find((i) => i.text === '你忙吗？')).toBeTruthy()
  })

  it('소속 정보를 함께 싣는다 (퀴즈 범위 필터용)', () => {
    for (const it of items) {
      expect(it.bookId).toBe('zh-t')
      expect(it.chapterId).toBe('zh-t/c1')
      expect(it.sectionId).toBe('zh-t/c1/s1')
      expect(it.sectionKind).toBe('passage')
      expect(it.lang).toBe('zh')
    }
  })

  it('단어·문장 고유 필드를 유지한다', () => {
    const word = items.find((i) => i.text === '去')!
    expect(word.pos).toBe('동사')
    expect(word.reading).toBe('qù')
    const sentence = items.find((i) => i.text === '我去学校。')!
    expect(sentence.tokens).toEqual(['我', '去', '学校'])
  })

  it('id는 원본 항목의 id 그대로다 (SRS가 이 키를 쓴다)', () => {
    expect(items.map((i) => i.id)).toEqual([
      'zh-t/c1/s1/w1',
      'zh-t/c1/s1/w2',
      'zh-t/c1/s1/p1',
      'zh-t/c1/s1/g1/e1',
    ])
  })
})

describe('chapterItems / bookItems / allItems', () => {
  it('계층이 올라갈수록 누적된다', () => {
    expect(chapterItems(book, book.lessons[0])).toHaveLength(4)
    expect(chapterItems(book, book.lessons[1])).toHaveLength(1)
    expect(bookItems(book)).toHaveLength(5)
    expect(allItems([book, book])).toHaveLength(10)
  })
})

describe('quizable', () => {
  it('뜻이 빈 항목을 뺀다', () => {
    const out = quizable(bookItems(book))
    expect(out.find((i) => i.text === '빈뜻')).toBeUndefined()
    expect(out).toHaveLength(4)
  })

  it('같은 텍스트가 두 번 나오면 앞의 것만 남긴다', () => {
    const dup = normalizeBook(
      {
        id: 'd',
        lang: 'zh',
        title: 'd',
        lessons: [
          { title: '1과', words: [{ text: '去', meaning: '가다' }] },
          { title: '2과', words: [{ text: '去', meaning: '가다(중복)' }] },
        ],
      },
      'd'
    )
    const out = quizable(bookItems(dup))
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('d/c1/s1/w1')
  })

  it('단어와 문장은 텍스트가 같아도 서로 지우지 않는다', () => {
    const same = normalizeBook(
      {
        id: 's',
        lang: 'zh',
        title: 's',
        lessons: [{ title: '1과', sections: [{ title: 's', words: [{ text: '好', meaning: '좋다' }], passages: [{ text: '好', meaning: '좋아요' }] }] }],
      },
      's'
    )
    expect(quizable(bookItems(same))).toHaveLength(2)
  })
})

describe('itemIndex', () => {
  it('id로 항목을 되찾는다', () => {
    const idx = itemIndex(bookItems(book))
    expect(idx.get('zh-t/c1/s1/w1')?.text).toBe('去')
    expect(idx.get('없는id')).toBeUndefined()
  })
})
