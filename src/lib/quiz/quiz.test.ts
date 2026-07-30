import { describe, expect, it } from 'vitest'
import type { Exercise, Unit } from '../../types'
import { normalizeBook } from '../normalize'
import { bookItems } from '../items'
import { defaults, type AppState, type SrsEntry } from '../storage'
import { buildQuiz, defaultOptions, interleave } from './index'
import { collectItems, countAvailable } from './scope'
import { buildVocab, longestMatch, tokenize } from './tokenize'
import { buildDistractors, distractorScore } from './distractor'
import { itemWeight, weightedSample } from './weight'
import { editDistance, grade, normalize } from './grade'
import { seededRng } from './random'
import { ALL_KINDS } from './types'

const zh: Unit = normalizeBook(
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
            words: [
              { text: '我', reading: 'wǒ', meaning: '나', pos: '대명사' },
              { text: '是', reading: 'shì', meaning: '~이다', pos: '동사' },
              { text: '韩国人', reading: 'hánguórén', meaning: '한국인', pos: '명사' },
              { text: '去', reading: 'qù', meaning: '가다', pos: '동사' },
              { text: '学校', reading: 'xuéxiào', meaning: '학교', pos: '명사' },
              { text: '商店', reading: 'shāngdiàn', meaning: '가게', pos: '명사' },
            ],
            passages: [
              { text: '我是韩国人。', meaning: '나는 한국인이에요' },
              { text: '我去学校。', meaning: '나는 학교에 가요' },
              { text: '你去商店吗？', meaning: '가게에 가요?' },
            ],
            grammar: [{ point: '吗 의문문', explanation: '끝에 吗', examples: [{ text: '你忙吗？', meaning: '바빠요?' }] }],
          },
        ],
      },
      {
        title: '2과',
        words: [{ text: '吃', meaning: '먹다' }],
        sentences: [{ text: '我吃饭。', meaning: '나는 밥을 먹어요' }],
      },
    ],
  },
  'zh-t'
)

const books = [zh]
const items = bookItems(zh)
const validIds = new Set(items.map((i) => i.id))
const C1 = 'zh-t/c1'
const S1 = 'zh-t/c1/s1'

function state(srs: Record<string, Partial<SrsEntry>> = {}): AppState {
  const full: Record<string, SrsEntry> = {}
  for (const [k, v] of Object.entries(srs)) {
    full[k] = { level: 0, next: '2020-01-01', seen: 0, wrong: 0, ...v }
  }
  return { ...defaults(), srs: full }
}

const opts = (over: Partial<ReturnType<typeof defaultOptions>> = {}) => ({
  ...defaultOptions({ type: 'chapter', chapterId: C1 }, new Set<string>()),
  seed: 1,
  ...over,
})

// ── 범위 수집 ────────────────────────────────────────────

describe('collectItems', () => {
  it('소단원 / 챕터 / 교재 범위를 각각 걸러낸다', () => {
    const s = state()
    expect(collectItems(books, { type: 'section', sectionId: S1 }, s)).toHaveLength(10)
    expect(collectItems(books, { type: 'chapter', chapterId: C1 }, s)).toHaveLength(10)
    expect(collectItems(books, { type: 'book', bookId: 'zh-t' }, s)).toHaveLength(12)
  })

  it('복습 범위는 만기된 것만 (단어·문장 모두)', () => {
    const s = state({
      'zh-t/c1/s1/w1': { next: '2020-01-01' }, // 만기
      'zh-t/c1/s1/p1': { next: '2020-01-01' }, // 문장도 만기
      'zh-t/c1/s1/w2': { next: '2099-01-01' }, // 아직
    })
    const due = collectItems(books, { type: 'review' }, s)
    expect(due.map((i) => i.id).sort()).toEqual(['zh-t/c1/s1/p1', 'zh-t/c1/s1/w1'])
    // v1의 dueWords()는 단어만 훑어서 문장이 절대 복습에 안 나왔다
    expect(due.some((i) => i.type === 'sentence')).toBe(true)
  })

  it('최근 틀린 것 범위', () => {
    const s = state({ 'zh-t/c1/s1/w1': { lastWrong: '2020-01-01' } })
    expect(collectItems(books, { type: 'wrong', days: 3 }, s)).toHaveLength(0) // 너무 오래됨
  })
})

