// 오답 보기 생성.
//
// v1은 풀에서 무작위 3개를 뽑았다. 그래서 "가다 / 컴퓨터 / 3월 / 예쁘다" 같은 보기가 나오고,
// 정답률만 부풀고 난이도가 없었다. 좋은 오답은 **그럴듯하되 확실히 틀린 것**이다.
import { shuffle, type Rng } from './random'
import type { QuizItem } from './types'

/** 정답과 얼마나 헷갈릴 만한가 — 높을수록 좋은 오답 */
export function distractorScore(answer: QuizItem, cand: QuizItem, field: 'meaning' | 'text'): number {
  const a = answer[field]
  const c = cand[field]
  let score = 0

  if (cand.sectionId === answer.sectionId) score += 3
  else if (cand.chapterId === answer.chapterId) score += 2

  if (Math.abs(c.length - a.length) <= 1) score += 2
  if (answer.pos && cand.pos && answer.pos === cand.pos) score += 2
  if (answer.reading && cand.reading && answer.reading[0] === cand.reading[0]) score += 1

  // 뜻이 겹치면 오답으로 못 쓴다 — 사용자가 "이것도 맞잖아" 하게 된다
  if (a.includes(c) || c.includes(a)) score -= 5

  return score
}

/**
 * 오답 보기 n개.
 * 점수 상위에서 뽑되, 같은 점수끼리는 섞어서 매번 같은 보기만 나오지 않게 한다.
 * 후보가 모자라면 점수를 무시하고 채운다 (문제를 못 내는 것보다는 낫다).
 */
export function buildDistractors(
  answer: QuizItem,
  pool: QuizItem[],
  field: 'meaning' | 'text',
  n: number,
  rng: Rng
): string[] {
  const target = answer[field]
  const seen = new Set<string>([target])
  const scored: { text: string; score: number }[] = []

  for (const cand of pool) {
    if (cand.id === answer.id) continue
    const text = cand[field]
    if (!text.trim() || seen.has(text)) continue
    seen.add(text)
    scored.push({ text, score: distractorScore(answer, cand, field) })
  }

  // 점수 내림차순, 동점은 무작위
  const shuffled = shuffle(scored, rng)
  shuffled.sort((a, b) => b.score - a.score)
  return shuffled.slice(0, n).map((s) => s.text)
}

/**
 * 조립 문제의 방해 타일.
 * 정답 타일에 없는 것 중에서, 길이가 비슷한 것을 우선한다 —
 * 한 글자짜리 타일만 잔뜩 섞이면 정답 타일이 눈에 띄어 버린다.
 */
export function buildTileDistractors(answer: string[], pool: string[], n: number, rng: Rng): string[] {
  const inAnswer = new Set(answer)
  const avgLen = answer.reduce((s, t) => s + t.length, 0) / Math.max(1, answer.length)
  const cands = [...new Set(pool)].filter((t) => t.trim() && !inAnswer.has(t))

  const shuffled = shuffle(cands, rng)
  shuffled.sort((a, b) => Math.abs(a.length - avgLen) - Math.abs(b.length - avgLen))
  return shuffled.slice(0, n)
}
