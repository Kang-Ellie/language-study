// 효과음(WebAudio 생성)과 mp3 재생 — 외부 요청 0회
let ctx: AudioContext | null = null

function audioCtx(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
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

function folderUrl(courseId: string, file: string): string {
  return `${import.meta.env.BASE_URL}audio/${courseId}/${file}`
}

/** 재생용 URL 확보 — 업로드된 파일(IndexedDB) 우선, 없으면 폴더 */
async function resolveUrl(courseId: string, file: string): Promise<string> {
  const blob = await getAudioBlob(courseId, file)
  if (blob) return URL.createObjectURL(blob)
  return folderUrl(courseId, file)
}

/** mp3 재생 (업로드 파일 또는 public/audio/ 폴더) */
export async function playMp3(courseId: string, file: string) {
  try {
    const url = await resolveUrl(courseId, file)
    const a = new Audio(url)
    await a.play()
  } catch {}
}

/**
 * mp3가 실제로 존재하는지 확인 (업로드됨 OR 폴더에 있음).
 * 존재하는 항목만 듣기 문제를 출제하고 🔊 버튼을 표시하기 위함.
 */
export async function checkAudioFiles(courseId: string, files: string[]): Promise<Set<string>> {
  const ok = new Set<string>()
  await Promise.all(
    files.map(async (f) => {
      if (await hasAudioStored(courseId, f)) {
        ok.add(f)
        return
      }
      try {
        const res = await fetch(folderUrl(courseId, f), { method: 'HEAD' })
        const type = res.headers.get('content-type') || ''
        if (res.ok && !type.includes('text/html')) ok.add(f)
      } catch {}
    })
  )
  return ok
}
