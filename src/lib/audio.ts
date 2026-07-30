// 효과음(WebAudio 생성)과 mp3 재생 — 외부 요청 0회
/** 사파리는 아직 접두사 붙은 이름만 있는 경우가 있다 */
type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext }

let ctx: AudioContext | null = null

function audioCtx(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext ?? (window as WebkitWindow).webkitAudioContext!)()
  return ctx
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number) {
  const c = audioCtx()
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(vol, c.currentTime + start)
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + dur)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(c.currentTime + start)
  osc.stop(c.currentTime + start + dur)
}

/** 정답 딩동 ✨ */
export function playCorrect() {
  try {
    tone(880, 0, 0.15, 'sine', 0.2)
    tone(1318, 0.1, 0.25, 'sine', 0.2)
  } catch {}
}

/** 오답 붕 */
export function playWrong() {
  try {
    tone(220, 0, 0.2, 'square', 0.08)
    tone(180, 0.15, 0.3, 'square', 0.08)
  } catch {}
}

/** 레슨 완료 팡파레 */
export function playFanfare() {
  try {
    tone(659, 0, 0.15, 'sine', 0.18)
    tone(784, 0.12, 0.15, 'sine', 0.18)
    tone(1046, 0.24, 0.4, 'sine', 0.2)
  } catch {}
}

import { getAudioBlob, hasAudioStored } from './audioStore'

/**
 * mp3를 어디서 찾을지.
 *
 * 예전에는 **언어** 하나만 네임스페이스로 썼다. 그래서 같은 언어의 두 책에
 * `1.mp3`를 각각 올리면 뒤에 올린 것이 앞의 것을 덮어썼다.
 * 이제 업로드는 **책 단위**로 저장하고, 찾을 때는 세 곳을 차례로 본다.
 *
 *   1. IndexedDB `<bookId>/<파일>`   ← 지금 업로드하는 곳
 *   2. IndexedDB `<lang>/<파일>`     ← 예전에 올린 것 + 여러 책이 함께 쓰는 것
 *   3. 폴더 `public/audio/<lang>/<파일>`
 *
 * 2·3을 남겨 둔 덕에 이미 올린 파일을 옮기지 않아도 그대로 들린다.
 * 폴더 경로는 사용자가 직접 관리하는 파일이라 언어 단위 그대로 둔다.
 */
export interface AudioScope {
  /** 책 id. 없으면 언어 네임스페이스만 본다(내 녹음 등) */
  bookId?: string
  lang: string
}

function folderUrl(lang: string, file: string): string {
  return `${import.meta.env.BASE_URL}audio/${lang}/${file}`
}

/** 업로드는 항상 책 네임스페이스로 (없으면 언어) */
export function uploadNamespace(scope: AudioScope): string {
  return scope.bookId ?? scope.lang
}

/** 재생용 URL 확보 — 책 → 언어 → 폴더 순 */
async function resolveUrl(scope: AudioScope, file: string): Promise<string> {
  if (scope.bookId) {
    const own = await getAudioBlob(scope.bookId, file)
    if (own) return URL.createObjectURL(own)
  }
  const shared = await getAudioBlob(scope.lang, file)
  if (shared) return URL.createObjectURL(shared)
  return folderUrl(scope.lang, file)
}

/** mp3 재생 (업로드 파일 또는 public/audio/ 폴더) */
export async function playMp3(scope: AudioScope | string, file: string) {
  const s: AudioScope = typeof scope === 'string' ? { lang: scope } : scope
  try {
    const url = await resolveUrl(s, file)
    const a = new Audio(url)
    await a.play()
  } catch {}
}

/** 이 파일이 어딘가에 실제로 있는지 */
export async function audioExists(scope: AudioScope, file: string): Promise<boolean> {
  if (scope.bookId && (await hasAudioStored(scope.bookId, file))) return true
  if (await hasAudioStored(scope.lang, file)) return true
  try {
    const res = await fetch(folderUrl(scope.lang, file), { method: 'HEAD' })
    const type = res.headers.get('content-type') || ''
    return res.ok && !type.includes('text/html')
  } catch {
    return false
  }
}

/**
 * mp3가 실제로 존재하는지 확인 (업로드됨 OR 폴더에 있음).
 * 존재하는 항목만 듣기 문제를 출제하고 🔊 버튼을 표시하기 위함.
 */
export async function checkAudioFiles(scope: AudioScope | string, files: string[]): Promise<Set<string>> {
  const s: AudioScope = typeof scope === 'string' ? { lang: scope } : scope
  const ok = new Set<string>()
  await Promise.all(
    files.map(async (f) => {
      if (await audioExists(s, f)) ok.add(f)
    })
  )
  return ok
}
