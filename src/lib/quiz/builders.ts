// 항목 하나 + 유형 → 문제 하나.
//
// 만들 수 없으면 null을 돌려준다 (토큰이 모자란 문장, 오디오 없는 듣기 등).
// 호출자가 다음 유형으로 넘어간다.
import type { Exercise } from '../../types'
import type { AppState } from '../storage'
import { buildDistractors, buildTileDistractors } from './distractor'
import { shuffle, type Rng } from './random'
import { tokenize } from './tokenize'
import type { QuizItem, QuizKind } from './types'
import { hasAudio, koTokens } from './util'

export interface BuildCtx {
  /** 오답·타일을 뽑아 올 후보 (같은 범위, 모자라면 같은 언어의 다른 책까지) */
  pool: QuizItem[]
  /** 최장일치 분절 사전 (길이 내림차순) */
  vocab: string[]
  /** 조립 문제 방해 타일 풀 */
  tilePool: string[]
  koPool: string[]
  audioOk: Set<string>
  state: AppState
  rng: Rng
}

function level(ctx: BuildCtx, item: QuizItem): number {
  return ctx.state.srs[item.id]?.level ?? 0
}

function options(answer: string, distractors: string[], rng: Rng): string[] {
  return shuffle([answer, ...distractors], rng)
}

// ── 4지선다 ──────────────────────────────────────────────

/** 숙련도가 낮으면 "원문 → 뜻"(인식), 오르면 "뜻 → 원문"(재생) */
function buildPick(item: QuizItem, ctx: BuildCtx): Exercise | null {
  const reverse = level(ctx, item) >= 2
  if (reverse) {
    const distractors = buildDistractors(item, ctx.pool, 'text', 3, ctx.rng)
    if (distractors.length < 2) return null
    return {
      kind: 'pick',
      question: `"${item.meaning}" 은(는) 어떤 ${item.type === 'word' ? '단어' : '문장'}일까요?`,
      prompt: item.meaning,
      options: options(item.text, distractors, ctx.rng),
      answer: item.text,
      srsKeys: [item.id],
    }
  }
  const distractors = buildDistractors(item, ctx.pool, 'meaning', 3, ctx.rng)
  if (distractors.length < 2) return null
  return {
    kind: 'pick',
    question: '알맞은 뜻을 고르세요',
    prompt: item.text,
    promptReading: item.reading,
    promptAudio: hasAudio(item, ctx.audioOk) ? item.audio : undefined,
    options: options(item.meaning, distractors, ctx.rng),
    answer: item.meaning,
    srsKeys: [item.id],
  }
}

// ── 짝 맞추기 (단어 여러 개를 한 번에) ───────────────────

export function buildMatch(items: QuizItem[], ctx: BuildCtx): Exercise | null {
  const words = items.filter((i) => i.type === 'word')
  if (words.length < 3) return null
  const chosen = words.slice(0, 5)
  return {
    kind: 'match',
    question: '짝을 맞춰 보세요',
    pairs: chosen.map((w) => ({ a: w.text, b: w.meaning })),
    srsKeys: chosen.map((w) => w.id),
  }
}

// ── 문장 조립 ────────────────────────────────────────────

function buildBank(item: QuizItem, ctx: BuildCtx, audioOnly = false): Exercise | null {
  if (item.type !== 'sentence') return null
  if (audioOnly && !hasAudio(item, ctx.audioOk)) return null

  const { tiles } = tokenize(item, ctx.vocab)
  if (tiles.length < 2) return null

  // 숙련도가 오르면 반대 방향(원문 → 우리말 조립)도 낸다
  const toKorean = !audioOnly && level(ctx, item) >= 2
  if (toKorean) {
    const ko = koTokens(item.meaning)
    if (ko.length < 2) return null
    return {
      kind: 'bank',
      question: '우리말 뜻을 조립하세요',
      prompt: item.text,
      promptReading: item.reading,
      promptAudio: hasAudio(item, ctx.audioOk) ? item.audio : undefined,
      tiles: shuffle([...ko, ...buildTileDistractors(ko, ctx.koPool, 3, ctx.rng)], ctx.rng),
      answer: ko,
      srsKeys: [item.id],
    }
  }

  const extras = buildTileDistractors(tiles, ctx.tilePool, Math.min(3, Math.max(0, 8 - tiles.length)), ctx.rng)
  return {
    kind: 'bank',
    question: audioOnly ? '🔊 잘 듣고 문장을 조립하세요' : '단어를 조립해 문장을 완성하세요',
    prompt: audioOnly ? item.text : item.meaning,
    promptAudio: audioOnly ? item.audio : undefined,
    audioOnly: audioOnly || undefined,
    tiles: shuffle([...tiles, ...extras], ctx.rng),
    answer: tiles,
    srsKeys: [item.id],
  }
}

// ── 빈칸 채우기 ──────────────────────────────────────────

