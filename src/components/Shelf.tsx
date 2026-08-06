import type { Unit } from '../types'
import { doneChapterCount, type AppState } from '../lib/storage'
import { LANGUAGES } from '../data'
import { dueItems } from '../lib/srs'
import { isCustomBook } from '../lib/books'
import { bookMastery, pct } from '../lib/progress'
import CheckInCard from './CheckInCard'
import Marquee from './Marquee'
import Taskbar from './Taskbar'

interface Props {
  state: AppState
  /** 학습 기록 변경 신호 — 인증 카드가 다시 세도록 */
  logVersion: number
  setState: (fn: (s: AppState) => AppState) => void
  books: Unit[] // 지금 선택된 언어의 책만
  onOpenBook: (bookId: string) => void
  onNewBook: () => void
  onStartReview: () => void
  onProfile: () => void
}

export const SOURCE_LABEL: Record<string, string> = {
  book: '📖 책',
  drama: '🎬 드라마',
  movie: '🎞 영화',
  anime: '✨ 애니',
  textbook: '📘 교재',
}

// 창 제목표시줄 색을 책마다 번갈아 (핑크/블루/퍼플/옐로)
const BARS = ['bar-pink', 'bar-blue', 'bar-purple', 'bar-yellow']

function exeName(book: { id: string }): string {
  const base = book.id.replace(/^[a-z]+-/, '').replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase().slice(0, 16)
  return `${base || 'BOOK'}.EXE`
}

export default function Shelf({ state, setState, books, logVersion, onOpenBook, onNewBook, onStartReview, onProfile }: Props) {
  const due = dueItems(state, books)
  const language = LANGUAGES.find((l) => l.id === state.lang) ?? LANGUAGES[0]
  const goalPct = Math.min(100, Math.round((state.xpToday / state.dailyGoal) * 100))

  return (
    <div className="desktop">
      <Marquee items={['📚 MY BOOKSHELF', `🔥 STREAK ${state.streak}`, '✦ 오프라인 학습', '✦ 책 + mp3', `✨ ${state.xp} XP`, '✦ ADD YOUR OWN BOOK']} />
      <div className="checker" />

      <div className="desktop-body">
        {/* 히어로 창 */}
        <div className="win hero-win">
          <div className="win-bar bar-pink">
            <span className="win-dots"><i className="win-dot dot-r" /><i className="win-dot dot-y" /><i className="win-dot dot-g" /></span>
            <span className="win-title">WELCOME_2_MY_SHELF.HTML</span>
            <button className="win-x" onClick={onProfile} title="프로필">👤</button>
          </div>
          <div className="win-body hero-body">
            <div className="course-tabs">
              {LANGUAGES.map((l) => (
                <button key={l.id} className={`pill ${l.id === state.lang ? 'active' : ''}`} onClick={() => setState((s) => ({ ...s, lang: l.id }))}>
                  {l.flag} {l.name}
                </button>
              ))}
            </div>
            <h1 className="hero-title">MY <span className="grad">BOOKSHELF</span></h1>
            <p className="hero-sub">책 한 권으로 공부해요 · 단어랑 본문, mp3까지 📖🔊</p>
            <div className="hero-chips">
              <span className="chip chip-blue">🔥 스트릭 {state.streak}</span>
              <span className="chip chip-pink">✨ {state.xpToday}/{state.dailyGoal} XP</span>
              {state.heartsEnabled && <span className="chip chip-green">💗 {state.hearts}</span>}
            </div>
            <div className="goal-bar"><div className="goal-fill" style={{ width: `${goalPct}%` }} /></div>

            {/* 스터디 인증 — 퀴즈 XP보다 위. 이게 매일 하는 약속이다 */}
            <CheckInCard state={state} version={logVersion} />
            {due.length > 0 && (
              <button className="review-banner" onClick={onStartReview}>
                🔔 복습할 것 <b>{due.length}개</b> — 잊기 전에 복습해요! {state.heartsEnabled && state.hearts < 5 ? '(💗 회복)' : ''}
              </button>
            )}
          </div>
        </div>

        {/* 책 = .EXE 창들 */}
        <div className="win-grid">
          {books.map((book, i) => {
            const done = doneChapterCount(state, book.lessons.map((l) => l.id))
            const total = book.lessons.length
            const donePct = total > 0 ? Math.round((done / total) * 100) : 0
            const custom = isCustomBook(book.id)
            const mastery = bookMastery(book, state)
            return (
              <button key={book.id} className="win book-win" onClick={() => onOpenBook(book.id)}>
                <div className={`win-bar ${BARS[i % BARS.length]}`}>
                  <span className="win-dots"><i className="win-dot dot-r" /><i className="win-dot dot-y" /><i className="win-dot dot-g" /></span>
                  <span className="win-title">{exeName(book)}</span>
                  <span className="win-x static">×</span>
                </div>
                <div className="win-body book-body">
                  <div className="book-cover-emoji">{book.emoji}</div>
                  <div className="book-win-title">{book.title}</div>
                  <div className="book-tags">
                    {book.track === 'foundation' && <span className="tag">🌱 기초</span>}
                    {book.track === 'vocab' && <span className="tag">📇 단어장</span>}
                    {book.track === 'media' && book.sourceType && <span className="tag">{SOURCE_LABEL[book.sourceType]}</span>}
                    {custom && <span className="tag mine">✏️ 내 편집</span>}
                  </div>
                  <div className="book-progress-bar"><div className="book-progress-fill" style={{ width: `${donePct}%` }} /></div>
                  <div className="book-foot">
                    {/* 진도(내가 완료 표시한 챕터)와 숙달도(퀴즈로 익힌 것)는 다른 값이다 */}
                    <span>📌 {done}/{total} 챕터{mastery.mastered > 0 && ` · 💮 ${pct(mastery.ratio)}%`}</span>
                    <span className="open-link">OPEN →</span>
                  </div>
                </div>
              </button>
            )
          })}

          {/* 새 책 — 다른 책 카드와 같은 골격을 쓴다. 커버만 점선 빈 칸으로. */}
          <button className="win book-win new-book" onClick={onNewBook}>
            <div className="win-bar bar-dashed">
              <span className="win-dots"><i className="win-dot dot-r" /><i className="win-dot dot-y" /><i className="win-dot dot-g" /></span>
              <span className="win-title">NEW_BOOK.EXE</span>
              <span className="win-x static">＋</span>
            </div>
            <div className="win-body book-body">
              <div className="book-cover-emoji new-cover" aria-hidden>＋</div>
              <div className="book-win-title">새 책 추가</div>
              <div className="book-tags">
                <span className="tag">✏️ 직접 만들기</span>
                <span className="tag">🤖 AI JSON</span>
              </div>
              {/* 다른 카드의 진행바 자리 — 비워 두면 카드 높이가 어긋난다 */}
              <div className="book-progress-bar ghost" />
              <div className="book-foot">
                <span>교재를 통째로 붙여넣어도 돼요</span>
                <span className="open-link">START →</span>
              </div>
            </div>
          </button>
        </div>
      </div>

      <Taskbar label={`${language.flag} ${language.name} 책장`} onStart={onProfile} />
    </div>
  )
}
