// 채점.
import type { Exercise } from '../../types'

/** 타이핑 채점용 정규화 — 대소문자·공백·구두점 무시 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s.,!?。！？、·'’"”-]/g, '')
    .trim()
}

/** 편집 거리. 오타 한 글자를 봐주기 위한 것이라 2를 넘으면 계산을 멈춘다. */
export function editDistance(a: string, b: string, limit = 2): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      rowMin = Math.min(rowMin, cur[j])
    }
    if (rowMin > limit) return limit + 1
    prev = cur
  }
  return prev[b.length]
}

export interface GradeResult {
  correct: boolean
  /** 오타 한 글자 차이 — 정답으로 넘겨주되 숙련도는 올리지 않는다 */
  nearMiss: boolean
}

export function grade(ex: Exercise, input: string | string[]): GradeResult {
  if (ex.kind === 'pick') {
    return { correct: input === ex.answer, nearMiss: false }
  }
  if (ex.kind === 'bank') {
    const chosen = Array.isArray(input) ? input : [input]
    return { correct: chosen.join('') === ex.answer.join(''), nearMiss: false }
  }
  if (ex.kind === 'type') {
    const typed = normalize(Array.isArray(input) ? input.join('') : input)
    const answer = normalize(ex.answer)
    if (typed === answer) return { correct: true, nearMiss: false }
    // 한 글자 오타는 맞은 걸로 쳐준다 (단, 너무 짧은 답은 제외 — '가'와 '나'가 오타일 리 없다)
    if (answer.length >= 4 && editDistance(typed, answer) === 1) {
      return { correct: true, nearMiss: true }
    }
    return { correct: false, nearMiss: false }
  }
  return { correct: true, nearMiss: false } // match는 화면에서 스스로 판정한다
}