describe('countAvailable', () => {
  it('오디오가 없으면 듣기 가능 수가 0이다', () => {
    const counts = countAvailable(items, new Set())
    expect(counts.listen).toBe(0)
    expect(counts.pick).toBeGreaterThan(0)
  })

  it('파일이 실제로 있는 오디오만 센다', () => {
    const withAudio = normalizeBook(
      {
        id: 'a',
        lang: 'zh',
        title: 'a',
        lessons: [
          {
            title: '1',
            sections: [
              {
                title: 's',
                words: [
                  { text: '去', meaning: '가다', audio: 'ok.mp3' },
                  { text: '吃', meaning: '먹다', audio: 'missing.mp3' },
                ],
              },
            ],
          },
        ],
      },
      'a'
    )
    expect(countAvailable(bookItems(withAudio), new Set(['ok.mp3'])).listen).toBe(1)
  })
})

// ── 분절 (B5) ────────────────────────────────────────────

describe('tokenize', () => {
  const vocab = buildVocab(items)

  it('새단어로 최장일치 분절한다 — 글자 단위로 흩지 않는다', () => {
    // v1: 我是韩国人 → [我,是,韩,国,人] (5타일, 문제가 아니라 노가다)
    const sentence = items.find((i) => i.text === '我是韩国人。')!
    expect(tokenize(sentence, vocab).tiles).toEqual(['我', '是', '韩国人'])
  })

  it('사용자가 지정한 tokens를 최우선으로 쓴다', () => {
    const custom = { ...items[0], type: 'sentence' as const, text: '我去学校。', tokens: ['我去', '学校'] }
    expect(tokenize(custom, vocab).tiles).toEqual(['我去', '学校'])
  })

  it('영어는 공백으로 나누고 이어 붙일 때 공백을 쓴다', () => {
    const en = { ...items[0], type: 'sentence' as const, text: 'I go to school.', tokens: undefined }
    const t = tokenize(en, [])
    expect(t.tiles).toEqual(['I', 'go', 'to', 'school'])
    expect(t.joiner).toBe(' ')
  })

  it('사전에 없는 글자는 한 덩어리로 모은다 (타일 폭발 방지)', () => {
    expect(longestMatch('我不知道去', ['去', '我'])).toEqual(['我', '不知道', '去'])
  })

  it('사전이 비면 글자 단위로 떨어진다', () => {
    const s = { ...items[0], type: 'sentence' as const, text: '你好', tokens: undefined }
    expect(tokenize(s, []).tiles).toEqual(['你', '好'])
  })
})

// ── 오답 보기 (B4) ───────────────────────────────────────

describe('buildDistractors', () => {
  const rng = seededRng(7)

  it('정답과 뜻이 겹치는 후보는 점수를 깎는다', () => {
    const answer = items.find((i) => i.text === '학교' || i.meaning === '학교')!
    const overlapping = { ...answer, id: 'x', text: 'zz', meaning: '학교 앞' }
    const unrelated = { ...answer, id: 'y', text: 'yy', meaning: '가게' }
    expect(distractorScore(answer, overlapping, 'meaning')).toBeLessThan(
      distractorScore(answer, unrelated, 'meaning')
    )
  })

  it('같은 소단원 · 같은 품사 후보에 더 높은 점수를 준다', () => {
    const answer = items.find((i) => i.text === '学校')!
    const samePos = items.find((i) => i.text === '商店')! // 같은 소단원 + 같은 품사(명사)
    const otherPos = items.find((i) => i.text === '是')! // 같은 소단원, 다른 품사
    expect(distractorScore(answer, samePos, 'meaning')).toBeGreaterThan(
      distractorScore(answer, otherPos, 'meaning')
    )
  })

  it('정답을 보기로 내놓지 않고 중복도 없다', () => {
    const answer = items[0]
    const out = buildDistractors(answer, items, 'meaning', 3, rng)
    expect(out).not.toContain(answer.meaning)
    expect(new Set(out).size).toBe(out.length)
  })
})

// ── 가중치 (B1) ──────────────────────────────────────────

describe('itemWeight', () => {
  const t = '2026-07-30'

  it('아직 안 본 항목이 기본 가중치보다 높다', () => {
    expect(itemWeight(undefined, t)).toBeGreaterThan(itemWeight({ level: 5, next: t, seen: 9, wrong: 0 }, t))
  })

  it('숙련도가 낮을수록 높다', () => {
    const low = itemWeight({ level: 0, next: t, seen: 3, wrong: 0 }, t)
    const high = itemWeight({ level: 5, next: t, seen: 3, wrong: 0 }, t)
    expect(low).toBeGreaterThan(high)
  })

  it('자주 틀린 것일수록 높다', () => {
    const often = itemWeight({ level: 2, next: t, seen: 4, wrong: 4 }, t)
    const never = itemWeight({ level: 2, next: t, seen: 4, wrong: 0 }, t)
    expect(often).toBeGreaterThan(never)
  })

  it('복습일을 넘길수록 높다', () => {
    const overdue = itemWeight({ level: 2, next: '2026-07-01', seen: 4, wrong: 0 }, t)
    const fresh = itemWeight({ level: 2, next: t, seen: 4, wrong: 0 }, t)
    expect(overdue).toBeGreaterThan(fresh)
  })

  it('오늘 이미 틀린 건 낮춘다 (한 세션에서 연타 방지)', () => {
    const justWrong = itemWeight({ level: 1, next: t, seen: 2, wrong: 1, lastWrong: t }, t)
    const wrongBefore = itemWeight({ level: 1, next: t, seen: 2, wrong: 1, lastWrong: '2026-07-01' }, t)
    expect(justWrong).toBeLessThan(wrongBefore)
  })
})

