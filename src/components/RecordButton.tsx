import { useRef, useState } from 'react'

interface Props {
  onRecorded: (blob: Blob, ext: string) => void
}

function pickMime(): string | undefined {
  const cands = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
  for (const c of cands) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(c)) return c
  }
  return undefined
}
function extFromMime(mime: string): string {
  if (mime.includes('mp4')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}
function timeStr(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** 마이크로 직접 녹음 (완전 로컬 — 서버 전송 없음) */
export default function RecordButton({ onRecorded }: Props) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const mrRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = pickMime()
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mr.onstop = () => {
        const type = mr.mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type })
        onRecorded(blob, extFromMime(type))
        stream.getTracks().forEach((t) => t.stop())
      }
      mr.start()
      mrRef.current = mr
      setSeconds(0)
      setRecording(true)
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    } catch {
      alert('🎙 마이크 권한이 필요해요. 브라우저 설정에서 허용해 주세요.')
    }
  }

  function stop() {
    mrRef.current?.stop()
    setRecording(false)
    if (timerRef.current) window.clearInterval(timerRef.current)
  }

  return (
    <button type="button" className={`rec-btn ${recording ? 'recording' : ''}`} onClick={recording ? stop : start}>
      {recording ? `⏹ 정지 ${timeStr(seconds)}` : '🎙 녹음하기'}
    </button>
  )
}
