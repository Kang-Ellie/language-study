import type { AppState, SrsEntry } from './storage'
import { today } from './storage'
import type { ItemId, StudyItem, Unit, Word } from '../types'
import { bookWords } from './lessonModel'
import { allItems } from './items'

// 간격 반복: 숙련도별 다음 복습까지의 일수
const INTERVALS = [0, 1, 3, 7, 14, 30]

function addDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 정답/오답 결과를 SRS에 반영.
 * 키는 항목의 id다 — 단어 텍스트를 고쳐도 숙련도 이력이 유지된다.
 */
export function updateSrs(
  srs: Record<ItemId, SrsEntry>,
  itemId: ItemId,
  correct: boolean
): Record<ItemId, SrsEntry> {
  const t = today()
  const cur = srs[itemId] ?? { level: 0, next: t, seen: 0, wrong: 0 }
  const level = correct ? Math.min(cur.level + 1, 5) : Math.max(cur.level - 1, 0)
  const entry: SrsEntry = {
    level,
    next: addDays(correct ? INTERVALS[level] : 1),
    seen: cur.seen + 1,
    wrong: cur.wrong + (correct ? 0 : 1),
    lastSeen: t,
  }
  if (correct) {
    if (cur.lastWrong) entry.lastWrong = cur.lastWrong
  } else {
    entry.lastWrong = t
  }
  return { ...srs, [itemId]: entry }
}

/** 오늘 복습해야 할 단어 목록 (주어진 책들 안에서) */
export function dueWords(state: AppState, books: Unit[]): Word[] {
  const t = today()
  const due: Word[] = []
  for (const book of books) {
    for (const w of bookWords(book)) {
      const e = state.srs[w.id]
      if (e && e.next <= t && !due.some((d) => d.text === w.text)) due.push(w)
    }
  }
  // 약한 단어(레벨 낮고 많이 틀린 것) 우선
  due.sort((a, b) => {
    const ea = state.srs[a.id]!
    const eb = state.srs[b.id]!
    return ea.level - eb.level || eb.wrong - ea.wrong
  })
  return due
}

/** 학습한(1회 이상 본) 단어 수 — 주어진 책에 실제로 존재하는 것만 센다 */
export function learnedCount(state: AppState, books: Unit[]): number {
  let n = 0
  const seen = new Set<string>()
  for (const book of books) {
    for (const w of bookWords(book)) {
      if (seen.has(w.id)) continue
      seen.add(w.id)
      if (state.srs[w.id]) n++
    }
  }
  return n
}

/**
 * 오늘 복습 대상 항목 (단어 + 문장). 4단계 퀴즈 엔진이 'review' 범위로 쓴다.
 * 지금 복습 세션은 아직 단어만 출제하므로 dueWords()와 별개로 둔다.
 */
export function dueItems(state: AppState, books: Unit[]): StudyItem[] {
  const t = today()
  return allItems(books).filter((it) => {
    const e = state.srs[it.id]
    return !!e && e.next <= t
  })
}
