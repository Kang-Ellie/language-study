// 책 관리 — 내장 책(JSON) + 사용자가 앱에서 만든/수정한 책(localStorage)
// 같은 id의 책을 저장하면 내장 책을 덮어씁니다(원본 파일은 그대로).
//
// 저장 구조는 **평평한 배열**이다. 예전에는 `Record<언어, 책[]>` 이었는데,
// 이제 책이 자기 `lang`을 갖고 있어서 언어별로 나눠 담을 이유가 없다.
// 언어 필터가 필요하면 booksOfLang()으로 걸러 쓴다.
//
// 저장소에서 읽어 들이는 모든 책은 normalizeBook()을 통과한다. 그래서 이 모듈 밖으로
// 나가는 Unit은 항상 id가 완비된 정규 스키마다.
import { builtinBooks } from '../data'
import type { Unit } from '../types'
import { normalizeBook, type RawUnit } from './normalize'

export const BOOKS_KEY = 'language-study-books-v1'

export function loadCustomBooks(): Unit[] {
  try {
    const raw = JSON.parse(localStorage.getItem(BOOKS_KEY) || '[]') as RawUnit[]
    if (!Array.isArray(raw)) return []
    return raw.map((u, i) => normalizeBook(u, u.id || `book-${i}`))
  } catch {
    return []
  }
}

function saveCustomBooks(list: Unit[]) {
  localStorage.setItem(BOOKS_KEY, JSON.stringify(list))
}

/** 내장 책 + 사용자 책. 같은 id는 사용자 버전이 우선(덮어쓰기), 새 책은 뒤에 추가 */
export function getAllBooks(): Unit[] {
  const custom = loadCustomBooks()
  const shadowed = builtinBooks.map((u) => custom.find((c) => c.id === u.id) ?? u)
  const extras = custom.filter((c) => !builtinBooks.some((u) => u.id === c.id))
  return [...shadowed, ...extras]
}

/** 이 언어의 책만 */
export function booksOfLang(books: Unit[], lang: string): Unit[] {
  return books.filter((b) => b.lang === lang)
}

/** 책이 실제로 존재하는 언어 목록 (책장 탭 구성용) */
export function langsWithBooks(books: Unit[]): string[] {
  const out: string[] = []
  for (const b of books) if (!out.includes(b.lang)) out.push(b.lang)
  return out
}

/** 내장 책인지 (내장이면 삭제 시 "되돌리기"가 됨) */
export function isBuiltinBook(bookId: string): boolean {
  return builtinBooks.some((u) => u.id === bookId)
}

/** 사용자가 수정/생성한 책인지 */
export function isCustomBook(bookId: string): boolean {
  return loadCustomBooks().some((u) => u.id === bookId)
}

export function upsertBook(book: Unit) {
  const list = loadCustomBooks()
  const normalized = normalizeBook({ ...book, updatedAt: new Date().toISOString() }, book.id)
  const idx = list.findIndex((u) => u.id === normalized.id)
  if (idx >= 0) list[idx] = normalized
  else list.push(normalized)
  saveCustomBooks(list)
}

/** 사용자 버전 삭제 — 내장 책이면 원래 내용으로 돌아감 */
export function deleteCustomBook(bookId: string) {
  saveCustomBooks(loadCustomBooks().filter((u) => u.id !== bookId))
}

export function newBookId(lang: string): string {
  return `${lang}-book-${Date.now()}`
}

/**
 * JSON 붙여넣기 검증 — 성공하면 정규화된 Unit, 실패하면 에러 메시지.
 * id·lang은 없어도 된다 (normalizeBook과 fallback이 채운다).
 */
export function parseBookJson(raw: string, fallbackId: string, fallbackLang: string): Unit | string {
  let data: RawUnit
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
    // 신규 구조(sections)와 평면 구조(words/sentences) 모두 받는다 — normalizeBook이 통일한다
    const sections =
      Array.isArray(l.sections) && l.sections.length > 0
        ? l.sections
        : [{ words: l.words ?? [], passages: l.sentences ?? [], grammar: [] }]
    for (const sec of sections) {
      for (const w of sec.words ?? [])
        if (!w.text || !w.meaning) return `챕터 "${l.title}"의 새단어에 text/meaning이 빠졌어요.`
      for (const s of sec.passages ?? [])
        if (!s.text) return `챕터 "${l.title}"의 본문 문장에 text가 빠졌어요.` // meaning은 선택
      for (const g of sec.grammar ?? [])
        for (const e of g.examples ?? [])
          if (!e.text) return `챕터 "${l.title}"의 문법 예문에 text가 빠졌어요.`
    }
  }
  return normalizeBook({ lang: fallbackLang, ...data }, fallbackId)
}
