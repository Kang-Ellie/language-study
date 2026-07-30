import type { AppState, SrsEntry } from './storage'
import { today } from './storage'
import type { ItemId, StudyItem, Unit } from '../types'
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
 * 한 문제의 결과.
 *  correct  맞음 → 숙련도 +1
 *  near     오타 한 글자 / 재시도로 맞춤 → 맞은 걸로 넘기되 숙련도는 그대로
 *  wrong    틀림 → 숙련도를 절반으로
 */
export type Outcome = 'correct' | 'near' | 'wrong'

/**
 * 결과를 SRS에 반영. 키는 항목의 id다 — 텍스트를 고쳐도 이력이 유지된다.
 *
 * 오답 페널티: v1은 `level - 1` 이라 레벨 5를 틀려도 4(=14일 뒤)로만 내려갔다.
 * 한 번 틀린 건 그만큼 안 외운 것이므로 **절반으로** 떨어뜨린다 (5 → 2 → 1 → 0).
 */
export function updateSrs(
  srs: Record<ItemId, SrsEntry>,
  itemId: ItemId,
  outcome: Outcome
): Record<ItemId, SrsEntry> {
  const t = today()
  const cur = srs[itemId] ?? { level: 0, next: t, seen: 0, wrong: 0 }
  const level =
    outcome === 'correct'
      ? Math.min(cur.level + 1, 5)
      : outcome === 'near'
        ? cur.level
        : Math.max(0, Math.floor(cur.level / 2))

  const entry: SrsEntry = {
    level,
    next: addDays(outcome === 'wrong' ? 1 : INTERVALS[level]),
    seen: cur.seen + 1,
    wrong: cur.wrong + (outcome === 'wrong' ? 1 : 0),
    lastSeen: t,
  }
  if (outcome === 'wrong') entry.lastWrong = t
  else if (cur.lastWrong) entry.lastWrong = cur.lastWrong
  return { ...srs, [itemId]: entry }
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
 * 오늘 복습 대상 항목 — **단어와 문장 모두**.
 * v1의 dueWords()는 단어만 훑어서 문장은 아무리 틀려도 복습에 안 나왔다.
 */
export function dueItems(state: AppState, books: Unit[]): StudyItem[] {
  const t = today()
  return allItems(books).filter((it) => {
    const e = state.srs[it.id]
    return !!e && e.next <= t
  })
}
