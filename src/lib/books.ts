// 책 관리 — 내장 책(JSON) + 사용자가 앱에서 만든/수정한 책(localStorage)
// 같은 id의 책을 저장하면 내장 책을 덮어씁니다(원본 파일은 그대로).
import { courses as builtinCourses } from '../data'
import type { Course, Unit } from '../types'

export const BOOKS_KEY = 'language-study-books-v1'
type CustomBooks = Record<string, Unit[]> // courseId → 책 목록

export function loadCustomBooks(): CustomBooks {
  try {
    return JSON.parse(localStorage.getItem(BOOKS_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveCustomBooks(b: CustomBooks) {
  localStorage.setItem(BOOKS_KEY, JSON.stringify(b))
}

/** 내장 책 + 사용자 책 합친 코스 */
export function getMergedCourse(courseId: string): Course {
  const base = builtinCourses.find((c) => c.id === courseId) ?? builtinCourses[0]
  const custom = loadCustomBooks()[base.id] ?? []
  // 같은 id는 사용자 버전이 우선(덮어쓰기), 새 책은 뒤에 추가
  const shadowed = base.units.map((u) => custom.find((c) => c.id === u.id) ?? u)
  const extras = custom.filter((c) => !base.units.some((u) => u.id === c.id))
  return { ...base, units: [...shadowed, ...extras] }
}

/** 내장 책인지 (내장이면 삭제 시 "되돌리기"가 됨) */
export function isBuiltinBook(courseId: string, bookId: string): boolean {
  const base = builtinCourses.find((c) => c.id === courseId)
  return !!base?.units.some((u) => u.id === bookId)
}

/** 사용자가 수정/생성한 책인지 */
export function isCustomBook(courseId: string, bookId: string): boolean {
  return (loadCustomBooks()[courseId] ?? []).some((u) => u.id === bookId)
}

export function upsertBook(courseId: string, book: Unit) {
  const all = loadCustomBooks()
  const list = all[courseId] ?? []
  const idx = list.findIndex((u) => u.id === book.id)
  if (idx >= 0) list[idx] = book
  else list.push(book)
  all[courseId] = list
  saveCustomBooks(all)
}

/** 사용자 버전 삭제 — 내장 책이면 원래 내용으로 돌아감 */
export function deleteCustomBook(courseId: string, bookId: string) {
  const all = loadCustomBooks()
  all[courseId] = (all[courseId] ?? []).filter((u) => u.id !== bookId)
  saveCustomBooks(all)
}

export function newBookId(courseId: string): string {
  return `${courseId}-book-${Date.now()}`
}

/** JSON 붙여넣기 검증 — 성공하면 Unit, 실패하면 에러 메시지 */
export function parseBookJson(raw: string): Unit | string {
  let data: any
  try {
    data = JSON.parse(raw)
  } catch {
    return 'JSON 형식이 아니에요. 중괄호 { } 전체를 붙여넣었는지 확인해 주세요.'
  }
  if (!data || typeof data !== 'object') return '책 객체가 아니에요.'
  if (!data.title) return '"title" (책 제목)이 필요해요.'
  if (!Array.isArray(data.lessons) || data.lessons.length === 0)
    return '"lessons" 배열에 챕터가 최소 1개 필요해요.'
  for (const [i, l] of data.lessons.entries()) {
    if (!l.title) return `${i + 1}번째 챕터에 "title"이 없어요.`
    // 신규 구조(sections) 또는 평면 구조(words/sentences) 모두 허용
    if (Array.isArray(l.sections)) {
      for (const sec of l.sections) {
        if (!Array.isArray(sec.passages)) sec.passages = []
        if (!Array.isArray(sec.words)) sec.words = []
        if (!Array.isArray(sec.grammar)) sec.grammar = []
        for (const w of sec.words)
          if (!w.text || !w.meaning) return `챕터 "${l.title}"의 새단어에 text/meaning이 빠졌어요.`
        for (const s of sec.passages)
          if (!s.text) return `챕터 "${l.title}"의 본문 문장에 text가 빠졌어요.` // meaning은 선택
        for (const g of sec.grammar) if (!Array.isArray(g.examples)) g.examples = []
      }
    } else {
      if (!Array.isArray(l.words)) l.words = []
      if (!Array.isArray(l.sentences)) l.sentences = []
      for (const w of l.words)
        if (!w.text || !w.meaning) return `챕터 "${l.title}"의 단어에 text/meaning이 빠졌어요.`
      for (const s of l.sentences)
        if (!s.text) return `챕터 "${l.title}"의 문장에 text가 빠졌어요.` // meaning은 선택
    }
  }
  return {
    id: typeof data.id === 'string' && data.id ? data.id : '',
    title: data.title,
    emoji: data.emoji || '📕',
    track: data.track === 'foundation' ? 'foundation' : data.track === 'vocab' ? 'vocab' : 'media',
    sourceType: data.sourceType,
    sourceTitle: data.sourceTitle,
    lessons: data.lessons,
  } as Unit
}