describe('weightedSample', () => {
  it('약한 항목이 강한 항목보다 훨씬 자주 뽑힌다', () => {
    const weak = items[0]
    const strong = items[1]
    const s = state({
      [weak.id]: { level: 0, seen: 5, wrong: 5 },
      [strong.id]: { level: 5, seen: 9, wrong: 0, next: '2099-01-01' },
    })
    let weakHits = 0
    for (let i = 0; i < 300; i++) {
      const [picked] = weightedSample([weak, strong], s, 1, seededRng(i))
      if (picked.id === weak.id) weakHits++
    }
    expect(weakHits).toBeGreaterThan(200) // 압도적으로 약한 쪽
  })
})

// ── 채점 (B6) ────────────────────────────────────────────

describe('grade', () => {
  it('타이핑은 대소문자·공백·구두점을 무시한다', () => {
    const ex: Exercise = { kind: 'type', question: '', prompt: '', answer: 'I go to school', srsKeys: ['x'] }
    expect(grade(ex, 'igotoschool!').correct).toBe(true)
  })

  it('오타 한 글자는 맞은 걸로 넘기되 nearMiss로 표시한다', () => {
    const ex: Exercise = { kind: 'type', question: '', prompt: '', answer: 'school', srsKeys: ['x'] }
    const r = grade(ex, 'schook')
    expect(r.correct).toBe(true)
    expect(r.nearMiss).toBe(true)
  })

  it('짧은 답은 오타를 봐주지 않는다', () => {
    const ex: Exercise = { kind: 'type', question: '', prompt: '', answer: '가다', srsKeys: ['x'] }
    expect(grade(ex, '보다').correct).toBe(false)
  })

  it('조립은 순서가 완전히 같아야 한다', () => {
    const ex: Exercise = { kind: 'bank', question: '', prompt: '', tiles: [], answer: ['我', '去'], srsKeys: ['x'] }
    expect(grade(ex, ['我', '去']).correct).toBe(true)
    expect(grade(ex, ['去', '我']).correct).toBe(false)
  })

  it('편집 거리는 한도를 넘으면 일찍 끊는다', () => {
    expect(editDistance('abc', 'abd')).toBe(1)
    expect(editDistance('abc', 'xyz')).toBeGreaterThan(2)
  })

  it('normalize는 표기 차이를 지운다', () => {
    expect(normalize('你好。')).toBe(normalize('你好'))
  })
})

// ── 파이프라인 전체 ──────────────────────────────────────

