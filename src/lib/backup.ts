// 전체 백업/복원 — 이 앱의 데이터는 전부 이 맥북 브라우저 안에만 있다.
// 브라우저 데이터를 지우거나 맥북이 고장 나면 그동안의 녹음·필기·기록이 전부 사라진다.
// 그래서 zip 파일 하나로 통째로 빼내고 되돌릴 수 있게 한다.
//
// zip 구조:
//   manifest.json            백업 정보 + 파일 목록(경로 → 원래 IndexedDB 키)
//   data/state.json          진행도·SRS·XP·스트릭 (localStorage)
//   data/books.json          내가 만들거나 수정한 책 (localStorage)
//   data/logs.json           내 학습 기록 메타 (localStorage)
//   audio/...                녹음·mp3 (IndexedDB)
//   images/...               필기 사진·교재 스캔 (IndexedDB)
//
// zip 안의 경로는 ASCII로만 만든다 — 맥 기본 unzip이 UTF-8 파일명을 깨뜨려서,
// 한글 파일명을 그대로 쓰면 사용자가 zip을 직접 열어봤을 때 파일이 손상된다.
// 원래 키는 manifest.files[].key 에 그대로 보관하므로 복원은 정확하다.

import { asBlobPart, createZip, readZip, type ZipEntry } from './zip'
import { STATE_KEY } from './storage'
import { BOOKS_KEY } from './books'
import { LOG_KEY } from './studyLog'
import { allAudioFiles, audioKeys, putAudioRaw } from './audioStore'
import { allImageFiles, imageKeys, putImageRaw } from './imageStore'

export const BACKUP_FORMAT = 'language-study-backup'
export const BACKUP_VERSION = 1

export type StoreName = 'audio' | 'image'
export type ImportMode = 'merge' | 'replace'

export interface BackupFileRef {
  path: string // zip 안 경로 (ASCII)
  store: StoreName
  key: string // 원래 IndexedDB 키 (한글 가능)
  bytes: number
  type: string // MIME
}

export interface BackupManifest {
  format: string
  version: number
  createdAt: string
  summary: {
    books: number
    logEntries: number
    audio: number
    images: number
    xp: number
    streak: number
    studyDays: number
  }
  files: BackupFileRef[]
}

export interface BackupBundle {
  manifest: BackupManifest
  entries: Map<string, Uint8Array>
}

const TEXT_FILES: { path: string; key: string }[] = [
  { path: 'data/state.json', key: STATE_KEY },
  { path: 'data/books.json', key: BOOKS_KEY },
  { path: 'data/logs.json', key: LOG_KEY },
]

// ── 내보내기 ────────────────────────────────────────────

/** IndexedDB 키 → zip 안에서 안전한 ASCII 경로 */
function asciiPath(prefix: string, key: string, used: Set<string>): string {
  const safe = key
    .split('/')
    .map((seg) => seg.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'f')
    .join('/')
  let path = `${prefix}/${safe}`
  let n = 2
  while (used.has(path)) path = `${prefix}/${n++}_${safe}`
  used.add(path)
  return path
}

function countLogEntries(rawLogs: string | null): number {
  try {
    const map = JSON.parse(rawLogs || '{}') as Record<string, unknown[]>
    return Object.values(map).reduce((n, list) => n + (Array.isArray(list) ? list.length : 0), 0)
  } catch {
    return 0
  }
}

function countBooks(rawBooks: string | null): number {
  try {
    const map = JSON.parse(rawBooks || '{}') as Record<string, unknown[]>
    return Object.values(map).reduce((n, list) => n + (Array.isArray(list) ? list.length : 0), 0)
  } catch {
    return 0
  }
}

export interface BackupResult {
  blob: Blob
  filename: string
  manifest: BackupManifest
}

