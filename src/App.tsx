import { useEffect, useMemo, useState } from 'react'
import type { LessonResult, Lesson, Unit } from './types'
import {
  loadState,
  saveState,
  recordStudy,
  recordChapterQuiz,
  toggleChapterDone,
  isChapterDone,
  MAX_HEARTS,
  type AppState,
} from './lib/storage'
import type { MigrationReport } from './lib/migrate'
import { getMergedCourse } from './lib/books'
import Shelf from './components/Shelf'
import BookPage from './components/BookPage'
import ChapterPage from './components/ChapterPage'
import LessonScreen from './components/LessonScreen'
import Complete from './components/Complete'
import Profile from './components/Profile'
import Editor from './components/Editor'

// 화면 참조는 배열 인덱스가 아니라 id다 — 챕터를 끼워 넣거나 순서를 바꿔도 어긋나지 않는다.
type View =
  | { name: 'shelf' }
  | { name: 'book'; bookId: string }
  | { name: 'chapter'; bookId: string; chapterId: string }
  | { name: 'edit'; bookId?: string } // bookId 없으면 새 책
  | { name: 'lesson'; bookId: string; chapterId: string }
  | { name: 'review' }
  | { name: 'done'; result: LessonResult; bookId?: string; chapterId?: string }
  | { name: 'profile' }

/** 책과 챕터를 id로 찾는다. 못 찾으면 undefined */
function locate(units: Unit[], bookId: string, chapterId?: string): { book?: Unit; chapter?: Lesson } {
  const book = units.find((u) => u.id === bookId)
  if (!book) return {}
  if (chapterId === undefined) return { book }
  return { book, chapter: book.lessons.find((l) => l.id === chapterId) }
}

export default function App({ report }: { report?: MigrationReport }) {
  const [state, setState] = useState<AppState>(loadState)
  const [view, setView] = useState<View>({ name: 'shelf' })
  const [bookVer, setBookVer] = useState(0) // 책 편집 후 새로고침용
  const [notice, setNotice] = useState<string[]>(report?.ran ? (report.notes ?? []) : [])

  useEffect(() => {
    saveState(state)
  }, [state])

  const course = useMemo(() => getMergedCourse(state.courseId), [state.courseId, bookVer])

  function finishLesson(result: LessonResult, bookId?: string, chapterId?: string) {
    setState((s) => {
      let next = recordStudy(s, result.xp)
      if (result.isReview) {
        next = { ...next, hearts: MAX_HEARTS } // 복습 완료 → 하트 회복
      } else if (chapterId !== undefined) {
        next = recordChapterQuiz(next, chapterId)
      }
      return next
    })
    setView({ name: 'done', result, bookId, chapterId })
  }

  if (notice.length > 0) {
    return (
      <div className="page center">
        <div className="modal">
          <div className="modal-emoji">🧰</div>
          <h3>저장된 기록을 새 방식으로 옮겼어요</h3>
          {notice.map((n, i) => (
            <p key={i}>{n}</p>
          ))}
          <p className="editor-hint">
            옮기기 전 원본은 그대로 보관돼 있어요. 문제가 있으면 프로필 · 통계에서 백업을 먼저 내보내 주세요.
          </p>
          <button className="btn primary big" onClick={() => setNotice([])}>확인</button>
        </div>
      </div>
    )
  }

  if (view.name === 'lesson' || view.name === 'review') {
    const found = view.name === 'lesson' ? locate(course.units, view.bookId, view.chapterId) : {}
    return (
      <LessonScreen
        course={course}
        unit={found.book}
        lesson={found.chapter}
        isReview={view.name === 'review'}
        state={state}
        setState={setState}
        onExit={() =>
          view.name === 'lesson'
            ? setView({ name: 'chapter', bookId: view.bookId, chapterId: view.chapterId })
            : setView({ name: 'shelf' })
        }
        onFinish={(result) =>
          finishLesson(
            result,
            view.name === 'lesson' ? view.bookId : undefined,
            view.name === 'lesson' ? view.chapterId : undefined
          )
        }
      />
    )
  }

  if (view.name === 'done') {
    return (
      <Complete
        result={view.result}
        state={state}
        onContinue={() =>
          view.bookId && view.chapterId
            ? setView({ name: 'chapter', bookId: view.bookId, chapterId: view.chapterId })
            : view.bookId
              ? setView({ name: 'book', bookId: view.bookId })
              : setView({ name: 'shelf' })
        }
      />
    )
  }

  if (view.name === 'profile') {
    return <Profile state={state} setState={setState} course={course} onBack={() => setView({ name: 'shelf' })} />
  }

  if (view.name === 'edit') {
    const book = view.bookId ? course.units.find((u) => u.id === view.bookId) : undefined
    return (
      <Editor
        course={course}
        initial={book}
        onDone={(savedId) => {
          setBookVer((v) => v + 1)
          setView(savedId ? { name: 'book', bookId: savedId } : { name: 'shelf' })
        }}
        onBack={() => setView(view.bookId ? { name: 'book', bookId: view.bookId } : { name: 'shelf' })}
      />
    )
  }

  if (view.name === 'chapter') {
    const { book, chapter } = locate(course.units, view.bookId, view.chapterId)
    if (!book) {
      setView({ name: 'shelf' })
      return null
    }
    // 편집으로 챕터가 사라졌으면 책 화면으로
    if (!chapter) {
      setView({ name: 'book', bookId: book.id })
      return null
    }
    return (
      <ChapterPage
        course={course}
        book={book}
        chapter={chapter}
        isDone={isChapterDone(state, chapter.id)}
        onBack={() => setView({ name: 'book', bookId: book.id })}
        onQuiz={() => setView({ name: 'lesson', bookId: book.id, chapterId: chapter.id })}
        onMarkDone={() => setState((s) => toggleChapterDone(s, chapter.id))}
        onEdit={() => setView({ name: 'edit', bookId: book.id })}
      />
    )
  }

  if (view.name === 'book') {
    const book = course.units.find((u) => u.id === view.bookId)
    if (!book) {
      setView({ name: 'shelf' })
      return null
    }
    return (
      <BookPage
        course={course}
        book={book}
        state={state}
        onBack={() => setView({ name: 'shelf' })}
        onOpenChapter={(chapterId) => setView({ name: 'chapter', bookId: book.id, chapterId })}
        onEdit={() => setView({ name: 'edit', bookId: book.id })}
      />
    )
  }

  return (
    <Shelf
      state={state}
      setState={setState}
      course={course}
      onOpenBook={(bookId) => setView({ name: 'book', bookId })}
      onNewBook={() => setView({ name: 'edit' })}
      onStartReview={() => setView({ name: 'review' })}
      onProfile={() => setView({ name: 'profile' })}
    />
  )
}
