// localStorage 기반 상태 저장 — 진행도 / SRS / 스트릭 / XP / 설정
export interface SrsEntry {
  level: number // 0~5 숙련도
  next: string // 다음 복습일 (yyyy-mm-dd)
  seen: number
  wrong: number
}

export interface AppState {
  courseId: 'zh' | 'en' | 'ja'
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
  completed: Record<string, number> // unitId → 완료한 레슨 수
  srs: Record<string, SrsEntry> // "courseId|단어" → SRS
}

export const STATE_KEY = 'language-study-v1'
export const MAX_HEARTS = 5

export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function yesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function defaults(): AppState {
  return {
    courseId: 'zh',
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
    completed: {},
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
