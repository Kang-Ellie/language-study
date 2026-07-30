import { useEffect, useMemo, useState } from 'react'
import type { LessonResult } from './types'
import { loadState, saveState, recordStudy, MAX_HEARTS, type AppState } from './lib/storage'
import { getMergedCourse } from './lib/books'
import Shelf from './components/Shelf'
import BookPage from './components/BookPage'
import ChapterPage from './components/ChapterPage'
import LessonScreen from './components/LessonScreen'
import Complete from './components/Complete'
import Profile from './components/Profile'
import Editor from './components/Editor'

type View =
  | { name: 'shelf' }
  | { name: 'book'; bookId: string }
  | { name: 'chapter'; bookId: string; lessonIdx: number }
  | { name: 'edit'; bookId?: string } // bookId 없으면 새 책
  | { name: 'lesson'; bookId: string; lessonIdx: number }
  | { name: 'review' }
  | { name: 'done'; result: LessonResult; bookId?: string; lessonIdx?: number }
  | { name: 'profile' }

export default function App() {
  const [state, setState] = useState<AppState>(loadState)
  const [view, setView] = useState<View>({ name: 'shelf' })
  const [bookVer, setBookVer] = useState(0) // 책 편집 후 새로고침용

  useEffect(() => {
    saveState(state)
  }, [state])

  const course = useMemo(() => getMergedCourse(state.courseId), [state.courseId, bookVer])

  function finishLesson(result: LessonResult, bookId?: string, lessonIdx?: number) {
    setState((s) => {
      let next = recordStudy(s, result.xp)
      if (result.isReview) {
        next = { ...next, hearts: MAX_HEARTS } // 복습 완료 → 하트 회복
      } else if (bookId !== undefined && lessonIdx !== undefined) {
        const done = Math.max(next.completed[bookId] ?? 0, lessonIdx + 1)
        next = { ...next, completed: { ...next.completed, [bookId]: done } }
      }
      return next
    })
    setView({ name: 'done', result, bookId, lessonIdx })
  }

  function toggleMarkDone(bookId: string, lessonIdx: number) {
    setState((s) => {
      const cur = s.completed[bookId] ?? 0
      const isDone = cur > lessonIdx
      const done = isDone ? lessonIdx : Math.max(cur, lessonIdx + 1)
      return { ...s, completed: { ...s.completed, [bookId]: done } }
    })
  }

  if (view.name === 'lesson' || view.name === 'review') {
    const book = view.name === 'lesson' ? course.units.find((u) => u.id === view.bookId) : undefined
    return (
      <LessonScreen
        course={course}
        unit={book}
        lessonIdx={view.name === 'lesson' ? view.lessonIdx : 0}
        isReview={view.name === 'review'}
        state={state}
        setState={setState}
        onExit={() =>
          view.name === 'lesson'
            ? setView({ name: 'chapter', bookId: view.bookId, lessonIdx: view.lessonIdx })
            : setView({ name: 'shelf' })
        }
        onFinish={(result) =>
          finishLesson(
            result,
            view.name === 'lesson' ? view.bookId : undefined,
            view.name === 'lesson' ? view.lessonIdx : undefined
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
          view.bookId && view.lessonIdx !== undefined
            ? setView({ name: 'chapter', bookId: view.bookId, lessonIdx: view.lessonIdx })
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
    const book = course.units.find((u) => u.id === view.bookId)
    if (!book) {
      setView({ name: 'shelf' })
      return null
    }
    const done = state.completed[book.id] ?? 0
    return (
      <ChapterPage
        course={course}
        book={book}
        lessonIdx={view.lessonIdx}
        isDone={view.lessonIdx < done}
        onBack={() => setView({ name: 'book', bookId: book.id })}
        onQuiz={() => setView({ name: 'lesson', bookId: book.id, lessonIdx: view.lessonIdx })}
        onMarkDone={() => toggleMarkDone(book.id, view.lessonIdx)}
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
        onOpenChapter={(lessonIdx) => setView({ name: 'chapter', bookId: book.id, lessonIdx })}
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
