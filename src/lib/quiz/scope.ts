// 범위 → 출제 가능한 항목 수집.
import type { Unit } from '../../types'
import type { AppState } from '../storage'
import { today } from '../storage'
import { allItems, quizable } from '../items'
import { hasAudio } from './tokenize'
import type { QuizItem, QuizKind, QuizScope } from './types'

function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime()
  return Math.floor(ms / 86400000)
}

/**
 * 범위 안의 출제 가능 항목을 모은다.
 *
 * 제외 규칙:
 *  - 원문 또는 뜻이 비어 있음 (quizable)
 *  - 같은 텍스트 중복 (앞의 것 우선, quizable)
 *  - 'review'/'wrong' 범위는 SRS 기록이 있는 것만
 */
export function collectItems(books: Unit[], scope: QuizScope, state: AppState): QuizItem[] {
  const all = quizable(allItems(books))
  const t = today()

  switch (scope.type) {
    case 'section':
      return all.filter((i) => i.sectionId === scope.sectionId)
    case 'chapter':
      return all.filter((i) => i.chapterId === scope.chapterId)
    case 'book':
      return all.filter((i) => i.bookId === scope.bookId)
    case 'review':
      return all.filter((i) => {
        const e = state.srs[i.id]
        return !!e && e.next <= t
      })
    case 'wrong':
      return all.filter((i) => {
        const e = state.srs[i.id]
        return !!e?.lastWrong && daysBetween(e.lastWrong, t) <= scope.days
      })
  }
}

/**
 * 유형별로 실제 몇 문항을 낼 수 있는지.
 * 퀴즈 시작 화면이 이 숫자를 미리 보여준다 — 듣기를 켰는데 오디오가 3개뿐이면
 * 시작 전에 알아야 한다.
 */
export function countAvailable(items: QuizItem[], audioOk: Set<string>): Record<QuizKind, number> {
  const words = items.filter((i) => i.type === 'word')
  const sentences = items.filter((i) => i.type === 'sentence')
  const audible = items.filter((i) => hasAudio(i, audioOk))
  // 조립·빈칸은 토큰이 2개 이상이어야 문제가 된다. 여기서는 대략치로 글자 수를 본다
  // (정확한 분절은 tokenize가 하지만, 미리보기 숫자를 위해 전체를 분절할 필요는 없다).
  const assemblable = sentences.filter((i) => (i.tokens?.length ?? i.text.length) >= 2)

  return {
    pick: items.length,
    // 짝 맞추기는 한 번에 단어 5개를 소비한다
    match: words.length >= 3 ? Math.max(1, Math.floor(words.length / 5)) : 0,
    bank: assemblable.length,
    fill: sentences.filter((i) => (i.tokens?.length ?? i.text.length) >= 3).length,
    type: items.length,
    listen: audible.length,
  }
}
