import { useEffect, useRef, useState } from 'react'
import type { Course, Lesson, Unit } from '../types'
import { lessonAudioFiles } from '../lib/lessonModel'
import { checkAudioFiles, playMp3 } from '../lib/audio'
import { today } from '../lib/storage'
import { addLogEntry, deleteLogEntry, loadLog, logNamespace, type LogEntry } from '../lib/studyLog'
import ImageThumb from './ImageThumb'
import RecordButton from './RecordButton'
import Taskbar from './Taskbar'

interface Props {
  course: Course
  book: Unit
  chapter: Lesson
  isDone: boolean
  onBack: () => void
  onQuiz: () => void
  onMarkDone: () => void
  onEdit: () => void
}

export default function ChapterPage({ course, book, chapter, isDone, onBack, onQuiz, onMarkDone, onEdit }: Props) {
  const lesson = chapter
  const sections = chapter.sections
  const chapterNo = book.lessons.findIndex((l) => l.id === chapter.id) + 1
  const [audioOk, setAudioOk] = useState<Set<string>>(new Set())
  const [log, setLog] = useState<LogEntry[]>([])
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    const files = lessonAudioFiles(chapter)
    if (files.length > 0) checkAudioFiles(course.id, files).then(setAudioOk)
    refreshLog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, chapter.id])

  function refreshLog() {
    setLog(loadLog(chapter.id))
  }

  async function saveEntry(input: { date: string; note?: string; audioBlob?: Blob; audioExt?: string; imageBlob?: Blob }) {
    await addLogEntry(course.id, chapter.id, input)
    refreshLog()
    setShowForm(false)
  }

  const Speaker = ({ file, label }: { file?: string; label?: string }) =>
    file && audioOk.has(file) ? (
      <button className="spk" onClick={() => playMp3(course.id, file)} title={label}>🔊</button>
    ) : (
      <span className="spk off">·</span>
    )

  return (
    <div className="desktop">
      <div className="checker" />
      <div className="desktop-body narrow">
        <div className="win browser-win">
          <div className="win-bar bar-blue">
            <span className="win-dots"><i className="win-dot dot-r" /><i className="win-dot dot-y" /><i className="win-dot dot-g" /></span>
            <span className="win-title">{lesson.title}</span>
            <button className="win-x" onClick={onBack}>×</button>
          </div>
          <div className="url-bar">
            <span className="url-back" onClick={onBack}>‹</span>
            <span className="url-text">shelf://{course.id}/{book.id}/{chapterNo}</span>
            <button className="url-edit" onClick={onEdit}>✏️ 편집</button>
          </div>

          <div className="win-body browser-body">
            <h1 className="book-page-title">📑 {lesson.title}</h1>
            {lesson.context && <p className="chapter-context">{lesson.context}</p>}

            {sections.map((section) => (
              <div key={section.id} className="study-section">
                {section.title && <div className="content-sec-title">📂 {section.title}</div>}

                {(section.images ?? []).length > 0 && (
                  <div className="img-gallery">
                    {section.images!.map((img, i) => (
                      <ImageThumb key={i} ns={course.id} file={img} className="gallery-thumb" />
                    ))}
                  </div>
                )}

                {section.passageText && (
                  <div className="passage-block">
                    <div className="content-kind">
                      📖 본문
                      {section.passageAudio && audioOk.has(section.passageAudio) && (
                        <button className="spk inline" onClick={() => playMp3(course.id, section.passageAudio!)}>🔊 전체 듣기</button>
                      )}
                    </div>
                    <p className="passage-text">{section.passageText}</p>
                    {section.passageTranslation && <p className="passage-translation">{section.passageTranslation}</p>}
                  </div>
                )}

                {section.passages.length > 0 && (
                  <>
                    <div className="content-kind">🔎 문장별 보기 (퀴즈·개별듣기용)</div>
                    {section.passages.map((p) => (
                      <div key={p.id} className="vrow">
                        <Speaker file={p.audio} label="선생님 녹음" />
                        <div className="vtext">
                          {p.reading && <span className="vreading">{p.reading}</span>}
                          <span className="vmain">{p.text}</span>
                        </div>
                        <div className="vmean">{p.meaning}</div>
                      </div>
                    ))}
                  </>
                )}

                {section.words.length > 0 && (
                  <>
                    <div className="content-kind">🔤 새단어</div>
                    {section.words.map((w) => (
                      <div key={w.id} className="vrow">
                        <Speaker file={w.audio} />
                        <div className="vtext">
                          {w.reading && <span className="vreading">{w.reading}</span>}
                          <span className="vmain">{w.text}</span>
                        </div>
                        <div className="vmean">{w.meaning}</div>
                      </div>
                    ))}
                  </>
                )}

                {section.grammar.length > 0 && (
                  <>
                    <div className="content-kind">📐 문법</div>
                    {section.grammar.map((g) => (
                      <div key={g.id} className="grammar-box">
                        <div className="grammar-point">{g.point}</div>
                        {g.explanation && <div className="grammar-explain">{g.explanation}</div>}
                        {g.examples.map((ex) => (
                          <div key={ex.id} className="vrow example">
                            <Speaker file={ex.audio} />
                            <div className="vtext"><span className="vmain">{ex.text}</span></div>
                            <div className="vmean">{ex.meaning}</div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </>
                )}
              </div>
            ))}

            <div className="chapter-actions">
              <button className="pill primary big" onClick={onQuiz}>🎯 퀴즈로 복습</button>
              <button className={`pill big ${isDone ? 'soft' : ''}`} onClick={onMarkDone}>
                {isDone ? '✅ 완료됨 (다시 누르면 취소)' : '📌 오늘 학습 완료로 표시'}
              </button>
            </div>

            <hr className="divider" />

            <div className="log-head">
              <h2 className="log-title">📝 내 학습 기록</h2>
              <button className="pill soft" onClick={() => setShowForm((v) => !v)}>{showForm ? '접기' : '＋ 오늘 기록 추가'}</button>
            </div>

            {showForm && <LogForm courseId={course.id} onSave={saveEntry} />}

            <div className="log-timeline">
              {log.length === 0 && <p className="log-empty">아직 기록이 없어요. 녹음하거나 필기 사진을 남겨보세요 🌸</p>}
              {log.map((entry) => (
                <div key={entry.id} className="log-card">
                  <div className="log-card-top">
                    <span className="log-date">🗓 {entry.date}</span>
                    <button className="mini-del" onClick={() => { deleteLogEntry(chapter.id, entry.id); refreshLog() }}>🗑</button>
                  </div>
                  {entry.audioFile && (
                    <button className="pill soft" onClick={() => playMp3(logNamespace(course.id), entry.audioFile!)}>🔊 내 녹음 듣기</button>
                  )}
                  {entry.imageFile && <ImageThumb ns={logNamespace(course.id)} file={entry.imageFile} className="log-image" />}
                  {entry.note && <p className="log-note">{entry.note}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <Taskbar label={`${book.title} · ${lesson.title}`} onStart={onBack} />
    </div>
  )
}

function LogForm({
  courseId,
  onSave,
}: {
  courseId: string
  onSave: (input: { date: string; note?: string; audioBlob?: Blob; audioExt?: string; imageBlob?: Blob }) => void
}) {
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
    onSave({ date, note: note.trim() || undefined, audioBlob: audio?.blob, audioExt: audio?.ext, imageBlob: imageBlob ?? undefined })
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
      <textarea className="log-note-input" placeholder="한 줄 메모 (선택)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      <button className="pill primary" onClick={save}>💾 기록 저장</button>
    </div>
  )
}
