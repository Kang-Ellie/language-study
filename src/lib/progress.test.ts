import { describe, expect, it } from 'vitest'
import type { Unit } from '../types'
import { normalizeBook } from './normalize'
import { defaults, toggleChapterDone, type AppState, type SrsEntry } from './storage'
import {
  MASTERED_LEVEL,
  bookFill,
  bookMastery,
  chapterMastery,
  pct,
  sectionHasContent,
  sectionMastery,
} from './progress'

const book: Unit = normalizeBook(
  {
    id: 'b',
    lang: 'zh',
    title: 't',
    lessons: [
      {
        title: '1과',
        sections: [
          {
            title: '회화',
            words: [
              { text: '去', meaning: '가다' },
              { text: '吃', meaning: '먹다' },
            ],
            passages: [{ text: '我去。', meaning: '가요' }],
          },
          { title: '독해', words: [{ text: '书', meaning: '책' }] },
          { title: '아직 안 채운 곳' }, // 비어 있음
        ],
      },
      { title: '2과', words: [{ text: '看', meaning: '보다' }] },
    ],
  },
  'b'
)

const S1 = 'b/c1/s1' // 항목 3개
const S2 = 'b/c1/s2' // 항목 1개
const S3 = 'b/c1/s3' // 비어 있음

function state(levels: Record<string, number> = {}): AppState {
  const srs: Record<string, SrsEntry> = {}
  for (const [id, level] of Object.entries(levels)) {
    srs[id] = { level, next: '2099-01-01', seen: 3, wrong: 0 }
  }
  return { ...defaults(), srs }
}

const sec = (id: string) => book.lessons[0].sections.find((s) => s.id === id)!

describe('sectionMastery', () => {
  it('아무것도 안 풀었으면 0', () => {
    const m = sectionMastery(book, book.lessons[0], sec(S1), state())
    expect(m).toEqual({ total: 3, mastered: 0, ratio: 0 })
  })

  it(`숙련도 ${MASTERED_LEVEL} 이상만 익힌 것으로 센다`, () => {
    const m = sectionMastery(
      book,
      book.lessons[0],
      sec(S1),
      state({ 'b/c1/s1/w1': 3, 'b/c1/s1/w2': 2, 'b/c1/s1/p1': 5 })
    )
    expect(m.mastered).toBe(2) // level 2는 아직
    expect(m.total).toBe(3)
  })

  it('빈 소단원은 0으로 나누지 않는다', () => {
    expect(sectionMastery(book, book.lessons[0], sec(S3), state())).toEqual({
      total: 0,
      mastered: 0,
      ratio: 0,
    })
  })
})

describe('chapterMastery', () => {
  it('항목이 많은 소단원이 그만큼 무겁게 반영된다', () => {
    // 소단원 비율의 단순 평균이면 (1/3 + 1/1)/2 = 0.67 이 나온다.
    // 항목을 통째로 세면 2/4 = 0.5 — 이쪽이 맞다.
    const m = chapterMastery(book, book.lessons[0], state({ 'b/c1/s1/w1': 4, 'b/c1/s2/w1': 4 }))
    expect(m.total).toBe(4)
    expect(m.mastered).toBe(2)
    expect(m.ratio).toBe(0.5)
  })
})

describe('bookMastery', () => {
  it('책 전체 항목을 센다', () => {
    expect(bookMastery(book, state()).total).toBe(5) // 3 + 1 + 0 + 1
  })

  it('다 익히면 1', () => {
    const all = Object.fromEntries(
      ['b/c1/s1/w1', 'b/c1/s1/w2', 'b/c1/s1/p1', 'b/c1/s2/w1', 'b/c2/s1/w1'].map((id) => [id, 5])
    )
    expect(bookMastery(book, state(all)).ratio).toBe(1)
  })
})

describe('숙달도와 완료 표시는 별개다', () => {
  it('완료 표시를 켜도 숙달도는 그대로', () => {
    // 퀴즈를 안 풀고 "완료로 표시"만 한 경우 — 실제 숙달과 구분돼야 한다
    const marked = toggleChapterDone(state(), 'b/c1')
    expect(marked.progress['b/c1'].markedDone).toBe(true)
    expect(chapterMastery(book, book.lessons[0], marked).ratio).toBe(0)
  })

  it('숙달도가 100%여도 완료 표시는 꺼져 있을 수 있다', () => {
    const s = state({ 'b/c2/s1/w1': 5 })
    expect(chapterMastery(book, book.lessons[1], s).ratio).toBe(1)
    expect(s.progress['b/c2']?.markedDone).toBeUndefined()
  })
})

describe('sectionHasContent', () => {
  it('단어·문장·문법·본문 중 하나라도 있으면 true', () => {
    expect(sectionHasContent(sec(S1))).toBe(true)
    expect(sectionHasContent(sec(S2))).toBe(true)
  })

  it('전부 비면 false', () => {
    expect(sectionHasContent(sec(S3))).toBe(false)
  })

  it('본문 지문만 있어도 true', () => {
    const withPassage = normalizeBook(
      { id: 'p', lang: 'zh', title: 'p', lessons: [{ title: '1', sections: [{ title: 's', passageText: '你好' }] }] },
      'p'
    )
    expect(sectionHasContent(withPassage.lessons[0].sections[0])).toBe(true)
  })
})

describe('bookFill', () => {
  it('내용이 있는 소단원 비율', () => {
    // 소단원 4개(1과 3개 + 2과 1개) 중 3개가 채워짐
    expect(bookFill(book)).toEqual({ filled: 3, total: 4, ratio: 0.75 })
  })

  it('소단원이 없으면 0으로 나누지 않는다', () => {
    const empty = normalizeBook({ id: 'e', lang: 'zh', title: 'e', lessons: [] }, 'e')
    expect(bookFill(empty)).toEqual({ filled: 0, total: 0, ratio: 0 })
  })
})

describe('pct', () => {
  it('반올림한 백분율', () => {
    expect(pct(0.5)).toBe(50)
    expect(pct(0.666)).toBe(67)
    expect(pct(0)).toBe(0)
  })
})
