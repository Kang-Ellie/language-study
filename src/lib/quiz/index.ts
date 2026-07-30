// 퀴즈 생성 진입점.
//
//   collectItems()   범위 안의 출제 가능 항목
//   → weightedSample()  SRS 가중치로 N개 (약한 것 위주)
//   → assignKinds()     항목별 출제 유형 (숙련도가 오를수록 어려운 쪽)
//   → buildOne()        유형별 문제 생성
//   → interleave()      같은 유형 연속 방지
//
// v1의 buildLessonExercises는 "단어 4개 → 짝맞추기 → 역방향 2개 → 문장 전부 → …"를
// 하드코딩한 대본이었다. 가중치를 끼워 넣을 자리도, 범위를 바꿀 자리도 없었다.
import type { Exercise, Unit } from '../../types'
import type { AppState } from '../storage'
import { allItems, quizable } from '../items'
import { buildOne, buildMatch, candidateKinds, type BuildCtx } from './builders'
import { koTokens } from './util'
import { makeRng, shuffle, type Rng } from './random'
import { collectItems } from './scope'
import { buildVocab, tokenize } from './tokenize'
import { weightedSample } from './weight'
import type { QuizItem, QuizOptions, QuizScope } from './types'

export * from './types'
export { collectItems, countAvailable } from './scope'
export { grade, normalize, editDistance } from './grade'
export { itemWeight, weightedSample } from './weight'
export { tokenize, longestMatch, buildVocab } from './tokenize'
export { buildDistractors, distractorScore } from './distractor'
export { hasAudio } from './util'

/** 보기·타일을 뽑아 올 후보 풀. 범위가 좁으면 같은 언어의 다른 책까지 넓힌다. */
function buildPool(books: Unit[], scoped: QuizItem[]): QuizItem[] {
  if (scoped.length >= 12) return scoped
  const langs = new Set(scoped.map((i) => i.lang))
  const wider = quizable(allItems(books)).filter((i) => langs.size === 0 || langs.has(i.lang))
  const seen = new Set(scoped.map((i) => i.id))
  return [...scoped, ...wider.filter((i) => !seen.has(i.id))]
}

function makeCtx(books: Unit[], scoped: QuizItem[], state: AppState, opts: QuizOptions, rng: Rng): BuildCtx {
  const pool = buildPool(books, scoped)
  const vocab = buildVocab(pool)
  const tilePool = new Set<string>()
  const koPool = new Set<string>()
  for (const item of pool) {
    if (item.type !== 'sentence') continue
    for (const t of tokenize(item, vocab).tiles) tilePool.add(t)
    for (const t of koTokens(item.meaning)) koPool.add(t)
  }
  for (const item of pool) if (item.type === 'word') tilePool.add(item.text)

  return { pool, vocab, tilePool: [...tilePool], koPool: [...koPool], audioOk: opts.audioOk, state, rng }
}

/** 같은 유형이 3개 연속으로 나오지 않게 자리를 바꾼다 */
export function interleave(list: Exercise[]): Exercise[] {
  const out: Exercise[] = []
  const rest = [...list]
  while (rest.length > 0) {
    const lastTwo = out.slice(-2)
    const monotone = lastTwo.length === 2 && lastTwo[0].kind === lastTwo[1].kind
    let idx = 0
    if (monotone) {
      const different = rest.findIndex((e) => e.kind !== lastTwo[1].kind)
      if (different >= 0) idx = different
    }
    out.push(rest[idx])
    rest.splice(idx, 1)
  }
  return out
}

/**
 * 범위 + 옵션 → 문제 목록.
 * 만들 수 있는 문제가 요청 수보다 적으면 적은 대로 돌려준다 (억지로 채우지 않는다).
 */
export function buildQuiz(books: Unit[], scope: QuizScope, state: AppState, opts: QuizOptions): Exercise[] {
  const rng = makeRng(opts.seed)
  const scoped = collectItems(books, scope, state)
  if (scoped.length === 0) return []

  const kinds = new Set(opts.kinds)
  const ctx = makeCtx(books, scoped, state, opts, rng)

  const want = opts.count === 'all' ? scoped.length : Math.max(1, opts.count)
  // 만들다 실패하는 유형이 있으므로 넉넉히 뽑아 둔다
  const sampled = opts.useSrsWeight
    ? weightedSample(scoped, state, Math.min(scoped.length, want * 2), rng)
    : shuffle(scoped, rng).slice(0, Math.min(scoped.length, want * 2))

  const out: Exercise[] = []
  const usedFor = new Map<string, number>() // itemId → 출제 횟수
  let matchRuns = 0
  const matchPool: QuizItem[] = []

  for (const item of sampled) {
    if (out.length >= want) break
    if ((usedFor.get(item.id) ?? 0) >= 2) continue

    const lvl = state.srs[item.id]?.level ?? 0
    const audible = !!item.audio && opts.audioOk.has(item.audio)
    const allowed = candidateKinds(item, lvl, audible).filter((k) => kinds.has(k))

    let made: Exercise | null = null
    for (const kind of allowed) {
      if (kind === 'match') {
        // 짝 맞추기는 단어 5개를 한 번에 소비한다. 세션당 2회까지.
        if (matchRuns >= 2 || item.type !== 'word') continue
        matchPool.push(item)
        if (matchPool.length >= 5) {
          made = buildMatch(matchPool.splice(0, 5))
          if (made) matchRuns++
        }
        if (made) break
        continue
      }
      made = buildOne(item, kind, ctx)
      if (made) break
    }

    if (!made) continue
    out.push(made)
    for (const key of made.srsKeys) usedFor.set(key, (usedFor.get(key) ?? 0) + 1)
  }

  return interleave(out).slice(0, want)
}
