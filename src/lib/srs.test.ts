import { describe, expect, it } from 'vitest'
import type { Unit } from '../types'
import { normalizeBook } from './normalize'
import { defaults, today, type SrsEntry } from './storage'
import { dueItems, learnedCount, updateSrs } from './srs'

const book: Unit = normalizeBook(
  {
    id: 'zh-t',
    lang: 'zh',
    title: 't',
    lessons: [
      {
        title: '1과',
        words: [
          { text: '去', meaning: '가다' },
          { text: '吃', meaning: '먹다' },
        ],
        sentences: [{ text: '我去。', meaning: '나는 가요' }],
      },
    ],
  },
  'zh-t'
)

const W1 = 'zh-t/c1/s1/w1'
const P1 = 'zh-t/c1/s1/p1'

const entry = (over: Partial<SrsEntry> = {}): SrsEntry => ({
  level: 0,
  next: '2020-01-01',
  seen: 0,
  wrong: 0,
  ...over,
})

describe('updateSrs', () => {
  it('맞으면 숙련도가 오른다', () => {
    const out = updateSrs({ [W1]: entry({ level: 2 }) }, W1, 'correct')
    expect(out[W1].level).toBe(3)
    expect(out[W1].seen).toBe(1)
    expect(out[W1].wrong).toBe(0)
    expect(out[W1].lastSeen).toBe(today())
  })

  it('숙련도는 5를 넘지 않는다', () => {
    expect(updateSrs({ [W1]: entry({ level: 5 }) }, W1, 'correct')[W1].level).toBe(5)
  })

  it('틀리면 숙련도가 절반으로 떨어진다 (v1은 -1이라 너무 관대했다)', () => {
    // level 5를 한 번 틀렸는데 4(=14일 뒤)로만 내려가면 실제 망각과 안 맞는다
    expect(updateSrs({ [W1]: entry({ level: 5 }) }, W1, 'wrong')[W1].level).toBe(2)
    expect(updateSrs({ [W1]: entry({ level: 2 }) }, W1, 'wrong')[W1].level).toBe(1)
    expect(updateSrs({ [W1]: entry({ level: 1 }) }, W1, 'wrong')[W1].level).toBe(0)
    expect(updateSrs({ [W1]: entry({ level: 0 }) }, W1, 'wrong')[W1].level).toBe(0)
  })

  it('틀리면 내일 다시 나온다', () => {
    expect(updateSrs({ [W1]: entry({ level: 5 }) }, W1, 'wrong')[W1].next).not.toBe(today())
    expect(updateSrs({}, W1, 'wrong')[W1].wrong).toBe(1)
  })

  it("'거의 맞음'은 숙련도를 올리지도 내리지도 않는다", () => {
    // 오타 한 글자, 또는 재시도로 맞춘 경우
    const out = updateSrs({ [W1]: entry({ level: 3 }) }, W1, 'near')
    expect(out[W1].level).toBe(3)
    expect(out[W1].wrong).toBe(0)
    expect(out[W1].seen).toBe(1)
  })

  it('오답 날짜를 남기고, 이후 정답에도 기록이 유지된다', () => {
    let srs = updateSrs({}, W1, 'wrong')
    expect(srs[W1].lastWrong).toBe(today())
    srs = updateSrs(srs, W1, 'correct')
    expect(srs[W1].lastWrong).toBe(today()) // 틀렸던 이력은 가중치 계산에 계속 쓰인다
  })

  it('처음 보는 항목도 그냥 만들어진다', () => {
    expect(updateSrs({}, '새id', 'correct')['새id'].level).toBe(1)
  })
})

describe('dueItems', () => {
  it('만기된 단어와 문장을 모두 돌려준다', () => {
    const s = {
      ...defaults(),
      srs: { [W1]: entry({ next: '2020-01-01' }), [P1]: entry({ next: '2020-01-01' }) },
    }
    const due = dueItems(s, [book])
    expect(due.map((i) => i.id).sort()).toEqual([P1, W1])
    expect(due.some((i) => i.type === 'sentence')).toBe(true)
  })

  it('아직 안 된 것은 빼고, 기록 없는 것도 뺀다', () => {
    const s = { ...defaults(), srs: { [W1]: entry({ next: '2099-01-01' }) } }
    expect(dueItems(s, [book])).toHaveLength(0)
  })
})

describe('learnedCount', () => {
  it('책에 실제로 있는 항목만 센다', () => {
    const s = { ...defaults(), srs: { [W1]: entry(), '없는id': entry() } }
    expect(learnedCount(s, [book])).toBe(1)
  })
})
