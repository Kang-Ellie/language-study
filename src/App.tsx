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
import { defaultRequest, type QuizRequest } from './lib/quiz'
import { booksOfLang, getAllBooks } from './lib/books'
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
  // 퀴즈는 범위(request)와 함께 두 가지를 따로 들고 다닌다.
  //   from*      끝난 뒤 돌아갈 화면 (소단원 퀴즈를 챕터에서 시작했으면 챕터로 돌아가야 한다)
  //   markChapterId  완료 표시를 켤 챕터 — '이 챕터' 범위일 때만.
  //                  교재 전체 퀴즈가 챕터를 완료로 만들면 안 된다.
  | { name: 'lesson'; request: QuizRequest; fromBookId?: string; fromChapterId?: string; markChapterId?: string }
  | { name: 'done'; result: LessonResult; fromBookId?: string; fromChapterId?: string }
  | { name: 'profile' }

/** 책과 챕터를 id로 찾는다. 못 찾으면 undefined */
function locate(books: Unit[], bookId: string, chapterId?: string): { book?: Unit; chapter?: Lesson } {
  const book = books.find((u) => u.id === bookId)
  if (!book) return {}
  if (chapterId === undefined) return { book }
  return { book, chapter: book.lessons.find((l) => l.id === chapterId) }
}

export default function App({ report }: { report?: MigrationReport }) {
  const [state, setState] = useState<AppState>(loadState)
  const [view, setView] = useState<View>({ name: 'shelf' })
  const [bookVer, setBookVer] = useState(0) // 책 편집 후 새로고침용
  // 학습 기록은 localStorage에 있어 리액트가 변경을 모른다 — 챕터를 떠날 때 세어 준다
  const [logVer, setLogVer] = useState(0)
  const [notice, setNotice] = useState<string[]>(report?.ran ? (report.notes ?? []) : [])

  useEffect(() => {
    saveState(state)
  }, [state])

  // 모든 책 (내장 + 내 책). 언어 필터는 화면에서 건다.
  // bookVer는 localStorage 변경을 알리는 신호다 — eslint는 외부 저장소를 모른다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allBooks = useMemo(() => getAllBooks(), [bookVer])
  const langBooks = useMemo(() => booksOfLang(allBooks, state.lang), [allBooks, state.lang])

  function finishLesson(result: LessonResult, from: { bookId?: string; chapterId?: string }, markChapterId?: string) {
    setState((s) => {
      let next = recordStudy(s, result.xp)
      if (result.isReview) {
        next = { ...next, hearts: MAX_HEARTS } // 복습 완료 → 하트 회복
      } else if (markChapterId !== undefined) {
        next = recordChapterQuiz(next, markChapterId)
      }
      return next
    })
    setView({ name: 'done', result, fromBookId: from.bookId, fromChapterId: from.chapterId })
  }

  /** 퀴즈·결과 화면에서 돌아갈 곳 */
  function backFrom(bookId?: string, chapterId?: string) {
    if (bookId && chapterId) setView({ name: 'chapter', bookId, chapterId })
    else if (bookId) setView({ name: 'book', bookId })
    else setView({ name: 'shelf' })
  }

  /** 범위 선택 결과 → 퀴즈 화면 이동 */
  function startQuiz(request: QuizRequest, from: { bookId: string; chapterId?: string }) {
    setView({
      name: 'lesson',
      request,
      fromBookId: from.bookId,
      fromChapterId: from.chapterId,
      markChapterId: request.scope.type === 'chapter' ? request.scope.chapterId : undefined,
    })
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

  if (view.name === 'lesson') {
    const from = { bookId: view.fromBookId, chapterId: view.fromChapterId }
    const found = view.fromBookId ? locate(allBooks, view.fromBookId, view.fromChapterId) : {}
    return (
      <LessonScreen
        lang={state.lang}
        books={langBooks}
        book={found.book}
        lesson={found.chapter}
        request={view.request}
        isReview={view.request.scope.type === 'review'}
        state={state}
        setState={setState}
        onExit={() => backFrom(from.bookId, from.chapterId)}
        onFinish={(result) => finishLesson(result, from, view.markChapterId)}
      />
    )
  }

  if (view.name === 'done') {
    return (
      <Complete
        result={view.result}
        state={state}
        onContinue={() => backFrom(view.fromBookId, view.fromChapterId)}
      />
    )
  }

  if (view.name === 'profile') {
    return <Profile state={state} setState={setState} books={langBooks} onBack={() => setView({ name: 'shelf' })} />
  }

  if (view.name === 'edit') {
    const book = view.bookId ? allBooks.find((u) => u.id === view.bookId) : undefined
    return (
      <Editor
        lang={state.lang}
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
    const { book, chapter } = locate(allBooks, view.bookId, view.chapterId)
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
        book={book}
        chapter={chapter}
        isDone={isChapterDone(state, chapter.id)}
        onBack={() => setView({ name: 'book', bookId: book.id })}
        books={langBooks}
        state={state}
        onQuiz={(request) => startQuiz(request, { bookId: book.id, chapterId: chapter.id })}
        onMarkDone={() => setState((s) => toggleChapterDone(s, chapter.id))}
        onLogChange={() => setLogVer((v) => v + 1)}
        onEdit={() => setView({ name: 'edit', bookId: book.id })}
      />
    )
  }

  if (view.name === 'book') {
    const book = allBooks.find((u) => u.id === view.bookId)
    if (!book) {
      setView({ name: 'shelf' })
      return null
    }
    return (
      <BookPage
        books={langBooks}
        book={book}
        state={state}
        onQuiz={(request) => startQuiz(request, { bookId: book.id })}
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
      books={langBooks}
      logVersion={logVer}
      onOpenBook={(bookId) => setView({ name: 'book', bookId })}
      onNewBook={() => setView({ name: 'edit' })}
      onStartReview={() => setView({ name: 'lesson', request: defaultRequest({ type: 'review' }) })}
      onProfile={() => setView({ name: 'profile' })}
    />
  )
}
