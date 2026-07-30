import type { AppState, SrsEntry } from './storage'
import { today } from './storage'
import type { Course, Word } from '../types'
import { lessonWords } from './lessonModel'

// 간격 반복: 숙련도별 다음 복습까지의 일수
const INTERVALS = [0, 1, 3, 7, 14, 30]

export function srsKey(courseId: string, text: string): string {
  return `${courseId}|${text}`
}

function addDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 정답/오답 결과를 SRS에 반영 */
export function updateSrs(srs: Record<string, SrsEntry>, key: string, correct: boolean): Record<string, SrsEntry> {
  const cur = srs[key] ?? { level: 0, next: today(), seen: 0, wrong: 0 }
  const level = correct ? Math.min(cur.level + 1, 5) : Math.max(cur.level - 1, 0)
  return {
    ...srs,
    [key]: {
      level,
      next: addDays(correct ? INTERVALS[level] : 1),
      seen: cur.seen + 1,
      wrong: cur.wrong + (correct ? 0 : 1),
    },
  }
}

/** 오늘 복습해야 할 단어 목록 (현재 코스) */
export function dueWords(state: AppState, course: Course): Word[] {
  const t = today()
  const due: Word[] = []
  for (const unit of course.units) {
    for (const lesson of unit.lessons) {
      for (const w of lessonWords(lesson)) {
        const e = state.srs[srsKey(course.id, w.text)]
        if (e && e.next <= t && !due.some((d) => d.text === w.text)) due.push(w)
      }
    }
  }
  // 약한 단어(틀린 횟수 많고 레벨 낮은 것) 우선
  due.sort((a, b) => {
    const ea = state.srs[srsKey(course.id, a.text)]
    const eb = state.srs[srsKey(course.id, b.text)]
    return ea.level - eb.level || eb.wrong - ea.wrong
  })
  return due
}

/** 학습한(1회 이상 본) 단어 수 */
export function learnedCount(state: AppState, courseId: string): number {
  return Object.keys(state.srs).filter((k) => k.startsWith(courseId + '|')).length
}
