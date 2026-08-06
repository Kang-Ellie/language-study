// 챕터별 "내 학습 기록" — 카카오톡 스터디처럼 날짜별로 쌓는다.
// 이 앱의 중심 기능이라 퀴즈와 독립된 컴포넌트로 둔다.
import { useEffect, useRef, useState } from 'react'
import { today } from '../lib/storage'
import {
  addLogEntry,
  deleteLogEntry,
  hasLogContent,
  loadLog,
  logNamespace,
  type LogEntry,
  type LogInput,
} from '../lib/studyLog'
import { playMp3 } from '../lib/audio'
import ImageThumb from './ImageThumb'
import RecordButton from './RecordButton'

interface Props {
  lang: string
  chapterId: string
  /** 기록이 늘거나 줄면 알린다 — 인증 현황을 다시 세야 한다 */
  onChange?: () => void
}

export default function StudyLogTimeline({ lang, chapterId, onChange }: Props) {
  const [log, setLog] = useState<LogEntry[]>([])
  const [showForm, setShowForm] = useState(false)
  const ns = logNamespace(lang)

  useEffect(() => {
    setLog(loadLog(chapterId))
  }, [chapterId])

  function refresh() {
    setLog(loadLog(chapterId))
  }

  async function save(input: LogInput) {
    await addLogEntry(lang, chapterId, input)
    refresh()
    onChange?.()
    setShowForm(false)
  }

  async function remove(id: string) {
    if (!confirm('이 기록을 지울까요? 딸린 녹음·사진도 함께 지워져요.')) return
    await deleteLogEntry(lang, chapterId, id)
    refresh()
    onChange?.()
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
              <button className="mini-del" onClick={() => remove(entry.id)}>🗑</button>
            </div>

            {entry.writing && (
              <div className="log-writing">
                <div className="log-writing-label">✍️ 쓰기 연습</div>
                <p className="log-writing-text">{entry.writing}</p>
              </div>
            )}

            {entry.audioFiles.length > 0 && (
              <div className="log-audios">
                {entry.audioFiles.map((f, i) => (
                  <button key={f} className="pill soft" onClick={() => playMp3(ns, f)}>
                    🔊 내 녹음{entry.audioFiles.length > 1 ? ` ${i + 1}` : ''}
                  </button>
                ))}
              </div>
            )}

            {entry.imageFiles.length > 0 && (
              <div className="log-images">
                {entry.imageFiles.map((f) => (
                  <ImageThumb key={f} ns={ns} file={f} className="log-image" />
                ))}
              </div>
            )}

            {entry.note && <p className="log-note">{entry.note}</p>}
          </div>
        ))}
      </div>
    </>
  )
}

function LogForm({ onSave }: { onSave: (input: LogInput) => void }) {
  const [date, setDate] = useState(today())
  const [writing, setWriting] = useState('')
  const [note, setNote] = useState('')
  const [audios, setAudios] = useState<{ blob: Blob; ext: string }[]>([])
  const [images, setImages] = useState<{ blob: Blob; url: string }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const imgRef = useRef<HTMLInputElement>(null)

  function addAudioFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    setAudios((prev) => [...prev, ...files.map((f) => ({ blob: f, ext: f.name.split('.').pop() || 'mp3' }))])
    e.target.value = ''
  }
  function addImageFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    setImages((prev) => [...prev, ...files.map((f) => ({ blob: f, url: URL.createObjectURL(f) }))])
    e.target.value = ''
  }

  const input: LogInput = { date, writing, note, audios, images: images.map((i) => i.blob) }
  const canSave = hasLogContent(input)

  function save() {
    onSave(input)
    setWriting('')
    setNote('')
    setAudios([])
    setImages([])
  }

  return (
    <div className="log-form">
      <div className="editor-inline">
        <label className="log-form-label">날짜</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {/* 쓰기 연습 — 매일 하는 쓰기 과제. 한 줄 메모와 따로 둔다 */}
      <label className="log-form-label">✍️ 쓰기 연습</label>
      <textarea
        className="log-writing-input"
        placeholder="오늘 직접 써 본 문장을 적어보세요 (여러 줄 OK)"
        value={writing}
        onChange={(e) => setWriting(e.target.value)}
        rows={5}
      />

      {/* 녹음 — 하루에 여러 개 */}
      <label className="log-form-label">🎙 말하기 녹음</label>
      <div className="editor-inline">
        <RecordButton onRecorded={(blob, ext) => setAudios((prev) => [...prev, { blob, ext }])} />
        <button type="button" className="pill soft" onClick={() => fileRef.current?.click()}>📁 오디오 파일</button>
        <input ref={fileRef} type="file" accept="audio/*" multiple hidden onChange={addAudioFiles} />
      </div>
      {audios.length > 0 && (
        <div className="attach-row">
          {audios.map((_, i) => (
            <span key={i} className="tag">
              🎙 녹음 {i + 1}
              <button className="attach-x" onClick={() => setAudios((p) => p.filter((_, j) => j !== i))}>✕</button>
            </span>
          ))}
        </div>
      )}

      {/* 필기 사진 — 여러 장 */}
      <label className="log-form-label">🖼 필기 사진</label>
      <div className="editor-inline">
        <button type="button" className="pill soft" onClick={() => imgRef.current?.click()}>＋ 사진 추가</button>
        <input
          ref={imgRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          hidden
          onChange={addImageFiles}
        />
      </div>
      {images.length > 0 && (
        <div className="attach-row">
          {images.map((img, i) => (
            <span key={i} className="attach-img">
              <img className="img-thumb" src={img.url} alt="" />
              <button className="attach-x" onClick={() => setImages((p) => p.filter((_, j) => j !== i))}>✕</button>
            </span>
          ))}
        </div>
      )}

      <textarea
        className="log-note-input"
        placeholder="한 줄 메모 (선택)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
      />
      <button className="pill primary" disabled={!canSave} onClick={save}>💾 기록 저장</button>
      {!canSave && <p className="editor-hint">쓰기·녹음·사진·메모 중 하나는 채워 주세요.</p>}
    </div>
  )
}
