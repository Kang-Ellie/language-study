import { describe, expect, it } from 'vitest'
import type { LogEntry } from './studyLog'
import {
  checkInStreak,
  checkedDates,
  dayChecks,
  missingFor,
  recentRate,
  todayCheck,
  type CheckInRule,
} from './checkin'

let n = 0
function entry(date: string, opts: { rec?: boolean; writ?: boolean } = {}): LogEntry {
  return {
    id: `e${n++}`,
    date,
    writing: opts.writ ? '오늘 쓴 문장' : undefined,
    audioFiles: opts.rec ? ['a.webm'] : [],
    imageFiles: [],
  }
}

const T = '2026-08-06'

describe('dayChecks', () => {
  it('기록이 없는 날은 아예 들어가지 않는다', () => {
    expect(dayChecks([], 'either').size).toBe(0)
  })

  it('같은 날 여러 기록을 합쳐서 본다', () => {
    // 아침에 녹음만, 저녁에 쓰기만 올려도 그날은 둘 다 한 것
    const checks = dayChecks([entry(T, { rec: true }), entry(T, { writ: true })], 'both')
    const c = checks.get(T)!
    expect(c.entries).toBe(2)
    expect(c.hasRecording).toBe(true)
    expect(c.hasWriting).toBe(true)
    expect(c.done).toBe(true)
  })

  it('사진·메모만 남긴 날은 인증이 아니다', () => {
    const photoOnly: LogEntry = { id: 'x', date: T, note: '메모', audioFiles: [], imageFiles: ['p.jpg'] }
    expect(dayChecks([photoOnly], 'either').get(T)!.done).toBe(false)
  })

  it('공백만 있는 쓰기는 쓰기로 안 친다', () => {
    const blank: LogEntry = { id: 'x', date: T, writing: '   ', audioFiles: [], imageFiles: [] }
    expect(dayChecks([blank], 'either').get(T)!.hasWriting).toBe(false)
  })
})

describe('규칙별 판정', () => {
  const cases: { rule: CheckInRule; rec: boolean; writ: boolean; done: boolean }[] = [
    { rule: 'either', rec: true, writ: false, done: true },
    { rule: 'either', rec: false, writ: true, done: true },
    { rule: 'either', rec: false, writ: false, done: false },
    { rule: 'recording', rec: true, writ: false, done: true },
    { rule: 'recording', rec: false, writ: true, done: false },
    { rule: 'both', rec: true, writ: true, done: true },
    { rule: 'both', rec: true, writ: false, done: false },
  ]
  for (const c of cases) {
    it(`${c.rule}: 녹음=${c.rec} 쓰기=${c.writ} → ${c.done ? '완료' : '미완'}`, () => {
      expect(todayCheck([entry(T, { rec: c.rec, writ: c.writ })], c.rule, T).done).toBe(c.done)
    })
  }
})

describe('checkInStreak', () => {
  it('연속으로 인증한 날을 센다', () => {
    const e = [entry('2026-08-06', { rec: true }), entry('2026-08-05', { rec: true }), entry('2026-08-04', { rec: true })]
    expect(checkInStreak(e, 'either', T)).toBe(3)
  })

  it('하루 비면 거기서 끊긴다', () => {
    const e = [entry('2026-08-06', { rec: true }), entry('2026-08-04', { rec: true })] // 8/5 없음
    expect(checkInStreak(e, 'either', T)).toBe(1)
  })

  it('오늘 아직 안 했어도 어제까지 이어졌으면 살아 있다', () => {
    // 아침에 열었을 때 "0일"이 떠서 의욕이 꺾이는 걸 막는다
    const e = [entry('2026-08-05', { rec: true }), entry('2026-08-04', { rec: true })]
    expect(checkInStreak(e, 'either', T)).toBe(2)
  })

  it('어제도 오늘도 없으면 0', () => {
    expect(checkInStreak([entry('2026-08-03', { rec: true })], 'either', T)).toBe(0)
  })

  it('규칙을 못 채운 날은 이어지지 않는다', () => {
    // 8/5에 쓰기만 했는데 규칙이 '녹음 필수'라면 그날은 인증이 아니다
    const e = [entry('2026-08-06', { rec: true }), entry('2026-08-05', { writ: true })]
    expect(checkInStreak(e, 'recording', T)).toBe(1)
    expect(checkInStreak(e, 'either', T)).toBe(2)
  })

  it('기록이 없으면 0', () => {
    expect(checkInStreak([], 'either', T)).toBe(0)
  })
})

describe('checkedDates', () => {
  it('인증한 날만 모은다', () => {
    const e = [entry('2026-08-06', { rec: true }), entry('2026-08-05', { writ: true })]
    expect([...checkedDates(e, 'recording')]).toEqual(['2026-08-06'])
    expect([...checkedDates(e, 'either')].sort()).toEqual(['2026-08-05', '2026-08-06'])
  })
})

describe('recentRate', () => {
  it('최근 N일 중 며칠 했는지', () => {
    const e = [entry('2026-08-06', { rec: true }), entry('2026-08-04', { rec: true }), entry('2026-08-02', { rec: true })]
    expect(recentRate(e, 'either', 7, T)).toEqual({ done: 3, days: 7 })
  })

  it('창 밖의 기록은 안 센다', () => {
    const e = [entry('2026-07-01', { rec: true })]
    expect(recentRate(e, 'either', 7, T).done).toBe(0)
  })
})

describe('missingFor', () => {
  const none = { date: T, hasRecording: false, hasWriting: false, done: false, entries: 0 }

  it('아무것도 안 했으면 무엇이 필요한지 알려준다', () => {
    expect(missingFor('either', none)).toEqual(['🎙 녹음 또는 ✍️ 쓰기'])
    expect(missingFor('recording', none)).toEqual(['🎙 녹음'])
    expect(missingFor('both', none)).toEqual(['🎙 녹음', '✍️ 쓰기'])
  })

  it('반만 했으면 남은 것만 알려준다', () => {
    expect(missingFor('both', { ...none, hasRecording: true })).toEqual(['✍️ 쓰기'])
  })

  it('다 했으면 비어 있다', () => {
    expect(missingFor('either', { ...none, hasRecording: true, done: true })).toEqual([])
  })
})
