import { useEffect, useState } from 'react'
import type { Unit } from '../types'
import type { QuizRequest } from '../lib/quiz'
import QuizScopePicker, { type ScopeChoice } from './QuizScopePicker'
import SectionView from './SectionView'
import { bookFill, bookMastery, chapterMastery, pct, sectionHasContent } from '../lib/progress'
import { doneChapterCount, isChapterDone, type AppState } from '../lib/storage'
import { checkAudioFiles } from '../lib/audio'
import { bookAudioFiles } from '../lib/lessonModel'
import { bookLogDays } from '../lib/studyLog'
import { SOURCE_LABEL } from './Shelf'
import Taskbar from './Taskbar'

interface Props {
  books: Unit[]
  book: Unit
  state: AppState
  onQuiz: (request: QuizRequest) => void
  onBack: () => void
  onOpenChapter: (chapterId: string) => void
  onEdit: () => void
}

export default function BookPage({ books, book, state, onQuiz, onBack, onOpenChapter, onEdit }: Props) {
  const [tab, setTab] = useState<'chapters' | 'content'>('chapters')
  const [showPicker, setShowPicker] = useState(false)
  const [audioOk, setAudioOk] = useState<Set<string>>(new Set())
  const lang = book.lang // 오디오·이미지 네임스페이스

  const chapterIds = book.lessons.map((l) => l.id)
  const done = doneChapterCount(state, chapterIds)
  // "이어서" 버튼이 가리킬 챕터 = 아직 완료 표시가 없는 첫 챕터
  const nextChapter = book.lessons.find((l) => !isChapterDone(state, l.id)) ?? book.lessons[0]
  const logDays = bookLogDays(chapterIds)
  const mastery = bookMastery(book, state)
  const fill = bookFill(book)

  useEffect(() => {
    const files = bookAudioFiles(book)
    if (files.length > 0) checkAudioFiles({ bookId: book.id, lang }, files).then(setAudioOk)
  }, [book, lang])

  const scopeChoices: ScopeChoice[] = [
    { scope: { type: 'book', bookId: book.id }, label: `📚 교재 전체 — ${book.title}` },
    ...book.lessons.map((l) => ({ scope: { type: 'chapter' as const, chapterId: l.id }, label: `📑 ${l.title}` })),
    { scope: { type: 'review' }, label: '🔔 오늘 복습할 것' },
    { scope: { type: 'wrong', days: 7 }, label: '🥀 최근 일주일 틀린 것' },
  ]

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
                <div className="book-progress-text">📌 {done}/{book.lessons.length} 챕터 완료 {logDays > 0 && `· 📝 ${logDays}일 기록`}</div>
                {mastery.total > 0 && (
                  <div className="book-progress-text">💮 {mastery.mastered}/{mastery.total} 익힘 ({pct(mastery.ratio)}%)</div>
                )}
                {/* 교재를 얼마나 채웠는지 — 다 채운 책에는 굳이 안 보여준다 */}
                {fill.ratio < 1 && (
                  <div className="book-progress-text fill-line">
                    ✏️ 소단원 {fill.filled}/{fill.total} 채움 — 빈 곳은 점선으로 표시돼요
                  </div>
                )}
              </div>
            </div>

            {nextChapter && (
              <button className="pill primary big" onClick={() => onOpenChapter(nextChapter.id)}>
                {done === 0 ? '📖 학습 시작하기' : done >= book.lessons.length ? '💮 다시 보기' : `⭐️ 이어서 — ${nextChapter.title}`}
              </button>
            )}

            <button className="pill big" onClick={() => setShowPicker(true)}>🎯 이 교재로 퀴즈</button>

            <div className="book-tabs">
              <button className={`pill ${tab === 'chapters' ? 'active' : ''}`} onClick={() => setTab('chapters')}>📑 챕터</button>
              <button className={`pill ${tab === 'content' ? 'active' : ''}`} onClick={() => setTab('content')}>📖 내용 보기</button>
            </div>

            {tab === 'chapters' ? (
              <div className="chapter-list">
                {book.lessons.map((lesson) => {
                  const isDone = isChapterDone(state, lesson.id)
                  const isNext = lesson.id === nextChapter?.id && !isDone
                  const cm = chapterMastery(book, lesson, state)
                  const emptyCount = lesson.sections.filter((s) => !sectionHasContent(s)).length
                  return (
                    <button key={lesson.id} className={`node ${isDone ? 'done' : ''} ${isNext ? 'next' : ''}`} onClick={() => onOpenChapter(lesson.id)}>
                      <span className="node-icon">{isDone ? '🌸' : isNext ? '⭐️' : '📄'}</span>
                      <span className="node-label">
                        {lesson.title}
                        {lesson.context && <span className="node-context"> · {lesson.context}</span>}
                        {/* 숙달도는 완료 표시와 별개 — 퀴즈로 익힌 만큼만 찬다 */}
                        {cm.total > 0 && (
                          <span className="node-bar"><span className="node-bar-fill" style={{ width: `${pct(cm.ratio)}%` }} /></span>
                        )}
                      </span>
                      <span className="node-count">
                        {cm.total > 0 ? `💮 ${pct(cm.ratio)}%` : emptyCount > 0 ? '비어 있음' : '0개'}
                      </span>
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
                      <SectionView
                        key={section.id}
                        book={book}
                        chapter={lesson}
                        section={section}
                        audioOk={audioOk}
                      />
                    ))}
                  </div>
                ))}
                <p className="vocab-hint">🔊 는 mp3가 있는 항목이에요. 편집 화면에서 파일을 업로드하거나 <code>public/audio/{lang}/</code> 폴더에 넣으면 켜집니다.</p>
              </div>
            )}
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
      <Taskbar label={book.title} onStart={onBack} />
    </div>
  )
}
