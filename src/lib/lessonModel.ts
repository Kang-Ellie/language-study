// 챕터(Lesson)의 섹션/단어/문장 접근 헬퍼.
// 신규 구조(sections)와 기존 평면 구조(words/sentences)를 모두 흡수한다.
import type { Lesson, Section, Sentence, Word } from '../types'

export function emptySection(title = '본문'): Section {
  return { title, passages: [], words: [], grammar: [] }
}

/** 챕터의 섹션 목록 (평면 구조면 단일 섹션으로 감싸서 반환) */
export function lessonSections(lesson: Lesson): Section[] {
  if (lesson.sections && lesson.sections.length > 0) return lesson.sections
  return [
    {
      title: '본문',
      passages: lesson.sentences ?? [],
      words: lesson.words ?? [],
      grammar: [],
    },
  ]
}

/** 챕터의 모든 단어 (새단어) */
export function lessonWords(lesson: Lesson): Word[] {
  return lessonSections(lesson).flatMap((s) => s.words)
}

/** 챕터의 모든 문장 (본문 + 문법 예문) */
export function lessonSentences(lesson: Lesson): Sentence[] {
  return lessonSections(lesson).flatMap((s) => [
    ...s.passages,
    ...s.grammar.flatMap((g) => g.examples ?? []),
  ])
}

/** 이 챕터에 학습할 내용이 있는지 */
export function lessonHasContent(lesson: Lesson): boolean {
  return lessonWords(lesson).length > 0 || lessonSentences(lesson).length > 0
}
