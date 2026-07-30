// 책·챕터의 항목 접근 헬퍼.
// 퀴즈는 이 파일이 아니라 items.ts의 StudyItem 투영을 쓴다. 여기 남은 건
// 화면이 직접 필요로 하는 것(오디오 존재 확인)과 통계용뿐이다.
import type { Lesson, Section, Sentence, Unit, Word } from '../types'

/** 소단원의 모든 문장 (본문 문장 + 문법 예문) */
export function sectionSentences(section: Section): Sentence[] {
  return [...section.passages, ...section.grammar.flatMap((g) => g.examples)]
}

/** 책의 모든 단어 — 학습한 단어 수 집계용 */
export function bookWords(book: Unit): Word[] {
  return book.lessons.flatMap((l) => l.sections.flatMap((s) => s.words))
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