/** 지금 브라우저에 있는 모든 데이터를 zip 하나로 */
export async function createBackup(now = new Date()): Promise<BackupResult> {
  const [audio, images] = await Promise.all([allAudioFiles(), allImageFiles()])

  const texts = TEXT_FILES.map((f) => ({ ...f, raw: localStorage.getItem(f.key) }))
  let state: { xp?: number; streak?: number; studyDays?: string[] } = {}
  try {
    state = JSON.parse(texts[0].raw || '{}')
  } catch {
    /* 손상됐으면 요약만 0으로 */
  }

  const used = new Set<string>()
  const files: BackupFileRef[] = []
  const entries: ZipEntry[] = []

  for (const f of texts) {
    if (f.raw === null) continue // 아직 만들어지지 않은 데이터는 건너뜀
    entries.push({ name: f.path, data: new TextEncoder().encode(f.raw) })
  }

  for (const [store, list] of [
    ['audio', audio],
    ['image', images],
  ] as const) {
    for (const f of list) {
      const path = asciiPath(store === 'audio' ? 'audio' : 'images', f.key, used)
      const data = new Uint8Array(await f.blob.arrayBuffer())
      entries.push({ name: path, data })
      files.push({ path, store, key: f.key, bytes: data.length, type: f.blob.type || '' })
    }
  }

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    summary: {
      books: countBooks(texts[1].raw),
      logEntries: countLogEntries(texts[2].raw),
      audio: audio.length,
      images: images.length,
      xp: state.xp ?? 0,
      streak: state.streak ?? 0,
      studyDays: state.studyDays?.length ?? 0,
    },
    files,
  }

  const readme = [
    '언어공부 앱 백업 파일',
    `만든 날짜: ${now.toLocaleString('ko-KR')}`,
    '',
    '복원 방법: 앱 → 프로필 · 통계 → 백업 · 복원 → "백업 가져오기"에서 이 zip 파일을 그대로 고르세요.',
    '(압축을 풀 필요 없습니다. 푼 뒤 다시 압축해도 읽히지만, 원본 그대로가 가장 안전해요.)',
    '',
    '폴더 설명',
    '  data/state.json   진도·복습 상태·XP·스트릭',
    '  data/books.json   내가 만들거나 고친 책',
    '  data/logs.json    날짜별 학습 기록(메모·어떤 녹음/사진인지)',
    '  audio/            녹음 파일과 mp3',
    '  images/           필기 사진, 교재 스캔',
    '',
    '※ audio/ images/ 안의 파일 이름은 영문으로 바꿔 저장했습니다(맥에서 한글 파일명이 깨지는 문제 때문).',
    '   원래 이름은 manifest.json 의 files[].key 에 그대로 들어 있고, 복원하면 원래 이름으로 돌아갑니다.',
  ].join('\n')

  entries.unshift(
    { name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) },
    { name: 'README.txt', data: new TextEncoder().encode(readme) }
  )

  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return {
    blob: createZip(entries, now),
    filename: `language-study-backup-${stamp}.zip`,
    manifest,
  }
}

/** 브라우저에서 파일 저장 대화상자 띄우기 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

// ── 읽기 / 복원 ─────────────────────────────────────────

/** zip 파일 열어서 내용 확인만 (아직 아무것도 덮어쓰지 않음) */
export async function readBackup(file: File): Promise<BackupBundle> {
  const entries = await readZip(await file.arrayBuffer())
  const raw = entries.get('manifest.json')
  if (!raw) throw new Error('이 앱에서 만든 백업 파일이 아니에요 (manifest.json 없음).')

  let manifest: BackupManifest
  try {
    manifest = JSON.parse(new TextDecoder().decode(raw))
  } catch {
    throw new Error('백업 정보(manifest.json)를 읽을 수 없어요. 파일이 손상된 것 같아요.')
  }
  if (manifest.format !== BACKUP_FORMAT) {
    throw new Error('이 앱의 백업 파일이 아니에요.')
  }
  if (manifest.version > BACKUP_VERSION) {
    throw new Error(`더 새로운 버전(v${manifest.version})의 백업이에요. 앱을 먼저 업데이트해 주세요.`)
  }
  if (!Array.isArray(manifest.files)) manifest.files = []
  return { manifest, entries }
}

function mergeRecordOfLists<T>(
  currentRaw: string | null,
  backupRaw: string,
  idOf: (item: T) => string
): { merged: string; added: number } {
  const current: Record<string, T[]> = safeParse(currentRaw) ?? {}
  const backup: Record<string, T[]> = safeParse(backupRaw) ?? {}
  let added = 0
  for (const [k, list] of Object.entries(backup)) {
    if (!Array.isArray(list)) continue
    const cur = Array.isArray(current[k]) ? current[k] : []
    const have = new Set(cur.map(idOf))
    const extra = list.filter((item) => !have.has(idOf(item)))
    added += extra.length
    current[k] = [...cur, ...extra]
  }
  return { merged: JSON.stringify(current), added }
}

