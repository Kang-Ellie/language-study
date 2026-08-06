// 일일 스터디 인증.
//
// "매일 뭔가 증거를 남기면 오늘 완료" — 카톡 스터디에서 매일 녹음을 올리던 그 규칙이다.
//
// **인증은 저장하지 않고 학습 기록에서 계산한다.** 진도(progress.ts)와 같은 원칙 —
// 따로 저장하면 기록을 지웠을 때 인증만 남는 식으로 반드시 어긋난다.
//
// 기존 XP 스트릭과는 다른 것이다.
//   XP 스트릭   퀴즈를 풀어 XP를 얻은 날 (혼자 하는 게임 요소)
//   인증 스트릭 녹음·쓰기 같은 **증거**를 남긴 날 (스터디에 내놓는 것)
// 스터디에서 "했다"고 인정받는 건 뒤쪽이다.
import type { LogEntry } from './studyLog'
import { today, ymd } from './storage'

/** 무엇을 해야 인증으로 치는가 */
export type CheckInRule = 'either' | 'recording' | 'both'

export const RULE_LABEL: Record<CheckInRule, string> = {
  either: '녹음 또는 쓰기',
  recording: '녹음 필수',
  both: '녹음 + 쓰기 둘 다',
}

export interface DayCheck {
  date: string // yyyy-mm-dd
  hasRecording: boolean
  hasWriting: boolean
  done: boolean
  /** 그날 남긴 기록 수 */
  entries: number
}

function satisfies(rule: CheckInRule, rec: boolean, writ: boolean): boolean {
  if (rule === 'recording') return rec
  if (rule === 'both') return rec && writ
  return rec || writ
}

/** 날짜별 인증 현황. 기록이 하나도 없는 날은 아예 들어가지 않는다. */
export function dayChecks(entries: LogEntry[], rule: CheckInRule): Map<string, DayCheck> {
  const byDate = new Map<string, DayCheck>()
  for (const e of entries) {
    if (!e.date) continue
    const cur = byDate.get(e.date) ?? {
      date: e.date,
      hasRecording: false,
      hasWriting: false,
      done: false,
      entries: 0,
    }
    cur.entries++
    if (e.audioFiles.length > 0) cur.hasRecording = true
    if (e.writing?.trim()) cur.hasWriting = true
    cur.done = satisfies(rule, cur.hasRecording, cur.hasWriting)
    byDate.set(e.date, cur)
  }
  return byDate
}

/** 오늘 인증했나 */
export function todayCheck(entries: LogEntry[], rule: CheckInRule, date = today()): DayCheck {
  return (
    dayChecks(entries, rule).get(date) ?? {
      date,
      hasRecording: false,
      hasWriting: false,
      done: false,
      entries: 0,
    }
  )
}

function prevDay(date: string): string {
  const d = new Date(date)
  d.setDate(d.getDate() - 1)
  return ymd(d)
}

/**
 * 연속 인증 일수.
 *
 * 오늘 아직 안 했어도 **어제까지 이어졌으면 스트릭은 살아 있다** — 아침에 앱을 열었을 때
 * "0일"이 떠서 의욕이 꺾이는 걸 막는다. 오늘까지 놓치면 그때 끊긴다.
 */
export function checkInStreak(entries: LogEntry[], rule: CheckInRule, date = today()): number {
  const checks = dayChecks(entries, rule)
  const doneOn = (d: string) => checks.get(d)?.done === true

  let cursor = doneOn(date) ? date : prevDay(date)
  let n = 0
  while (doneOn(cursor)) {
    n++
    cursor = prevDay(cursor)
  }
  return n
}

/** 인증한 날 전체 (달력 표시용) */
export function checkedDates(entries: LogEntry[], rule: CheckInRule): Set<string> {
  const out = new Set<string>()
  for (const [date, c] of dayChecks(entries, rule)) if (c.done) out.add(date)
  return out
}

/** 최근 N일 중 며칠 인증했나 (스터디 현황 요약용) */
export function recentRate(
  entries: LogEntry[],
  rule: CheckInRule,
  days: number,
  date = today()
): { done: number; days: number } {
  const checks = dayChecks(entries, rule)
  let done = 0
  let cursor = date
  for (let i = 0; i < days; i++) {
    if (checks.get(cursor)?.done) done++
    cursor = prevDay(cursor)
  }
  return { done, days }
}

/** 오늘 인증까지 뭐가 남았는지 — 화면에 그대로 띄운다 */
export function missingFor(rule: CheckInRule, check: DayCheck): string[] {
  const missing: string[] = []
  if (rule === 'recording' && !check.hasRecording) missing.push('🎙 녹음')
  if (rule === 'both') {
    if (!check.hasRecording) missing.push('🎙 녹음')
    if (!check.hasWriting) missing.push('✍️ 쓰기')
  }
  if (rule === 'either' && !check.done) missing.push('🎙 녹음 또는 ✍️ 쓰기')
  return missing
}
