import { useEffect, useState } from 'react'
import type { Unit } from '../types'
import { doneChapterCount, isChapterDone, type AppState } from '../lib/storage'
import { checkAudioFiles, playMp3 } from '../lib/audio'
import { bookAudioFiles } from '../lib/lessonModel'
import { bookLogDays } from '../lib/studyLog'
import { SOURCE_LABEL } from './Shelf'
import ImageThumb from './ImageThumb'
import Taskbar from './Taskbar'

interface Props {
  book: Unit
  state: AppState
  onBack: () => void
  onOpenChapter: (chapterId: string) => void
  onEdit: () => void
}

export default function BookPage({ book, state, onBack, onOpenChapter, onEdit }: Props) {
  const [tab, setTab] = useState<'chapters' | 'content'>('chapters')
  const [audioOk, setAudioOk] = useState<Set<string>>(new Set())
  const lang = book.lang // 오디오·이미지 네임스페이스

  const chapterIds = book.lessons.map((l) => l.id)
  const done = doneChapterCount(state, chapterIds)
  // "이어서" 버튼이 가리킬 챕터 = 아직 완료 표시가 없는 첫 챕터
  const nextChapter = book.lessons.find((l) => !isChapterDone(state, l.id)) ?? book.lessons[0]
  const logDays = bookLogDays(chapterIds)

  useEffect(() => {
    const files = bookAudioFiles(book)
    if (files.length > 0) checkAudioFiles(lang, files).then(setAudioOk)
  }, [book, lang])

  const Speaker = ({ file }: { file?: string }) =>
    file && audioOk.has(file) ? (
      <button className="spk" onClick={() => playMp3(lang, file)}>🔊</button>
    ) : (
      <span className="spk off">·</span>
    )

  return (
    <div className="desktop">
      <div className="checker" />
      <div className="desktop-body narrow">
        <div className="win browser-win">
          <div className="win-bar bar-pink">
            <span className="win-dots"><i className="win-dot dot-r" /><i className="win-dot dot-y" /><i className="win-dot dot-g" /></span>
            <span className="win-title">{book.title}</span>
            <button className="win-x" onClick={onBack}>×</button>
          </div>
          {/* 주소창 */}
          <div className="url-bar">
            <span className="url-back" onClick={onBack}>‹</span>
            <span className="url-text">shelf://{book.lang}/{book.id}</span>
            <button className="url-edit" onClick={onEdit}>✏️ 편집</button>
          </div>

          <div className="win-body browser-body">
            <div className="book-head">
              <div className="book-cover-emoji big">{book.emoji}</div>
              <div>
                <h1 className="book-page-title">{book.title}</h1>
                {book.sourceTitle && <div className="book-source-line">{book.sourceType ? SOURCE_LABEL[book.sourceType] : ''} {book.sourceTitle}</div>}
                <div className="book-progress-text">{done}/{book.lessons.length} 챕터 완료 {logDays > 0 && `· 📝 ${logDays}일 기록`}</div>
              </div>
            </div>

            {nextChapter && (
              <button className="pill primary big" onClick={() => onOpenChapter(nextChapter.id)}>
                {done === 0 ? '📖 학습 시작하기' : done >= book.lessons.length ? '💮 다시 보기' : `⭐️ 이어서 — ${nextChapter.title}`}
              </button>
            )}

            <div className="book-tabs">
              <button className={`pill ${tab === 'chapters' ? 'active' : ''}`} onClick={() => setTab('chapters')}>📑 챕터</button>
              <button className={`pill ${tab === 'content' ? 'active' : ''}`} onClick={() => setTab('content')}>📖 내용 보기</button>
            </div>

            {tab === 'chapters' ? (
              <div className="chapter-list">
                {book.lessons.map((lesson) => {
                  const isDone = isChapterDone(state, lesson.id)
                  const isNext = lesson.id === nextChapter?.id && !isDone
                  const wc = lesson.sections.reduce((n, s) => n + s.words.length, 0)
                  return (
                    <button key={lesson.id} className={`node ${isDone ? 'done' : ''} ${isNext ? 'next' : ''}`} onClick={() => onOpenChapter(lesson.id)}>
                      <span className="node-icon">{isDone ? '🌸' : isNext ? '⭐️' : '📄'}</span>
                      <span className="node-label">
                        {lesson.title}
                        {lesson.context && <span className="node-context"> · {lesson.context}</span>}
                      </span>
                      <span className="node-count">{wc}단어</span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="content-view">
                {book.lessons.map((lesson) => (
                  <div key={lesson.id} className="content-chapter">
                    <h3 className="content-ch-title">📑 {lesson.title}</h3>
                    {lesson.sections.map((section) => (
                      <div key={section.id} className="content-section">
                        {section.title && <div className="content-sec-title">📂 {section.title}</div>}

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
                            <div className="content-kind">🔎 문장별 보기</div>
                            {section.passages.map((p) => (
                              <div key={p.id} className="vrow">
                                <Speaker file={p.audio} />
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
                  </div>
                ))}
                <p className="vocab-hint">🔊 는 mp3가 있는 항목이에요. 편집 화면에서 파일을 업로드하거나 <code>public/audio/{lang}/</code> 폴더에 넣으면 켜집니다.</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <Taskbar label={book.title} onStart={onBack} />
    </div>
  )
}
