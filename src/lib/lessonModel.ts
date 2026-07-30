// 챕터·책의 단어/문장 접근 헬퍼.
// 정규화(normalize.ts)를 거친 데이터만 들어오므로 하위호환 분기가 없다.
import type { Lesson, Section, Sentence, Unit, Word } from '../types'

/** 소단원의 모든 문장 (본문 문장 + 문법 예문) */
export function sectionSentences(section: Section): Sentence[] {
  return [...section.passages, ...section.grammar.flatMap((g) => g.examples)]
}

/** 챕터의 모든 단어 (새단어) */
export function lessonWords(lesson: Lesson): Word[] {
  return lesson.sections.flatMap((s) => s.words)
}

/** 챕터의 모든 문장 (본문 + 문법 예문) */
export function lessonSentences(lesson: Lesson): Sentence[] {
  return lesson.sections.flatMap(sectionSentences)
}

/** 이 챕터에 학습할 내용이 있는지 */
export function lessonHasContent(lesson: Lesson): boolean {
  return lesson.sections.some(
    (s) => s.words.length > 0 || s.passages.length > 0 || s.grammar.length > 0 || !!s.passageText
  )
}

/** 책의 모든 단어 */
export function bookWords(book: Unit): Word[] {
  return book.lessons.flatMap(lessonWords)
}

/** 책의 모든 문장 */
export function bookSentences(book: Unit): Sentence[] {
  return book.lessons.flatMap(lessonSentences)
}

/** 소단원 안에서 오디오 파일명을 갖는 항목 전부 (존재 확인용) */
export function sectionAudioFiles(section: Section): string[] {
  const files: string[] = []
  if (section.passageAudio) files.push(section.passageAudio)
  for (const x of [...section.words, ...sectionSentences(section)]) if (x.audio) files.push(x.audio)
  return files
}

/** 챕터 전체의 오디오 파일명 */
export function lessonAudioFiles(lesson: Lesson): string[] {
  return lesson.sections.flatMap(sectionAudioFiles)
}

/** 책 전체의 오디오 파일명 */
export function bookAudioFiles(book: Unit): string[] {
  return book.lessons.flatMap(lessonAudioFiles)
}
