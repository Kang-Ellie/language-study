import { useEffect, useRef, useState } from 'react'
import type { Lesson, Unit } from '../types'
import type { QuizRequest } from '../lib/quiz'
import type { AppState } from '../lib/storage'
import QuizScopePicker, { type ScopeChoice } from './QuizScopePicker'
import { chapterMastery, pct, sectionHasContent, sectionMastery } from '../lib/progress'
import { lessonAudioFiles } from '../lib/lessonModel'
import { checkAudioFiles, playMp3 } from '../lib/audio'
import { today } from '../lib/storage'
import { addLogEntry, deleteLogEntry, loadLog, logNamespace, type LogEntry } from '../lib/studyLog'
import ImageThumb from './ImageThumb'
import RecordButton from './RecordButton'
import Taskbar from './Taskbar'

interface Props {
  books: Unit[]
  state: AppState
  book: Unit
  chapter: Lesson
  isDone: boolean
  onBack: () => void
  onQuiz: (request: QuizRequest) => void
  onMarkDone: () => void
  onEdit: () => void
}

export default function ChapterPage({ books, state, book, chapter, isDone, onBack, onQuiz, onMarkDone, onEdit }: Props) {
  const lesson = chapter
  const sections = chapter.sections
  const chapterNo = book.lessons.findIndex((l) => l.id === chapter.id) + 1
  const lang = book.lang // 오디오·이미지 네임스페이스
  const [audioOk, setAudioOk] = useState<Set<string>>(new Set())
  const [log, setLog] = useState<LogEntry[]>([])
  const [showForm, setShowForm] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  useEffect(() => {
    const files = lessonAudioFiles(chapter)
    if (files.length > 0) checkAudioFiles(lang, files).then(setAudioOk)
    refreshLog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, chapter.id])

  function refreshLog() {
    setLog(loadLog(chapter.id))
  }

  async function saveEntry(input: { date: string; note?: string; audioBlob?: Blob; audioExt?: string; imageBlob?: Blob }) {
    await addLogEntry(lang, chapter.id, input)
    refreshLog()
    setShowForm(false)
  }

  // 소단원이 여럿일 때만 소단원 범위를 따로 보여준다 (하나뿐이면 챕터와 같다)
  const scopeChoices: ScopeChoice[] = [
    ...(sections.length > 1
      ? sections.map((s) => ({ scope: { type: 'section' as const, sectionId: s.id }, label: `📂 ${s.title}` }))
      : []),
    { scope: { type: 'chapter', chapterId: chapter.id }, label: `📑 이 챕터 — ${chapter.title}` },
    { scope: { type: 'book', bookId: book.id }, label: `📚 교재 전체 — ${book.title}` },
    { scope: { type: 'review' }, label: '🔔 오늘 복습할 것' },
    { scope: { type: 'wrong', days: 7 }, label: '🥀 최근 일주일 틀린 것' },
  ]

  const mastery = chapterMastery(book, chapter, state)

  const Speaker = ({ file, label }: { file?: string; label?: string }) =>
    file && audioOk.has(file) ? (
      <button className="spk" onClick={() => playMp3(lang, file)} title={label}>🔊</button>
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
            <span className="url-text">shelf://{book.lang}/{book.id}/{chapterNo}</span>
            <button className="url-edit" onClick={onEdit}>✏️ 편집</button>
          </div>

          <div className="win-body browser-body">
            <h1 className="book-page-title">📑 {lesson.title}</h1>
            {lesson.context && <p className="chapter-context">{lesson.context}</p>}

            {/* 숙달도(퀴즈로 익힌 정도)와 완료 표시는 서로 다른 것이라 따로 보여준다 */}
            {mastery.total > 0 && (
              <div className="mastery-line">
                <div className="mastery-bar"><div className="mastery-fill" style={{ width: `${pct(mastery.ratio)}%` }} /></div>
                <span className="mastery-text">💮 {mastery.mastered}/{mastery.total} 익힘</span>
                {isDone && <span className="tag mine">📌 완료 표시</span>}
              </div>
            )}

            {sections.map((section) => {
              const filled = sectionHasContent(section)
              const sm = sectionMastery(book, chapter, section, state)
              // 빈 소단원은 점선 회색 카드로 — "여기 아직 안 채웠다"가 눈에 보이게
              if (!filled) {
                return (
                  <div key={section.id} className="study-section empty-section">
                    <div className="content-sec-title">📂 {section.title}</div>
                    <p className="empty-section-hint">아직 안 채운 곳이에요. ✏️ 편집에서 본문·새단어를 넣어 보세요.</p>
                  </div>
                )
              }
              return (
              <div key={section.id} className="study-section">
                <div className="content-sec-title">
                  📂 {section.title}
                  {sm.total > 0 && <span className="sec-mastery">💮 {sm.mastered}/{sm.total}</span>}
                </div>

                {(section.images ?? []).length > 0 && (
                  <div className="img-gallery">
                    {section.images!.map((img, i) => (
                      <ImageThumb key={i} ns={lang} file={img} className="gallery-thumb" />
                    ))}
                  </div>
                )}

                {section.passageText && (
                  <div className="passage-block">
                    <div className="content-kind">
                      📖 본문
                      {section.passageAudio && audioOk.has(section.passageAudio) && (
                        <button className="spk inline" onClick={() => playMp3(lang, section.passageAudio!)}>🔊 전체 듣기</button>
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
              )
            })}

            <div className="chapter-actions">
              <button className="pill primary big" onClick={() => setShowPicker(true)}>🎯 퀴즈로 복습</button>
              <button className={`pill big ${isDone ? 'soft' : ''}`} onClick={onMarkDone}>
                {isDone ? '✅ 완료됨 (다시 누르면 취소)' : '📌 오늘 학습 완료로 표시'}
              </button>
            </div>

            <hr className="divider" />

            <div className="log-head">
              <h2 className="log-title">📝 내 학습 기록</h2>
              <button className="pill soft" onClick={() => setShowForm((v) => !v)}>{showForm ? '접기' : '＋ 오늘 기록 추가'}</button>
            </div>

            {showForm && <LogForm onSave={saveEntry} />}

            <div className="log-timeline">
              {log.length === 0 && <p className="log-empty">아직 기록이 없어요. 녹음하거나 필기 사진을 남겨보세요 🌸</p>}
              {log.map((entry) => (
                <div key={entry.id} className="log-card">
                  <div className="log-card-top">
                    <span className="log-date">🗓 {entry.date}</span>
                    <button className="mini-del" onClick={() => { deleteLogEntry(chapter.id, entry.id); refreshLog() }}>🗑</button>
                  </div>
                  {entry.audioFile && (
                    <button className="pill soft" onClick={() => playMp3(logNamespace(lang), entry.audioFile!)}>🔊 내 녹음 듣기</button>
                  )}
                  {entry.imageFile && <ImageThumb ns={logNamespace(lang)} file={entry.imageFile} className="log-image" />}
                  {entry.note && <p className="log-note">{entry.note}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {showPicker && (
        <QuizScopePicker
          books={books}
          state={state}
          audioOk={audioOk}
          choices={scopeChoices}
          onClose={() => setShowPicker(false)}
          onStart={(req) => {
            setShowPicker(false)
            onQuiz(req)
          }}
        />
      )}
      <Taskbar label={`${book.title} · ${lesson.title}`} onStart={onBack} />
    </div>
  )
}

function LogForm({
  onSave,
}: {
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
