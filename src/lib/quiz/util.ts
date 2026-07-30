import type { QuizItem } from './types'

/** 파일이 실제로 있는 오디오만 인정한다 (없는 mp3로 듣기 문제를 내지 않기 위해) */
export function hasAudio(item: QuizItem, audioOk: Set<string>): boolean {
  return !!item.audio && audioOk.has(item.audio)
}

/** 뜻(한국어)을 어절 단위로 — '우리말 뜻 조립' 문제의 타일 */
export function koTokens(meaning: string): string[] {
  return meaning
    .replace(/[.?!]/g, '')
    .split(' ')
    .filter(Boolean)
}
