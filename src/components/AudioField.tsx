import { useEffect, useRef, useState } from 'react'
import { hasAudioStored, putAudio } from '../lib/audioStore'
import { playMp3 } from '../lib/audio'

interface Props {
  courseId: string
  value: string | undefined // 파일명
  onChange: (file: string | undefined) => void
  slug?: string // 업로드 시 자동 파일명 힌트
}

function slugify(s: string): string {
  return (s || 'audio')
    .trim()
    .replace(/[^\w가-힣一-鿿ぁ-んァ-ヶ]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'audio'
}

/** mp3 파일명 입력 + 업로드(IndexedDB) + 재생 — 둘 다 지원 */
export default function AudioField({ courseId, value, onChange, slug }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [stored, setStored] = useState(false)

  useEffect(() => {
    if (value) hasAudioStored(courseId, value).then(setStored)
    else setStored(false)
  }, [courseId, value])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const name = value && value.trim() ? value.trim() : `${slugify(slug ?? '')}-${Date.now()}.mp3`
    await putAudio(courseId, name, file)
    setStored(true)
    onChange(name)
    e.target.value = ''
  }

  return (
    <div className="audio-field">
      <input
        className="af-name"
        value={value ?? ''}
        placeholder="mp3 파일명"
        onChange={(e) => onChange(e.target.value || undefined)}
      />
      <button type="button" className={`af-btn ${stored ? 'ok' : ''}`} title="mp3 업로드" onClick={() => inputRef.current?.click()}>
        {stored ? '✓' : '⬆'}
      </button>
      {value && (
        <button type="button" className="af-btn" title="미리 듣기" onClick={() => playMp3(courseId, value)}>
          🔊
        </button>
      )}
      <input ref={inputRef} type="file" accept="audio/*,.mp3" hidden onChange={onFile} />
    </div>
  )
}