function safeParse<T>(raw: string | null): T | null {
  if (raw === null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export interface ImportSummary {
  mode: ImportMode
  booksAdded: number
  logsAdded: number
  filesWritten: number
  filesSkipped: number
  stateRestored: boolean
  warnings: string[]
}

/**
 * 백업 적용.
 *  - 'replace': 백업 내용으로 전부 덮어쓴다. 지금 기기에만 있는 기록은 사라진다.
 *  - 'merge':   백업에만 있는 것을 추가한다. 지금 기기의 진행도(XP·SRS·스트릭)는 건드리지 않는다.
 * 어느 모드에서도 IndexedDB의 기존 파일을 삭제하지는 않는다(되돌릴 수 없는 삭제는 하지 않는다).
 */
export async function applyBackup(
  bundle: BackupBundle,
  mode: ImportMode,
  onProgress?: (done: number, total: number) => void
): Promise<ImportSummary> {
  const { manifest, entries } = bundle
  const summary: ImportSummary = {
    mode,
    booksAdded: 0,
    logsAdded: 0,
    filesWritten: 0,
    filesSkipped: 0,
    stateRestored: false,
    warnings: [],
  }

  const stateRaw = entries.get('data/state.json')
  const booksRaw = entries.get('data/books.json')
  const logsRaw = entries.get('data/logs.json')
  const asText = (b?: Uint8Array) => (b ? new TextDecoder().decode(b) : null)

  if (mode === 'replace') {
    if (stateRaw) {
      localStorage.setItem(STATE_KEY, asText(stateRaw)!)
      summary.stateRestored = true
    }
    if (booksRaw) {
      localStorage.setItem(BOOKS_KEY, asText(booksRaw)!)
      summary.booksAdded = countBooks(asText(booksRaw))
    }
    if (logsRaw) {
      localStorage.setItem(LOG_KEY, asText(logsRaw)!)
      summary.logsAdded = countLogEntries(asText(logsRaw))
    }
  } else {
    if (booksRaw) {
      const r = mergeRecordOfLists<{ id: string }>(
        localStorage.getItem(BOOKS_KEY),
        asText(booksRaw)!,
        (u) => u?.id ?? ''
      )
      localStorage.setItem(BOOKS_KEY, r.merged)
      summary.booksAdded = r.added
    }
    if (logsRaw) {
      const r = mergeRecordOfLists<{ id: string }>(
        localStorage.getItem(LOG_KEY),
        asText(logsRaw)!,
        (e) => e?.id ?? ''
      )
      localStorage.setItem(LOG_KEY, r.merged)
      summary.logsAdded = r.added
    }
    // 진행도(state)는 합칠 수 없다 — 덮어쓰면 지금 기기 기록이 뒤로 감기므로 건드리지 않는다.
  }

  const existing =
    mode === 'merge'
      ? { audio: await audioKeys(), image: await imageKeys() }
      : { audio: new Set<string>(), image: new Set<string>() }

  const total = manifest.files.length
  let done = 0
  for (const f of manifest.files) {
    done++
    onProgress?.(done, total)
    const data = entries.get(f.path)
    if (!data) {
      summary.filesSkipped++
      summary.warnings.push(`파일 없음: ${f.key}`)
      continue
    }
    if (mode === 'merge' && existing[f.store].has(f.key)) {
      summary.filesSkipped++
      continue
    }
    const blob = new Blob([asBlobPart(data)], { type: f.type || 'application/octet-stream' })
    try {
      if (f.store === 'audio') await putAudioRaw(f.key, blob)
      else await putImageRaw(f.key, blob)
      summary.filesWritten++
    } catch {
      summary.filesSkipped++
      summary.warnings.push(`저장 실패: ${f.key}`)
    }
  }

  if (summary.warnings.length > 6) {
    summary.warnings = [...summary.warnings.slice(0, 6), `그 외 ${summary.warnings.length - 6}건`]
  }
  return summary
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${Math.round((n / 1024 / 1024) * 10) / 10} MB`
}
