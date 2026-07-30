// 진도 계산.
//
// **두 가지를 절대 하나로 합치지 않는다.**
//   숙달도(mastery)  퀴즈로 실제로 익힌 비율 — SRS 숙련도에서 계산
//   완료 표시(done)  내가 손으로 켠 체크 — 퀴즈를 안 풀어도 켤 수 있다
// 합쳐 버리면 "퀴즈 없이 완료 표시만 한 것"과 "정말 외운 것"을 구분할 수 없다.
//
// 그리고 셋째로 **입력 완성도(fill)** 가 있다. 교재를 얼마나 채워 넣었는지다.
// "나만의 교재가 완성돼 간다"는 피드백은 이 값과 빈 소단원 표시로 만든다.
//
// 진도는 저장하지 않고 볼 때마다 계산한다. 저장하면 항목을 추가·삭제할 때마다
// 갱신해야 하고 반드시 어긋난다.
import type { Lesson, Section, Unit } from '../types'
import type { AppState } from './storage'
import { chapterItems, bookItems, sectionItems } from './items'

/** 이 숙련도 이상이면 "익혔다"고 본다 (0~5 중 3 — 복습 간격 7일) */
export const MASTERED_LEVEL = 3

export interface Mastery {
  total: number
  mastered: number
  /** 0~1. 항목이 없으면 0 */
  ratio: number
}

function tally(ids: string[], state: AppState): Mastery {
  let mastered = 0
  for (const id of ids) {
    if ((state.srs[id]?.level ?? 0) >= MASTERED_LEVEL) mastered++
  }
  return { total: ids.length, mastered, ratio: ids.length > 0 ? mastered / ids.length : 0 }
}

export function sectionMastery(book: Unit, chapter: Lesson, section: Section, state: AppState): Mastery {
  return tally(sectionItems(book, chapter, section).map((i) => i.id), state)
}

/**
 * 챕터 숙달도.
 * 소단원 비율의 평균이 아니라 **항목을 통째로 센다** — 그래야 항목이 많은 소단원이
 * 그만큼 무겁게 반영된다(설계서가 말한 "아이템 수 가중 평균"과 같은 값).
 */
export function chapterMastery(book: Unit, chapter: Lesson, state: AppState): Mastery {
  return tally(chapterItems(book, chapter).map((i) => i.id), state)
}

export function bookMastery(book: Unit, state: AppState): Mastery {
  return tally(bookItems(book).map((i) => i.id), state)
}

// ── 입력 완성도 ──────────────────────────────────────────

/** 이 소단원에 내용이 들어 있는가 */
export function sectionHasContent(section: Section): boolean {
  return (
    section.words.length > 0 ||
    section.passages.length > 0 ||
    section.grammar.length > 0 ||
    !!section.passageText?.trim()
  )
}

export interface Fill {
  filled: number
  total: number
  ratio: number
}

/** 교재를 얼마나 채웠는지 — 내용이 있는 소단원 / 전체 소단원 */
export function bookFill(book: Unit): Fill {
  let filled = 0
  let total = 0
  for (const chapter of book.lessons) {
    for (const section of chapter.sections) {
      total++
      if (sectionHasContent(section)) filled++
    }
  }
  return { filled, total, ratio: total > 0 ? filled / total : 0 }
}

export function pct(ratio: number): number {
  return Math.round(ratio * 100)
}
