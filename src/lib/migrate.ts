// schemaVersion 1 → 2 마이그레이션.
//
// v1에서 모든 참조는 "배열 인덱스"와 "단어 텍스트"였다.
//   - 학습 기록 키: `${courseId}|${bookId}|${lessonIdx}`  → 챕터를 끼워 넣으면 전부 밀린다
//   - 진도:        completed[bookId] = 완료한 개수         → 7과만 완료해도 1~6과가 딸려 완료된다
//   - SRS 키:      `${courseId}|${단어텍스트}`             → 오타를 고치면 이력이 사라진다
// v2는 셋 다 항목 id를 참조한다.
//
// 되돌릴 수 없으므로 **변환 전 원본 3개 키를 통째로 스냅샷**해 둔다(텍스트라 용량 부담 없음).
// IndexedDB의 녹음·사진은 이 마이그레이션이 건드리지 않는다.
import type { Unit } from '../types'
import { normalizeBook, type RawUnit } from './normalize'
import { BOOKS_KEY } from './books'
import { LOG_KEY } from './studyLog'
import { SCHEMA_VERSION, STATE_KEY, type AppState, type ChapterProgress, type SrsEntry } from './storage'

export const BACKUP_SUFFIX = '-pre-v2'

export interface MigrationReport {
  ran: boolean
  booksNormalized: number
  srsMatched: number
  srsDropped: number
  chaptersMarkedDone: number
  logsRekeyed: number
  logsDropped: number
  notes: string[]
}

const EMPTY: MigrationReport = {
  ran: false,
  booksNormalized: 0,
  srsMatched: 0,
  srsDropped: 0,
  chaptersMarkedDone: 0,
  logsRekeyed: 0,
  logsDropped: 0,
  notes: [],
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

/**
 * 변환에 쓸 책 목록. 내장 책과 사용자 책을 합쳐 언어별로 모은다.
 * 내장 책은 이미 정규화돼 있고, 사용자 책은 여기서 정규화된다.
 */
function collectBooks(
  builtin: Record<string, Unit[]>,
  custom: Record<string, RawUnit[]>
): { byCourse: Record<string, Unit[]>; normalized: Record<string, Unit[]>; count: number } {
  const byCourse: Record<string, Unit[]> = {}
  const normalized: Record<string, Unit[]> = {}
  let count = 0

  for (const [courseId, units] of Object.entries(builtin)) {
    byCourse[courseId] = [...units]
  }
  for (const [courseId, raws] of Object.entries(custom)) {
    if (!Array.isArray(raws)) continue
    const list = raws.map((raw, i) => normalizeBook(raw, raw.id || `${courseId}-book-migrated-${i}`))
    normalized[courseId] = list
    count += list.length
    // 사용자 책이 같은 id의 내장 책을 덮어쓴다(books.ts의 병합 규칙과 동일)
    const base = byCourse[courseId] ?? []
    const shadowed = base.map((u) => list.find((c) => c.id === u.id) ?? u)
    const extras = list.filter((c) => !base.some((u) => u.id === c.id))
    byCourse[courseId] = [...shadowed, ...extras]
  }
  return { byCourse, normalized, count }
}

/**
 * v1 → v2 변환. 이미 v2면 아무것도 하지 않는다(멱등).
 * @param builtinByCourse 내장 책 (정규화된 상태로 전달)
 */
export function migrateV1toV2(builtinByCourse: Record<string, Unit[]>): MigrationReport {
  const state = readJson<Partial<AppState> & { completed?: Record<string, number> }>(STATE_KEY)
  const customRaw = readJson<Record<string, RawUnit[]>>(BOOKS_KEY)
  const logsRaw = readJson<Record<string, unknown[]>>(LOG_KEY)

  // 저장된 게 아무것도 없으면 새 설치 — 버전만 찍고 끝
  if (state === null && customRaw === null && logsRaw === null) return { ...EMPTY }
  if ((state?.schemaVersion ?? 1) >= SCHEMA_VERSION) return { ...EMPTY }

  const report: MigrationReport = { ...EMPTY, ran: true, notes: [] }

  // ── 0. 원본 스냅샷 (되돌릴 수 없는 변환이므로) ─────────
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

  // ── 1. 사용자 책 정규화 ────────────────────────────────
  const { byCourse, normalized, count } = collectBooks(builtinByCourse, customRaw ?? {})
  report.booksNormalized = count
  if (customRaw !== null) {
    localStorage.setItem(BOOKS_KEY, JSON.stringify(normalized))
  }

  // 언어별 "단어 텍스트 → itemId" 색인. 같은 텍스트가 여러 번 나오면 첫 번째만 쓴다.
  const wordIndex: Record<string, Map<string, string>> = {}
  // "courseId|bookId|lessonIdx" → chapterId
  const chapterIndex = new Map<string, string>()
  // bookId → chapterId[]  (진도 전개용)
  const chaptersOf = new Map<string, string[]>()

  for (const [courseId, books] of Object.entries(byCourse)) {
    const map = new Map<string, string>()
    for (const book of books) {
      const ids: string[] = []
      book.lessons.forEach((lesson, li) => {
        ids.push(lesson.id)
        chapterIndex.set(`${courseId}|${book.id}|${li}`, lesson.id)
        for (const section of lesson.sections) {
          for (const w of section.words) if (w.text && !map.has(w.text)) map.set(w.text, w.id)
        }
      })
      chaptersOf.set(book.id, ids)
    }
    wordIndex[courseId] = map
  }

  // ── 2. 상태(SRS / 진도) 변환 ───────────────────────────
  if (state !== null) {
    const oldSrs = (state.srs ?? {}) as Record<string, SrsEntry>
    const newSrs: Record<string, SrsEntry> = {}
    for (const [key, entry] of Object.entries(oldSrs)) {
      const parsed = parseSrsKey(key)
      const itemId = parsed ? wordIndex[parsed.courseId]?.get(parsed.text) : undefined
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

    const progress: Record<string, ChapterProgress> = { ...(state.progress ?? {}) }
    for (const [bookId, doneCount] of Object.entries(state.completed ?? {})) {
      const ids = chaptersOf.get(bookId)
      if (!ids) continue
      for (let i = 0; i < Math.min(doneCount, ids.length); i++) {
        if (!progress[ids[i]]?.markedDone) {
          progress[ids[i]] = { ...progress[ids[i]], markedDone: true }
          report.chaptersMarkedDone++
        }
      }
    }

    const next = { ...state, srs: newSrs, progress, schemaVersion: SCHEMA_VERSION }
    delete (next as { completed?: unknown }).completed
    localStorage.setItem(STATE_KEY, JSON.stringify(next))
  } else {
    localStorage.setItem(STATE_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION }))
  }

  // ── 3. 학습 기록 키 재작성 ─────────────────────────────
  if (logsRaw !== null) {
    const rekeyed: Record<string, unknown[]> = {}
    for (const [key, entries] of Object.entries(logsRaw)) {
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
    localStorage.setItem(LOG_KEY, JSON.stringify(rekeyed))
  }

  return report
}

/** 마이그레이션 전 스냅샷 되돌리기 (문제가 생겼을 때 수동 복구용) */
export function rollbackV2(): boolean {
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