describe('buildQuiz', () => {
  it('요청한 문항 수를 넘지 않는다 (B7 — 14개 하드코딩 제거)', () => {
    for (const count of [1, 5, 8, 30]) {
      const out = buildQuiz(books, { type: 'chapter', chapterId: C1 }, state(), opts({ count }))
      expect(out.length).toBeLessThanOrEqual(count)
      expect(out.length).toBeGreaterThan(0)
    }
  })

  it('모든 srsKey가 실재하는 항목 id다', () => {
    for (let seed = 0; seed < 30; seed++) {
      for (const ex of buildQuiz(books, { type: 'book', bookId: 'zh-t' }, state(), opts({ seed }))) {
        expect(ex.srsKeys.length).toBeGreaterThan(0)
        for (const k of ex.srsKeys) expect(validIds).toContain(k)
      }
    }
  })

  it('4지선다는 정답이 보기 안에 있고 보기가 중복되지 않는다', () => {
    for (let seed = 0; seed < 30; seed++) {
      for (const ex of buildQuiz(books, { type: 'book', bookId: 'zh-t' }, state(), opts({ seed }))) {
        if (ex.kind !== 'pick') continue
        expect(ex.options).toContain(ex.answer)
        expect(new Set(ex.options).size).toBe(ex.options.length)
        expect(ex.options.length).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('조립 문제의 정답 타일이 전부 제공된 타일 안에 있다', () => {
    for (let seed = 0; seed < 30; seed++) {
      for (const ex of buildQuiz(books, { type: 'book', bookId: 'zh-t' }, state(), opts({ seed }))) {
        if (ex.kind !== 'bank') continue
        const pool = [...ex.tiles]
        for (const t of ex.answer) {
          const i = pool.indexOf(t)
          expect(i, `타일 "${t}" 없음`).toBeGreaterThanOrEqual(0)
          pool.splice(i, 1)
        }
      }
    }
  })

  it('오디오가 없으면 듣기 문제를 절대 내지 않는다', () => {
    for (let seed = 0; seed < 30; seed++) {
      for (const ex of buildQuiz(books, { type: 'book', bookId: 'zh-t' }, state(), opts({ seed }))) {
        if (ex.kind === 'pick' || ex.kind === 'bank') expect(ex.audioOnly).toBeFalsy()
      }
    }
  })

  it('켠 유형만 출제한다', () => {
    const out = buildQuiz(books, { type: 'book', bookId: 'zh-t' }, state(), opts({ kinds: ['bank'], count: 10 }))
    expect(out.length).toBeGreaterThan(0)
    for (const ex of out) expect(ex.kind).toBe('bank')
  })

  it('같은 시드면 같은 퀴즈가 나온다', () => {
    const a = buildQuiz(books, { type: 'chapter', chapterId: C1 }, state(), opts({ seed: 42 }))
    const b = buildQuiz(books, { type: 'chapter', chapterId: C1 }, state(), opts({ seed: 42 }))
    expect(a).toEqual(b)
  })

  it('가중치를 켜면 약한 항목이 먼저 나온다 (B1)', () => {
    const weak = items.find((i) => i.text === '商店')!
    const s = state(
      Object.fromEntries(
        items.map((i) => [
          i.id,
          i.id === weak.id
            ? { level: 0, seen: 6, wrong: 6 }
            : { level: 5, seen: 9, wrong: 0, next: '2099-01-01' },
        ])
      )
    )
    let hits = 0
    for (let seed = 0; seed < 20; seed++) {
      const out = buildQuiz(books, { type: 'book', bookId: 'zh-t' }, s, opts({ seed, count: 3 }))
      if (out.some((ex) => ex.srsKeys.includes(weak.id))) hits++
    }
    expect(hits).toBeGreaterThan(14) // 20번 중 대부분
  })

  it('빈 범위에서는 빈 배열', () => {
    expect(buildQuiz(books, { type: 'chapter', chapterId: '없는챕터' }, state(), opts())).toEqual([])
  })

  it('한 항목이 한 세션에 3번 이상 나오지 않는다', () => {
    for (let seed = 0; seed < 20; seed++) {
      const out = buildQuiz(books, { type: 'section', sectionId: S1 }, state(), opts({ seed, count: 'all' }))
      const counts = new Map<string, number>()
      for (const ex of out) for (const k of ex.srsKeys) counts.set(k, (counts.get(k) ?? 0) + 1)
      for (const [id, n] of counts) expect(n, id).toBeLessThanOrEqual(2)
    }
  })

  it('모든 유형을 켜도 죽지 않는다', () => {
    expect(() =>
      buildQuiz(books, { type: 'book', bookId: 'zh-t' }, state(), opts({ kinds: [...ALL_KINDS], count: 'all' }))
    ).not.toThrow()
  })
})

describe('interleave', () => {
  it('같은 유형이 3연속으로 붙지 않게 재배치한다', () => {
    const mk = (kind: 'pick' | 'type'): Exercise =>
      kind === 'pick'
        ? { kind, question: '', prompt: '', answer: 'a', options: ['a'], srsKeys: ['x'] }
        : { kind, question: '', prompt: '', answer: 'a', srsKeys: ['x'] }
    const out = interleave([mk('pick'), mk('pick'), mk('pick'), mk('type'), mk('type')])
    for (let i = 2; i < out.length; i++) {
      expect(out[i].kind === out[i - 1].kind && out[i - 1].kind === out[i - 2].kind).toBe(false)
    }
  })

  it('항목을 잃거나 더하지 않는다', () => {
    const mk = (kind: 'pick' | 'type'): Exercise =>
      kind === 'pick'
        ? { kind, question: '', prompt: '', answer: 'a', options: ['a'], srsKeys: ['x'] }
        : { kind, question: '', prompt: '', answer: 'a', srsKeys: ['x'] }
    const input = [mk('pick'), mk('pick'), mk('type')]
    expect(interleave(input)).toHaveLength(3)
  })
})
