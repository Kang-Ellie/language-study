// 챕터별 "내 학습 기록" 타임라인 — 카카오톡 스터디처럼 날짜별로 내 녹음·사진·메모를 쌓는다.
// 메타데이터는 localStorage, 오디오/이미지 바이너리는 각각 audioStore/imageStore(IndexedDB)에 저장.
//
// 저장 키는 **챕터 id**다. v1에서는 `${courseId}|${bookId}|${lessonIdx}` 였는데,
// 챕터를 중간에 하나 끼워 넣으면 모든 날짜의 녹음·필기가 옆 챕터로 밀려 붙었다.
import { deleteAudio, putAudio } from './audioStore'
import { deleteImage, putImage } from './imageStore'

export interface LogEntry {
  id: string
  date: string // yyyy-mm-dd
  /** 쓰기 연습 — 오늘 직접 써 본 문장들 (여러 줄) */
  writing?: string
  /** 한 줄 메모 */
  note?: string
  /** 하루에 여러 번 녹음할 수 있다 (문장별로 따로 읽는 경우) */
  audioFiles: string[]
  /** 필기 사진도 여러 장 */
  imageFiles: string[]
}

export const LOG_KEY = 'language-study-log-v1'
type LogMap = Record<string, LogEntry[]>

function loadMap(): LogMap {
  try {
    const raw = JSON.parse(localStorage.getItem(LOG_KEY) || '{}')
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}
function saveMap(m: LogMap) {
  localStorage.setItem(LOG_KEY, JSON.stringify(m))
}

/** 내 녹음/사진 blob은 이 네임스페이스로 저장(원본 콘텐츠 오디오와 충돌 방지) */
export function logNamespace(lang: string): string {
  return `log-${lang}`
}

/** 최신 날짜가 위로 오도록 정렬해서 반환 */
export function loadLog(chapterId: string): LogEntry[] {
  const list = loadMap()[chapterId] ?? []
  return [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id.localeCompare(a.id)))
}

export interface LogInput {
  date: string
  writing?: string
  note?: string
  audios?: { blob: Blob; ext: string }[]
  images?: Blob[]
}

/** 이 기록에 뭐라도 들어 있는가 (빈 기록 저장 방지) */
export function hasLogContent(input: LogInput): boolean {
  return !!(
    input.writing?.trim() ||
    input.note?.trim() ||
    (input.audios?.length ?? 0) > 0 ||
    (input.images?.length ?? 0) > 0
  )
}

export async function addLogEntry(lang: string, chapterId: string, input: LogInput): Promise<void> {
  const ns = logNamespace(lang)
  const id = `${Date.now()}`
  const audioFiles: string[] = []
  const imageFiles: string[] = []

  for (const [i, a] of (input.audios ?? []).entries()) {
    const name = `${id}-${i}.${a.ext || 'mp3'}`
    await putAudio(ns, name, a.blob)
    audioFiles.push(name)
  }
  for (const [i, blob] of (input.images ?? []).entries()) {
    const name = `${id}-${i}.jpg`
    await putImage(ns, name, blob)
    imageFiles.push(name)
  }

  const map = loadMap()
  const entry: LogEntry = {
    id,
    date: input.date,
    writing: input.writing?.trim() || undefined,
    note: input.note?.trim() || undefined,
    audioFiles,
    imageFiles,
  }
  map[chapterId] = [...(map[chapterId] ?? []), entry]
  saveMap(map)
}

/** 기록 삭제 — 딸린 녹음·사진 파일도 같이 지운다(안 지우면 용량만 먹는 고아가 된다) */
export async function deleteLogEntry(lang: string, chapterId: string, id: string): Promise<void> {
  const map = loadMap()
  const entry = (map[chapterId] ?? []).find((e) => e.id === id)
  map[chapterId] = (map[chapterId] ?? []).filter((e) => e.id !== id)
  saveMap(map)

  if (!entry) return
  const ns = logNamespace(lang)
  await Promise.all([
    ...entry.audioFiles.map((f) => deleteAudio(ns, f).catch(() => {})),
    ...entry.imageFiles.map((f) => deleteImage(ns, f).catch(() => {})),
  ])
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
