// 저장 구조(Word / Sentence / Grammar.examples)를 퀴즈용 통합 뷰(StudyItem)로 투영한다.
//
// 왜 저장 구조 자체를 합치지 않는가:
//  - 화면은 새단어 표 / 본문 문장 / 문법 예문을 서로 다르게 그린다. 하나로 합치면
//    UI가 매번 type으로 걸러야 해서 오히려 코드가 는다.
//  - 편집·JSON 저작 포맷(README에 문서화된)이 words / passages / grammar 로 갈려 있다.
//    저장 구조를 바꾸면 그 포맷도 따라 바뀌고, 사용자가 쓰던 JSON이 깨진다.
// 반대로 퀴즈는 "범위 안의 출제 가능한 것 전부"를 한 줄로 세워야 한다. 그래서
// 수집 시점에만 합친다. 엔진 코드는 StudyItem 한 벌만 알면 된다.
import type { Lesson, Section, StudyItem, Unit } from '../types'

interface Ctx {
  lang: string
  bookId: string
  chapterId: string
  sectionId: string
  sectionKind?: Section['kind']
}

function ctxOf(book: Unit, chapter: Lesson, section: Section): Ctx {
  return {
    lang: book.lang,
    bookId: book.id,
    chapterId: chapter.id,
    sectionId: section.id,
    sectionKind: section.kind,
  }
}

/** 한 소단원의 항목 (새단어 → 본문 문장 → 문법 예문 순서) */
export function sectionItems(book: Unit, chapter: Lesson, section: Section): StudyItem[] {
  const ctx = ctxOf(book, chapter, section)
  const out: StudyItem[] = []

  for (const w of section.words) {
    out.push({
      ...ctx,
      id: w.id,
      type: 'word',
      text: w.text,
      reading: w.reading,
      meaning: w.meaning,
      audio: w.audio,
      pos: w.pos,
      quizEnabled: w.quizEnabled !== false,
    })
  }
  const sentences = [...section.passages, ...section.grammar.flatMap((g) => g.examples)]
  for (const s of sentences) {
    out.push({
      ...ctx,
      id: s.id,
      type: 'sentence',
      text: s.text,
      reading: s.reading,
      meaning: s.meaning,
      audio: s.audio,
      tokens: s.tokens,
      quizEnabled: s.quizEnabled !== false,
    })
  }
  return out
}

export function chapterItems(book: Unit, chapter: Lesson): StudyItem[] {
  return chapter.sections.flatMap((s) => sectionItems(book, chapter, s))
}

export function bookItems(book: Unit): StudyItem[] {
  return book.lessons.flatMap((c) => chapterItems(book, c))
}

export function allItems(books: Unit[]): StudyItem[] {
  return books.flatMap(bookItems)
}

/**
 * 출제 가능한 항목만 남긴다.
 *  - quizEnabled === false (고유명사 등 사용자가 끈 것)
 *  - 원문 또는 뜻이 비어 있는 것
 *  - 같은 텍스트가 여러 번 나오면 앞의 것만 (같은 문제가 두 번 나오는 것 방지)
 */
export function quizable(items: StudyItem[]): StudyItem[] {
  const seen = new Set<string>()
  const out: StudyItem[] = []
  for (const it of items) {
    if (it.quizEnabled === false) continue
    if (!it.text.trim() || !it.meaning.trim()) continue
    const key = `${it.type}:${it.text}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(it)
  }
  return out
}

/** id → 항목. SRS 결과를 항목으로 되돌릴 때 쓴다. */
export function itemIndex(items: StudyItem[]): Map<string, StudyItem> {
  return new Map(items.map((it) => [it.id, it]))
}
