// 문장을 단어 뱅크 타일로 쪼갠다.
//
// v1은 띄어쓰기 없는 중국어·일본어를 **글자 단위**로 쪼갰다.
//   我是韩国人 → [我, 是, 韩, 国, 人]
// 이러면 문제가 아니라 노가다가 된다. 정답은 [我, 是, 韩国人] 이다.
//
// 그래서 **교재에 등록된 새단어 목록으로 최장일치 분절**을 한다.
// 교재를 채울수록 분절이 저절로 좋아진다 — "내 교재를 완성할수록 퀴즈가 좋아진다"는
// 이 앱의 컨셉과 그대로 맞물린다.
import type { QuizItem } from './types'

const PUNCT = /[。！？、．，,.!?…；;：:"'“”‘’()（）\s]/g

export interface Tokenized {
  tiles: string[]
  /** 타일을 다시 이어 붙일 때 쓰는 구분자. 중국어·일본어는 '', 영어는 ' ' */
  joiner: string
}

/** 어절 사이를 띄어 쓰는 언어인가 (영어처럼) */
function isSpaced(text: string): boolean {
  return /\s/.test(text.trim())
}

/**
 * 최장일치 분절.
 * 매 위치에서 vocab 중 가장 긴 것을 먹는다. 못 먹으면 한 글자 넘어간다.
 * vocab은 길이 내림차순으로 정렬돼 들어와야 한다.
 */
export function longestMatch(text: string, vocab: string[]): string[] {
  const tiles: string[] = []
  let i = 0
  let buffer = ''

  while (i < text.length) {
    const hit = vocab.find((v) => v.length > 0 && text.startsWith(v, i))
    if (hit) {
      if (buffer) {
        tiles.push(buffer)
        buffer = ''
      }
      tiles.push(hit)
      i += hit.length
    } else {
      // 사전에 없는 글자는 뒤에 등록 단어가 나올 때까지 한 덩어리로 모은다.
      // 한 글자씩 흩뿌리면 타일이 폭발한다.
      buffer += text[i]
      i += 1
    }
  }
  if (buffer) tiles.push(buffer)
  return tiles
}

/**
 * 문장 → 타일.
 * 우선순위:
 *  1. item.tokens — 사용자가 직접 지정한 분절이 가장 정확하다
 *  2. 공백 (영어 등)
 *  3. 범위 안 새단어로 최장일치
 *  4. 글자 단위 (최후)
 */
export function tokenize(item: QuizItem, vocab: string[]): Tokenized {
  if (item.tokens && item.tokens.length > 0) {
    return { tiles: item.tokens.filter(Boolean), joiner: isSpaced(item.text) ? ' ' : '' }
  }

  if (isSpaced(item.text)) {
    const tiles = item.text
      .split(/\s+/)
      .map((t) => t.replace(PUNCT, ''))
      .filter(Boolean)
    return { tiles, joiner: ' ' }
  }

  const clean = item.text.replace(PUNCT, '')
  if (vocab.length > 0) {
    const tiles = longestMatch(clean, vocab)
    if (tiles.length > 0) return { tiles, joiner: '' }
  }
  return { tiles: [...clean], joiner: '' }
}

/** 분절 사전. 범위 안 단어를 길이 내림차순으로 (최장일치가 요구하는 순서) */
export function buildVocab(items: QuizItem[]): string[] {
  const set = new Set<string>()
  for (const i of items) if (i.type === 'word' && i.text.trim()) set.add(i.text.trim())
  return [...set].sort((a, b) => b.length - a.length)
}

export { hasAudio } from './util'
