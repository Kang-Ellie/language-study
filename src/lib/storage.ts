// localStorage 기반 상태 저장 — 진행도 / SRS / 스트릭 / XP / 설정
import type { ItemId } from '../types'

export const SCHEMA_VERSION = 3

export interface SrsEntry {
  level: number // 0~5 숙련도
  next: string // 다음 복습일 (yyyy-mm-dd)
  seen: number
  wrong: number
  lastSeen?: string // yyyy-mm-dd
  lastWrong?: string // yyyy-mm-dd
}

/** 챕터 단위 진도. "완료한 개수"가 아니라 챕터별 플래그다 —
 *  7과만 완료 표시해도 1~6과가 딸려 완료되지 않는다. */
export interface ChapterProgress {
  markedDone: boolean
  markedAt?: string
  quizRuns?: number
  lastQuizAt?: string
}

export interface AppState {
  schemaVersion: number
  lang: string // 지금 보고 있는 책장 탭. 언어를 늘려도 타입을 고칠 일이 없다
  xp: number
  xpToday: number
  xpDate: string
  dailyGoal: number
  streak: number
  bestStreak: number
  lastStudy: string
  studyDays: string[]
  hearts: number
  heartsEnabled: boolean
  soundOn: boolean
  progress: Record<string, ChapterProgress> // chapterId → 진도
  srs: Record<ItemId, SrsEntry> // itemId → SRS
}

export const STATE_KEY = 'language-study-v1'
export const MAX_HEARTS = 5

export function today(): string {
  return ymd(new Date())
}

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function yesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return ymd(d)
}

export function defaults(): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    lang: 'zh',
    xp: 0,
    xpToday: 0,
    xpDate: today(),
    dailyGoal: 30,
    streak: 0,
    bestStreak: 0,
    lastStudy: '',
    studyDays: [],
    hearts: MAX_HEARTS,
    heartsEnabled: true,
    soundOn: true,
    progress: {},
    srs: {},
  }
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STATE_KEY)
    if (!raw) return defaults()
    const s = { ...defaults(), ...JSON.parse(raw) } as AppState
    // 날짜가 바뀌면 오늘 XP 리셋
    if (s.xpDate !== today()) {
      s.xpDate = today()
      s.xpToday = 0
    }
    // 하루를 통째로 건너뛰면 스트릭 끊김
    if (s.lastStudy && s.lastStudy !== today() && s.lastStudy !== yesterday()) {
      s.streak = 0
    }
    return s
  } catch {
    return defaults()
  }
}

export function saveState(s: AppState) {
  localStorage.setItem(STATE_KEY, JSON.stringify(s))
}

export function resetAll() {
  localStorage.removeItem(STATE_KEY)
}

/** 학습 완료 시 스트릭·XP 갱신 */
export function recordStudy(s: AppState, earnedXp: number): AppState {
  const t = today()
  let streak = s.streak
  if (s.lastStudy !== t) {
    streak = s.lastStudy === yesterday() ? s.streak + 1 : 1
  }
  const studyDays = s.studyDays.includes(t) ? s.studyDays : [...s.studyDays, t]
  return {
    ...s,
    xp: s.xp + earnedXp,
    xpToday: (s.xpDate === t ? s.xpToday : 0) + earnedXp,
    xpDate: t,
    streak,
    bestStreak: Math.max(s.bestStreak, streak),
    lastStudy: t,
    studyDays,
  }
}

// ── 진도 헬퍼 ────────────────────────────────────────────

export function isChapterDone(s: AppState, chapterId: string): boolean {
  return s.progress[chapterId]?.markedDone === true
}

/** 챕터 완료 표시를 켜고 끈다 */
export function toggleChapterDone(s: AppState, chapterId: string): AppState {
  const cur = s.progress[chapterId]
  const next: ChapterProgress = { ...cur, markedDone: !cur?.markedDone }
  if (next.markedDone) next.markedAt = today()
  return { ...s, progress: { ...s.progress, [chapterId]: next } }
}

/** 퀴즈 1회 완료 기록 (완료 표시도 함께 켠다) */
export function recordChapterQuiz(s: AppState, chapterId: string): AppState {
  const cur = s.progress[chapterId]
  const next: ChapterProgress = {
    ...cur,
    markedDone: true,
    markedAt: cur?.markedAt ?? today(),
    quizRuns: (cur?.quizRuns ?? 0) + 1,
    lastQuizAt: today(),
  }
  return { ...s, progress: { ...s.progress, [chapterId]: next } }
}

/** 이 책에서 완료 표시된 챕터 수 */
export function doneChapterCount(s: AppState, chapterIds: string[]): number {
  return chapterIds.reduce((n, id) => n + (isChapterDone(s, id) ? 1 : 0), 0)
}
