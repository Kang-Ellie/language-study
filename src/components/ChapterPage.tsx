// 챕터 학습 화면 — 이 앱의 중심 화면.
// 교재 내용(SectionView)과 내 학습 기록(StudyLogTimeline)을 위아래로 놓고,
// 퀴즈 진입과 완료 표시를 그 사이에 둔다.
import { useEffect, useState } from 'react'
import type { Lesson, Unit } from '../types'
import type { QuizRequest } from '../lib/quiz'
import type { AppState } from '../lib/storage'
import { chapterMastery, pct } from '../lib/progress'
import { lessonAudioFiles } from '../lib/lessonModel'
import { checkAudioFiles } from '../lib/audio'
import QuizScopePicker, { type ScopeChoice } from './QuizScopePicker'
import SectionView from './SectionView'
import StudyLogTimeline from './StudyLogTimeline'
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

export default function ChapterPage({
  books,
  state,
  book,
  chapter,
  isDone,
  onBack,
  onQuiz,
  onMarkDone,
  onEdit,
}: Props) {
  const sections = chapter.sections
  const chapterNo = book.lessons.findIndex((l) => l.id === chapter.id) + 1
  const lang = book.lang // 오디오·이미지 네임스페이스
  const [audioOk, setAudioOk] = useState<Set<string>>(new Set())
  const [showPicker, setShowPicker] = useState(false)

  useEffect(() => {
    const files = lessonAudioFiles(chapter)
    if (files.length > 0) checkAudioFiles({ bookId: book.id, lang }, files).then(setAudioOk)
    else setAudioOk(new Set())
  }, [book.id, lang, chapter])

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

  return (
    <div className="desktop">
      <div className="checker" />
      <div className="desktop-body narrow">
        <div className="win browser-win">
          <div className="win-bar bar-blue">
            <span className="win-dots"><i className="win-dot dot-r" /><i className="win-dot dot-y" /><i className="win-dot dot-g" /></span>
            <span className="win-title">{chapter.title}</span>
            <button className="win-x" onClick={onBack}>×</button>
          </div>
          <div className="url-bar">
            <span className="url-back" onClick={onBack}>‹</span>
            <span className="url-text">shelf://{lang}/{book.id}/{chapterNo}</span>
            <button className="url-edit" onClick={onEdit}>✏️ 편집</button>
          </div>

          <div className="win-body browser-body">
            <h1 className="book-page-title">📑 {chapter.title}</h1>
            {chapter.context && <p className="chapter-context">{chapter.context}</p>}

            {/* 숙달도(퀴즈로 익힌 정도)와 완료 표시는 서로 다른 것이라 따로 보여준다 */}
            {mastery.total > 0 && (
              <div className="mastery-line">
                <div className="mastery-bar"><div className="mastery-fill" style={{ width: `${pct(mastery.ratio)}%` }} /></div>
                <span className="mastery-text">💮 {mastery.mastered}/{mastery.total} 익힘</span>
                {isDone && <span className="tag mine">📌 완료 표시</span>}
              </div>
            )}

            {sections.map((section) => (
              <SectionView
                key={section.id}
                book={book}
                chapter={chapter}
                section={section}
                audioOk={audioOk}
                state={state}
              />
            ))}

            <div className="chapter-actions">
              <button className="pill primary big" onClick={() => setShowPicker(true)}>🎯 퀴즈로 복습</button>
              <button className={`pill big ${isDone ? 'soft' : ''}`} onClick={onMarkDone}>
                {isDone ? '✅ 완료됨 (다시 누르면 취소)' : '📌 오늘 학습 완료로 표시'}
              </button>
            </div>

            <hr className="divider" />

            <StudyLogTimeline lang={lang} chapterId={chapter.id} />
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
      <Taskbar label={`${book.title} · ${chapter.title}`} onStart={onBack} />
    </div>
  )
}
