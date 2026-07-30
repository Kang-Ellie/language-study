// 저장된 데이터의 스키마 마이그레이션.
//
// 버전을 하나씩 올리는 체인이다. 저장된 schemaVersion부터 시작해 필요한 단계만 순서대로
// 적용한다. 각 단계는 그 앞 단계의 결과를 입력으로 받으므로, 몇 버전을 건너뛴 오래된
// 데이터도 한 번에 최신까지 올라온다.
//
//   v1 → v2  배열 인덱스·텍스트 참조를 항목 id 참조로
//              - 학습 기록 키: `${courseId}|${bookId}|${lessonIdx}` → chapterId
//              - 진도:        completed[bookId]=개수 → progress[chapterId]=플래그
//              - SRS 키:      `${courseId}|${단어텍스트}` → 항목 id
//   v2 → v3  언어(Course) 계층 폐기
//              - 내 책 저장: Record<언어, 책[]> → 책[] (각 책이 lang을 가짐)
//              - 상태:      courseId → lang
//
// 되돌릴 수 없으므로 **첫 변환 전 원본 3개 키를 통째로 스냅샷**해 둔다(텍스트라 용량 부담 없음).
// IndexedDB의 녹음·사진은 마이그레이션이 건드리지 않는다.
import type { Unit } from '../types'
import { langOf, normalizeBook, type RawUnit } from './normalize'
import { BOOKS_KEY } from './books'
import { LOG_KEY } from './studyLog'
import { SCHEMA_VERSION, STATE_KEY, type ChapterProgress, type SrsEntry } from './storage'

export const BACKUP_SUFFIX = '-pre-v2'

export interface MigrationReport {
  ran: boolean
  from: number
  to: number
  booksNormalized: number
  srsMatched: number
  srsDropped: number
  chaptersMarkedDone: number
  logsRekeyed: number
  logsDropped: number
  notes: string[]
}

function emptyReport(): MigrationReport {
  return {
    ran: false,
    from: SCHEMA_VERSION,
    to: SCHEMA_VERSION,
    booksNormalized: 0,
    srsMatched: 0,
    srsDropped: 0,
    chaptersMarkedDone: 0,
    logsRekeyed: 0,
    logsDropped: 0,
    notes: [],
  }
}

/** 마이그레이션이 읽고 쓰는 저장소 전체. 단계 함수는 이 객체를 제자리에서 고친다. */
interface Store {
  state: Record<string, unknown> | null
  books: unknown
  logs: Record<string, unknown[]> | null
}

