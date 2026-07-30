// 챕터별 "내 학습 기록" — 카카오톡 스터디처럼 날짜별로 내 녹음·필기 사진·메모를 쌓는다.
// 이 앱의 중심 기능이라 퀴즈와 독립된 컴포넌트로 둔다.
import { useEffect, useRef, useState } from 'react'
import { today } from '../lib/storage'
import { addLogEntry, deleteLogEntry, loadLog, logNamespace, type LogEntry } from '../lib/studyLog'
import { playMp3 } from '../lib/audio'
import ImageThumb from './ImageThumb'
import RecordButton from './RecordButton'

export interface LogInput {
  date: string
  note?: string
  audioBlob?: Blob
  audioExt?: string
  imageBlob?: Blob
}

export default function StudyLogTimeline({ lang, chapterId }: { lang: string; chapterId: string }) {
  const [log, setLog] = useState<LogEntry[]>([])
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    setLog(loadLog(chapterId))
  }, [chapterId])

  function refresh() {
    setLog(loadLog(chapterId))
  }

  async function save(input: LogInput) {
    await addLogEntry(lang, chapterId, input)
    refresh()
    setShowForm(false)
  }

  return (
    <>
      <div className="log-head">
        <h2 className="log-title">📝 내 학습 기록</h2>
        <button className="pill soft" onClick={() => setShowForm((v) => !v)}>
          {showForm ? '접기' : '＋ 오늘 기록 추가'}
        </button>
      </div>

      {showForm && <LogForm onSave={save} />}

      <div className="log-timeline">
        {log.length === 0 && <p className="log-empty">아직 기록이 없어요. 녹음하거나 필기 사진을 남겨보세요 🌸</p>}
        {log.map((entry) => (
          <div key={entry.id} className="log-card">
            <div className="log-card-top">
              <span className="log-date">🗓 {entry.date}</span>
              <button className="mini-del" onClick={() => { deleteLogEntry(chapterId, entry.id); refresh() }}>🗑</button>
            </div>
            {entry.audioFile && (
              <button className="pill soft" onClick={() => playMp3(logNamespace(lang), entry.audioFile!)}>
                🔊 내 녹음 듣기
              </button>
            )}
            {entry.imageFile && <ImageThumb ns={logNamespace(lang)} file={entry.imageFile} className="log-image" />}
            {entry.note && <p className="log-note">{entry.note}</p>}
          </div>
        ))}
      </div>
    </>
  )
}

function LogForm({ onSave }: { onSave: (input: LogInput) => void }) {
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [audio, setAudio] = useState<{ blob: Blob; ext: string } | null>(null)
  const [imageBlob, setImageBlob] = useState<Blob | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const imgRef = useRef<HTMLInputElement>(null)

  function onAudioFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) setAudio({ blob: f, ext: f.name.split('.').pop() || 'mp3' })
    e.target.value = ''
  }
  function onImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) {
      setImageBlob(f)
      setImagePreview(URL.createObjectURL(f))
    }
    e.target.value = ''
  }
  function save() {
    onSave({
      date,
      note: note.trim() || undefined,
      audioBlob: audio?.blob,
      audioExt: audio?.ext,
      imageBlob: imageBlob ?? undefined,
    })
    setNote('')
    setAudio(null)
    setImageBlob(null)
    setImagePreview(null)
  }

  return (
    <div className="log-form">
      <div className="editor-inline">
        <label className="log-form-label">날짜</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="editor-inline">
        <RecordButton onRecorded={(blob, ext) => setAudio({ blob, ext })} />
        <button type="button" className="pill soft" onClick={() => fileRef.current?.click()}>📁 오디오 파일</button>
        <input ref={fileRef} type="file" accept="audio/*" hidden onChange={onAudioFile} />
        {audio && <span className="tag">🎙 녹음됨</span>}
      </div>
      <div className="editor-inline">
        <button type="button" className="pill soft" onClick={() => imgRef.current?.click()}>🖼 사진 첨부 (필기 등)</button>
        <input ref={imgRef} type="file" accept="image/*" capture="environment" hidden onChange={onImageFile} />
        {imagePreview && <img className="img-thumb" src={imagePreview} alt="" />}
      </div>
      <textarea
        className="log-note-input"
        placeholder="한 줄 메모 (선택)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
      />
      <button className="pill primary" onClick={save}>💾 기록 저장</button>
    </div>
  )
}
