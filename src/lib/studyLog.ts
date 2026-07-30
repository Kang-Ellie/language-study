// 챕터별 "내 학습 기록" 타임라인 — 카카오톡 스터디처럼 날짜별로 내 녹음·사진·메모를 쌓는다.
// 메타데이터는 localStorage, 오디오/이미지 바이너리는 각각 audioStore/imageStore(IndexedDB)에 저장.
//
// 저장 키는 **챕터 id**다. v1에서는 `${courseId}|${bookId}|${lessonIdx}` 였는데,
// 챕터를 중간에 하나 끼워 넣으면 모든 날짜의 녹음·필기가 옆 챕터로 밀려 붙었다.
import { putAudio } from './audioStore'
import { putImage } from './imageStore'

export interface LogEntry {
  id: string
  date: string // yyyy-mm-dd
  note?: string
  audioFile?: string
  imageFile?: string
}

export const LOG_KEY = 'language-study-log-v1'
type LogMap = Record<string, LogEntry[]>

function loadMap(): LogMap {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) || '{}')
  } catch {
    return {}
  }
}
function saveMap(m: LogMap) {
  localStorage.setItem(LOG_KEY, JSON.stringify(m))
}

/** 내 녹음/사진 blob은 이 네임스페이스로 저장(원본 콘텐츠 오디오와 충돌 방지) */
export function logNamespace(courseId: string): string {
  return `log-${courseId}`
}

/** 최신 날짜가 위로 오도록 정렬해서 반환 */
export function loadLog(chapterId: string): LogEntry[] {
  const list = loadMap()[chapterId] ?? []
  return [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id.localeCompare(a.id)))
}

export async function addLogEntry(
  courseId: string,
  chapterId: string,
  input: { date: string; note?: string; audioBlob?: Blob; audioExt?: string; imageBlob?: Blob }
): Promise<void> {
  const ns = logNamespace(courseId)
  const id = `${Date.now()}`
  let audioFile: string | undefined
  let imageFile: string | undefined
  if (input.audioBlob) {
    audioFile = `${id}.${input.audioExt ?? 'mp3'}`
    await putAudio(ns, audioFile, input.audioBlob)
  }
  if (input.imageBlob) {
    imageFile = `${id}.jpg`
    await putImage(ns, imageFile, input.imageBlob)
  }
  const map = loadMap()
  const entry: LogEntry = { id, date: input.date, note: input.note, audioFile, imageFile }
  map[chapterId] = [...(map[chapterId] ?? []), entry]
  saveMap(map)
}

export function deleteLogEntry(chapterId: string, id: string) {
  const map = loadMap()
  map[chapterId] = (map[chapterId] ?? []).filter((e) => e.id !== id)
  saveMap(map)
}

/** 이 책의 챕터 전체에서 학습 기록이 있었던 날짜 수 (책 카드 배지용) */
export function bookLogDays(chapterIds: string[]): number {
  const map = loadMap()
  const days = new Set<string>()
  for (const id of chapterIds) {
    for (const e of map[id] ?? []) days.add(e.date)
  }
  return days.size
}
