// SRS 가중 샘플링 — "정답률이 낮거나 최근 틀린 것을 자주 낸다".
//
// v1에서는 이 가중치가 별도 '복습' 모드에만 있었고, 챕터 퀴즈는 shuffle() 무작위였다.
// 그래서 간격 반복이 주 학습 경로에는 사실상 없었다. 이제 모든 범위가 이걸 통과한다.
import type { AppState, SrsEntry } from '../storage'
import { today } from '../storage'
import { weightedPick, type Rng } from './random'
import type { QuizItem } from './types'

function daysBetween(a: string, b: string): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

/**
 * 항목 하나의 출제 가중치.
 *
 *   1                              기본
 * + 2.0 × (1 − level/5)            숙련도가 낮을수록
 * + 3.0 × wrong/(seen+1)           자주 틀릴수록
 * + min(연체일/7, 2.0)              복습일을 넘길수록
 * + 1.5                            아직 한 번도 안 본 것
 * × 0.3                            오늘 이미 틀린 것 (한 세션에서 연타 방지)
 */
export function itemWeight(entry: SrsEntry | undefined, t = today()): number {
  if (!entry) return 1 + 2.0 + 1.5 // 신규: 최저 숙련도 + 신규 가산

  let w = 1
  w += 2.0 * (1 - Math.min(entry.level, 5) / 5)
  w += 3.0 * (entry.wrong / (entry.seen + 1))

  const overdue = daysBetween(entry.next, t)
  if (overdue > 0) w += Math.min(overdue / 7, 2.0)

  if (entry.seen === 0) w += 1.5
  if (entry.lastWrong === t) w *= 0.3

  return w
}

/** 가중치 순으로 n개 비복원 추출 */
export function weightedSample(items: QuizItem[], state: AppState, n: number, rng: Rng): QuizItem[] {
  const t = today()
  const weights = items.map((i) => itemWeight(state.srs[i.id], t))
  return weightedPick(items, weights, n, rng)
}