function readJson<T>(key: string): T | null {
  const raw = localStorage.getItem(key)
  if (raw === null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/** v1 학습 기록 키: `${courseId}|${bookId}|${lessonIdx}` */
function parseLogKey(key: string): { courseId: string; bookId: string; lessonIdx: number } | null {
  const parts = key.split('|')
  if (parts.length !== 3) return null
  const lessonIdx = Number(parts[2])
  if (!Number.isInteger(lessonIdx) || lessonIdx < 0) return null
  return { courseId: parts[0], bookId: parts[1], lessonIdx }
}

/** v1 SRS 키: `${courseId}|${단어텍스트}` */
function parseSrsKey(key: string): { courseId: string; text: string } | null {
  const i = key.indexOf('|')
  if (i <= 0) return null
  return { courseId: key.slice(0, i), text: key.slice(i + 1) }
}

// ── v1 → v2 ─────────────────────────────────────────────

function stepV1toV2(store: Store, builtin: Unit[], report: MigrationReport) {
  // v2 시점의 내 책 저장 구조는 Record<언어, 책[]> 였다
  const customByLang = (store.books ?? {}) as Record<string, RawUnit[]>
  const normalizedByLang: Record<string, Unit[]> = {}
  const allBooks: Unit[] = [...builtin]

  for (const [lang, raws] of Object.entries(customByLang)) {
    if (!Array.isArray(raws)) continue
    const list = raws.map((raw, i) => normalizeBook({ lang, ...raw }, raw.id || `${lang}-book-migrated-${i}`))
    normalizedByLang[lang] = list
    report.booksNormalized += list.length
    for (const book of list) {
      const at = allBooks.findIndex((b) => b.id === book.id)
      if (at >= 0) allBooks[at] = book // 내 책이 내장 책을 덮어쓴다
      else allBooks.push(book)
    }
  }
  if (store.books !== null) store.books = normalizedByLang

  // 언어별 "단어 텍스트 → 항목 id" 색인. 같은 텍스트가 여럿이면 첫 번째만 쓴다.
  const wordIndex = new Map<string, string>() // `${lang}|${text}`
  const chapterIndex = new Map<string, string>() // `${lang}|${bookId}|${idx}` → chapterId
  const chaptersOf = new Map<string, string[]>() // bookId → chapterId[]

  for (const book of allBooks) {
    const ids: string[] = []
    book.lessons.forEach((lesson, li) => {
      ids.push(lesson.id)
      chapterIndex.set(`${book.lang}|${book.id}|${li}`, lesson.id)
      for (const section of lesson.sections) {
        for (const w of section.words) {
          const key = `${book.lang}|${w.text}`
          if (w.text && !wordIndex.has(key)) wordIndex.set(key, w.id)
        }
      }
    })
    chaptersOf.set(book.id, ids)
  }

  // 상태: SRS 키 재작성 + completed 전개
  if (store.state !== null) {
    const oldSrs = (store.state.srs ?? {}) as Record<string, SrsEntry>
    const newSrs: Record<string, SrsEntry> = {}
    for (const [key, entry] of Object.entries(oldSrs)) {
      const parsed = parseSrsKey(key)
      const itemId = parsed ? wordIndex.get(`${parsed.courseId}|${parsed.text}`) : undefined
      if (itemId && !newSrs[itemId]) {
        newSrs[itemId] = entry
        report.srsMatched++
      } else {
        report.srsDropped++
      }
    }
    if (report.srsDropped > 0) {
      report.notes.push(
        `단어 ${report.srsDropped}개는 지금 책에서 찾지 못해 숙련도를 이어붙이지 못했어요 (레벨 0부터 다시 시작).`
      )
    }

    const progress: Record<string, ChapterProgress> = {
      ...((store.state.progress ?? {}) as Record<string, ChapterProgress>),
    }
    const completed = (store.state.completed ?? {}) as Record<string, number>
    for (const [bookId, doneCount] of Object.entries(completed)) {
      const ids = chaptersOf.get(bookId)
      if (!ids) continue
      for (let i = 0; i < Math.min(doneCount, ids.length); i++) {
        if (!progress[ids[i]]?.markedDone) {
          progress[ids[i]] = { ...progress[ids[i]], markedDone: true }
          report.chaptersMarkedDone++
        }
      }
    }
    store.state.srs = newSrs
    store.state.progress = progress
    delete store.state.completed
  }

  // 학습 기록: 키를 챕터 id로
  if (store.logs !== null) {
    const rekeyed: Record<string, unknown[]> = {}
    for (const [key, entries] of Object.entries(store.logs)) {
      if (!Array.isArray(entries) || entries.length === 0) continue
      const parsed = parseLogKey(key)
      const chapterId = parsed ? chapterIndex.get(key) : undefined
      if (!chapterId) {
        // 어느 챕터인지 못 찾으면 버리지 않고 원래 키로 남겨 둔다 —
        // 녹음·필기 사진은 되살릴 수 없는 데이터라 삭제보다 고아 상태가 낫다.
        rekeyed[key] = entries
        report.logsDropped += entries.length
        continue
      }
      rekeyed[chapterId] = [...(rekeyed[chapterId] ?? []), ...entries]
      report.logsRekeyed += entries.length
    }
    if (report.logsDropped > 0) {
      report.notes.push(
        `학습 기록 ${report.logsDropped}건은 해당 챕터를 찾지 못했어요. 지우지 않고 백업(zip)에 그대로 남습니다.`
      )
    }
    store.logs = rekeyed
  }
}

// ── v2 → v3 ─────────────────────────────────────────────

function stepV2toV3(store: Store, report: MigrationReport) {
  // 내 책: Record<언어, 책[]> → 책[] (각 책이 lang을 갖는다)
  const byLang = store.books as Record<string, RawUnit[]> | null
  if (byLang !== null && !Array.isArray(byLang) && typeof byLang === 'object') {
    const flat: Unit[] = []
    for (const [lang, list] of Object.entries(byLang)) {
      if (!Array.isArray(list)) continue
      for (const raw of list) {
        const id = raw.id || `${lang}-book-${flat.length}`
        flat.push(normalizeBook({ ...raw, lang: raw.lang || lang || langOf(raw, id) }, id))
      }
    }
    store.books = flat
    if (report.booksNormalized === 0) report.booksNormalized = flat.length
  }

  // 상태: courseId → lang
  if (store.state !== null) {
    const courseId = store.state.courseId
    if (typeof courseId === 'string' && !store.state.lang) store.state.lang = courseId
    delete store.state.courseId
  }
}

// ── 진입점 ──────────────────────────────────────────────

/**
 * 저장된 데이터를 최신 스키마까지 올린다. 이미 최신이면 아무것도 하지 않는다(멱등).
 * @param builtin 내장 책 (이미 정규화된 상태)
 */
export function migrate(builtin: Unit[]): MigrationReport {
  const report = emptyReport()

  const store: Store = {
    state: readJson<Record<string, unknown>>(STATE_KEY),
    books: readJson<unknown>(BOOKS_KEY),
    logs: readJson<Record<string, unknown[]>>(LOG_KEY),
  }

  // 저장된 게 아무것도 없으면 새 설치 — 할 일 없음
  if (store.state === null && store.books === null && store.logs === null) return report

  const from = Number(store.state?.schemaVersion ?? 1)
  if (from >= SCHEMA_VERSION) return report

  report.ran = true
  report.from = from

  // 원본 스냅샷 (첫 마이그레이션에서만 — 덮어쓰면 진짜 원본을 잃는다)
  for (const key of [STATE_KEY, BOOKS_KEY, LOG_KEY]) {
    const raw = localStorage.getItem(key)
    if (raw !== null && localStorage.getItem(key + BACKUP_SUFFIX) === null) {
      try {
        localStorage.setItem(key + BACKUP_SUFFIX, raw)
      } catch {
        report.notes.push('원본 스냅샷 저장 실패 (localStorage 용량 부족) — 변환은 계속합니다.')
      }
    }
  }

  if (from < 2) stepV1toV2(store, builtin, report)
  if (from < 3) stepV2toV3(store, report)

  if (store.state === null) store.state = {}
  store.state.schemaVersion = SCHEMA_VERSION
  localStorage.setItem(STATE_KEY, JSON.stringify(store.state))
  if (store.books !== null) localStorage.setItem(BOOKS_KEY, JSON.stringify(store.books))
  if (store.logs !== null) localStorage.setItem(LOG_KEY, JSON.stringify(store.logs))

  return report
}

/** 마이그레이션 전 스냅샷 되돌리기 (문제가 생겼을 때 수동 복구용) */
export function rollbackMigration(): boolean {
  let restored = false
  for (const key of [STATE_KEY, BOOKS_KEY, LOG_KEY]) {
    const snapshot = localStorage.getItem(key + BACKUP_SUFFIX)
    if (snapshot !== null) {
      localStorage.setItem(key, snapshot)
      localStorage.removeItem(key + BACKUP_SUFFIX)
      restored = true
    }
  }
  return restored
}