/**
 * 빈칸 대상 토큰 고르기:
 *  1. 교재의 새단어로 등록된 토큰 (교재가 지정한 핵심 어휘)
 *  2. 그중 숙련도가 가장 낮은 것
 *  3. 없으면 가장 긴 토큰
 * 첫·마지막 토큰은 피한다 — 문맥 단서가 한쪽뿐이라 난이도가 튄다.
 */
function buildFill(item: QuizItem, ctx: BuildCtx): Exercise | null {
  if (item.type !== 'sentence') return null
  const { tiles, joiner } = tokenize(item, ctx.vocab)
  if (tiles.length < 3) return null

  const inner = tiles.slice(1, -1)
  const vocabSet = new Set(ctx.vocab)
  const known = inner.filter((t) => vocabSet.has(t))
  const candidates = known.length > 0 ? known : inner

  const target = [...candidates].sort((a, b) => {
    const la = ctx.pool.find((p) => p.text === a)
    const lb = ctx.pool.find((p) => p.text === b)
    const sa = la ? (ctx.state.srs[la.id]?.level ?? 0) : 9
    const sb = lb ? (ctx.state.srs[lb.id]?.level ?? 0) : 9
    return sa - sb || b.length - a.length
  })[0]
  if (!target) return null

  const blanked = tiles.map((t) => (t === target ? '＿＿' : t)).join(joiner || ' ')
  const distractors = buildTileDistractors([target], ctx.tilePool, 3, ctx.rng)
  if (distractors.length < 2) return null

  return {
    kind: 'pick',
    question: '빈칸에 들어갈 말을 고르세요',
    prompt: `${blanked}\n(${item.meaning})`,
    options: options(target, distractors, ctx.rng),
    answer: target,
    srsKeys: [item.id],
  }
}

// ── 타이핑 ───────────────────────────────────────────────

function buildType(item: QuizItem, ctx: BuildCtx): Exercise | null {
  // 로마자로 입력할 수 있는 언어는 원문을 쓰게 하고, 그 외는 뜻을 쓰게 한다.
  // (중국어·일본어 원문 타이핑은 IME가 필요해서 학습이 아니라 입력 씨름이 된다)
  const typableSource = item.lang === 'en'
  if (typableSource) {
    return {
      kind: 'type',
      question: `"${item.meaning}" 을(를) ${item.type === 'word' ? '영어로' : '영어 문장으로'} 써 보세요`,
      prompt: item.meaning,
      answer: item.text,
      srsKeys: [item.id],
    }
  }
  return {
    kind: 'type',
    question: `이 ${item.type === 'word' ? '단어' : '문장'}의 뜻을 우리말로 써 보세요`,
    prompt: item.text,
    promptReading: item.reading,
    answer: item.meaning,
    srsKeys: [item.id],
  }
}

// ── 듣기 ─────────────────────────────────────────────────

function buildListen(item: QuizItem, ctx: BuildCtx): Exercise | null {
  if (!hasAudio(item, ctx.audioOk)) return null

  if (item.type === 'sentence') {
    return buildBank(item, ctx, true) // 듣고 조립
  }
  const distractors = buildDistractors(item, ctx.pool, 'text', 3, ctx.rng)
  if (distractors.length < 2) return null
  return {
    kind: 'pick',
    question: '🔊 잘 듣고 알맞은 단어를 고르세요',
    prompt: item.text,
    promptAudio: item.audio,
    audioOnly: true,
    options: options(item.text, distractors, ctx.rng),
    answer: item.text,
    srsKeys: [item.id],
  }
}

// ── 디스패치 ─────────────────────────────────────────────

export function buildOne(item: QuizItem, kind: QuizKind, ctx: BuildCtx): Exercise | null {
  switch (kind) {
    case 'pick':
      return buildPick(item, ctx)
    case 'bank':
      return buildBank(item, ctx)
    case 'fill':
      return buildFill(item, ctx)
    case 'type':
      return buildType(item, ctx)
    case 'listen':
      return buildListen(item, ctx)
    case 'match':
      return null // 여러 항목을 한꺼번에 쓰므로 buildMatch로 따로 처리
  }
}

/**
 * 항목 하나에 낼 수 있는 유형을, 숙련도가 오를수록 어려운 쪽으로.
 * 인식(고르기) → 재생(조립·빈칸) → 산출(타이핑)
 */
export function candidateKinds(item: QuizItem, lvl: number, audible: boolean): QuizKind[] {
  const out: QuizKind[] = []
  if (audible) out.push('listen')

  if (item.type === 'word') {
    if (lvl <= 1) out.push('pick', 'match')
    else if (lvl <= 3) out.push('pick', 'match', 'type')
    else out.push('type', 'pick')
  } else {
    if (lvl <= 1) out.push('bank', 'pick')
    else if (lvl <= 3) out.push('bank', 'fill', 'pick')
    else out.push('type', 'fill', 'bank')
  }
  return out
}
