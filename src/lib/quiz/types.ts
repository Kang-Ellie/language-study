import type { StudyItem } from '../../types'

/**
 * 퀴즈 범위. 화면에서 고르는 "어디까지 낼까".
 * StudyItem이 bookId/chapterId/sectionId를 싣고 있어서 필터 한 번이면 끝난다.
 */
export type QuizScope =
  | { type: 'section'; sectionId: string }
  | { type: 'chapter'; chapterId: string }
  | { type: 'book'; bookId: string }
  | { type: 'review' } // 오늘 복습할 것 (SRS 만기)
  | { type: 'wrong'; days: number } // 최근 N일 안에 틀린 것

/**
 * 문제 유형. 사용자가 켜고 끌 수 있는 단위와 같다.
 *  pick   4지선다 (원문↔뜻, 방향은 숙련도로 결정)
 *  match  짝 맞추기 (단어 전용, 한 번에 5개 소비)
 *  bank   문장 조립 (문장 전용)
 *  fill   빈칸 채우기 (문장 전용)
 *  type   직접 타이핑
 *  listen 듣기 (오디오가 실제로 있는 항목만)
 */
export type QuizKind = 'pick' | 'match' | 'bank' | 'fill' | 'type' | 'listen'

export const ALL_KINDS: QuizKind[] = ['pick', 'match', 'bank', 'fill', 'type', 'listen']

export interface QuizOptions {
  /** 문항 수. 'all'이면 만들 수 있는 만큼 */
  count: number | 'all'
  kinds: QuizKind[]
  /** 약한 항목에 가중치를 줄지. 교재 전체 범위에서는 항상 켜진다 */
  useSrsWeight: boolean
  /** 실제로 파일이 있는 오디오 파일명 — 없는 오디오로 듣기 문제를 내지 않기 위해 */
  audioOk: Set<string>
  /** 재현 가능한 세션 (테스트·"같은 퀴즈 다시") */
  seed?: number
}

export function defaultOptions(scope: QuizScope, audioOk: Set<string>): QuizOptions {
  // 범위가 넓을수록 기본 문항 수가 는다. 교재 전체는 가중 샘플링을 강제한다 —
  // 300개 중 20개를 균등 무작위로 뽑으면 "매번 새 문제만 나오고 아무것도 안 외워진다"가 된다.
  const count = scope.type === 'section' ? 10 : scope.type === 'book' ? 20 : 15
  return {
    count,
    kinds: [...ALL_KINDS],
    useSrsWeight: true,
    audioOk,
  }
}

/** 퀴즈 엔진이 다루는 항목. 저장 구조가 아니라 투영 뷰(types.ts의 StudyItem)를 쓴다. */
export type QuizItem = StudyItem
