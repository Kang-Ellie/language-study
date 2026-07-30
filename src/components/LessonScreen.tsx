import { useEffect, useMemo, useRef, useState } from 'react'
import type { Exercise, Lesson, LessonResult, Unit } from '../types'
import type { AppState } from '../lib/storage'
import { updateSrs, type Outcome } from '../lib/srs'
import { buildQuiz, defaultOptions, grade as gradeAnswer, type QuizScope } from '../lib/quiz'
import { bookAudioFiles, lessonAudioFiles } from '../lib/lessonModel'
import { playCorrect, playWrong, playMp3, checkAudioFiles } from '../lib/audio'

interface Props {
  lang: string
  books: Unit[] // 같은 언어의 책 전부 (보기 풀 보충용)
  book?: Unit
  lesson?: Lesson
  isReview: boolean
  state: AppState
  setState: (fn: (s: AppState) => AppState) => void
  onExit: () => void
  onFinish: (result: LessonResult) => void
}

interface Item {
  ex: Exercise
  retry: boolean
}

type Status = 'answering' | 'correct' | 'wrong'

export default function LessonScreen({ lang, books, book, lesson, isReview, state, setState, onExit, onFinish }: Props) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [pos, setPos] = useState(0)
  const [status, setStatus] = useState<Status>('answering')
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [baseTotal, setBaseTotal] = useState(0)
  const [noHearts, setNoHearts] = useState(false)
  const [nearMiss, setNearMiss] = useState(false)

  // 답안 상태
  const [picked, setPicked] = useState<string | null>(null)
  const [tilesPicked, setTilesPicked] = useState<number[]>([])
  const [typed, setTyped] = useState('')
  const soundOn = state.soundOn

  // 문제 생성 (mp3 존재 확인 후)
  useEffect(() => {
    let alive = true
    async function build() {
      // 복습은 책 전체의 오디오를, 챕터 퀴즈는 그 챕터의 오디오만 확인하면 된다
      const files = isReview ? books.flatMap(bookAudioFiles) : lesson ? lessonAudioFiles(lesson) : []
      const ok = files.length > 0 ? await checkAudioFiles(lang, files) : new Set<string>()

      const scope: QuizScope | null = isReview
        ? { type: 'review' }
        : lesson
          ? { type: 'chapter', chapterId: lesson.id }
          : null
      const exercises: Exercise[] = scope ? buildQuiz(books, scope, state, defaultOptions(scope, ok)) : []
      if (alive) {
        setItems(exercises.map((ex) => ({ ex, retry: false })))
        setBaseTotal(exercises.length)
      }
    }
    build()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const current = items?.[pos]

  // 듣기 문제는 등장하자마자 자동 재생
  useEffect(() => {
    if (current && status === 'answering') {
      const ex = current.ex
      if ((ex.kind === 'pick' || ex.kind === 'bank') && ex.audioOnly && ex.promptAudio) {
        playMp3(book?.lang ?? lang, ex.promptAudio)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, items])

  if (!items) return <div className="page center">🌸 준비 중…</div>
  if (items.length === 0)
    return (
      <div className="page center">
        <p>출제할 문제가 없어요.</p>
        <button className="btn primary" onClick={onExit}>돌아가기</button>
      </div>
    )
  if (!current) return null

  const ex = current.ex
  const progress = Math.round((pos / items.length) * 100)

  function canCheck(): boolean {
    if (ex.kind === 'pick') return picked !== null
    if (ex.kind === 'bank') return tilesPicked.length > 0
    if (ex.kind === 'type') return typed.trim().length > 0
    return false
  }

  function checkAnswer() {
    if (ex.kind === 'pick') return gradeAnswer(ex, picked ?? '')
    if (ex.kind === 'bank') return gradeAnswer(ex, tilesPicked.map((i) => ex.tiles[i]))
    if (ex.kind === 'type') return gradeAnswer(ex, typed)
    return { correct: true, nearMiss: false }
  }

  function applyResult(correct: boolean, isNearMiss = false) {
    // 재시도로 맞춘 것과 오타 한 글자는 '맞음'으로 넘기되 숙련도는 올리지 않는다
    const outcome: Outcome = correct ? (isNearMiss || current!.retry ? 'near' : 'correct') : 'wrong'
    if (ex.srsKeys.length > 0) {
      setState((s) => {
        let srs = s.srs
        for (const key of ex.srsKeys) srs = updateSrs(srs, key, outcome)
        return { ...s, srs }
      })
    }
    if (correct) {
      if (soundOn) playCorrect()
      if (!current!.retry) setFirstTryCorrect((n) => n + 1)
      setStatus('correct')
    } else {
      if (soundOn) playWrong()
      setStatus('wrong')
      // 틀린 문제는 레슨 끝에 재출제
      setItems((prev) => (prev ? [...prev, { ex, retry: true }] : prev))
      // 하트 감소 (복습에서는 감소 없음)
      if (state.heartsEnabled && !isReview) {
        const left = state.hearts - 1
        setState((s) => ({ ...s, hearts: Math.max(0, s.hearts - 1) }))
        if (left <= 0) setNoHearts(true)
      }
    }
  }

  function check() {
    if (!canCheck() || status !== 'answering') return
    const r = checkAnswer()
    setNearMiss(r.correct && r.nearMiss)
    applyResult(r.correct, r.nearMiss)
  }

  function next() {
    const nextPos = pos + 1
    if (items && nextPos >= items.length) {
      const total = baseTotal
      const acc = total > 0 ? firstTryCorrect / total : 1
      const perfect = firstTryCorrect >= total
      const xp = isReview ? 5 + (perfect ? 3 : 0) : 10 + (perfect ? 5 : 0)
      onFinish({ xp, total, correctFirstTry: Math.min(firstTryCorrect, total), isReview })
      return
    }
    setPos(nextPos)
    setStatus('answering')
    setNearMiss(false)
    setPicked(null)
    setTilesPicked([])
    setTyped('')
  }

  const correctAnswerText =
    ex.kind === 'bank' ? ex.answer.join(' ') : ex.kind === 'pick' || ex.kind === 'type' ? ex.answer : ''

  return (
    <div className="page lesson">
      <header className="lesson-top">
        <button className="quit" onClick={onExit}>✕</button>
        <div className="progress"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
        {state.heartsEnabled && !isReview && <span className="hearts">💗 {state.hearts}</span>}
      </header>

      <main className="exercise">
        <h2 className="question">{ex.question}</h2>

        {ex.kind === 'pick' && (
          <PickView ex={ex} picked={picked} setPicked={setPicked} status={status} lang={book?.lang ?? lang} />
        )}
        {ex.kind === 'bank' && (
          <BankView ex={ex} tilesPicked={tilesPicked} setTilesPicked={setTilesPicked} status={status} lang={book?.lang ?? lang} />
        )}
        {ex.kind === 'type' && (
          <TypeView ex={ex} typed={typed} setTyped={setTyped} status={status} onEnter={check} />
        )}
        {ex.kind === 'match' && (
          <MatchView
            key={pos}
            pairs={ex.pairs}
            soundOn={soundOn}
            onDone={() => {
              if (soundOn) playCorrect()
              if (!current.retry) setFirstTryCorrect((n) => n + 1)
              setStatus('correct')
            }}
          />
        )}
      </main>

      <footer className={`lesson-footer ${status}`}>
        {status === 'answering' ? (
          ex.kind === 'match' ? (
            <div className="feedback-hint">모든 짝을 맞추면 다음으로 넘어가요</div>
          ) : (
            <button className="btn primary big" disabled={!canCheck()} onClick={check}>확인</button>
          )
        ) : (
          <div className="feedback">
            <div className="feedback-text">
              {status === 'correct' ? (
                nearMiss ? (
                  <span>💮 거의 맞았어요! 정답: <b>{correctAnswerText}</b></span>
                ) : (
                  <span>💮 정답이에요!</span>
                )
              ) : (
                <span>🥀 아쉬워요! 정답: <b>{correctAnswerText}</b></span>
              )}
            </div>
            <button className={`btn big ${status === 'correct' ? 'primary' : 'danger'}`} onClick={next} autoFocus>
              계속
            </button>
          </div>
        )}
      </footer>

      {noHearts && (
        <div className="modal-back">
          <div className="modal">
            <div className="modal-emoji">💔</div>
            <h3>하트를 다 썼어요!</h3>
            <p>복습을 완료하면 하트가 가득 회복돼요.<br />(설정에서 하트를 끌 수도 있어요)</p>
            <button className="btn primary big" onClick={onExit}>홈으로</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 4지선다 ──────────────────────────────
function PickView({
  ex,
  picked,
  setPicked,
  status,
  lang,
}: {
  ex: Extract<Exercise, { kind: 'pick' }>
  picked: string | null
  setPicked: (v: string) => void
  status: Status
  lang: string
}) {
  return (
    <div>
      <div className="prompt-card">
        {ex.promptAudio && (
          <button className="speaker" onClick={() => playMp3(lang, ex.promptAudio!)}>🔊</button>
        )}
        {!ex.audioOnly && (
          <div className="prompt-text">
            {ex.promptReading && <div className="reading">{ex.promptReading}</div>}
            <div className="prompt-main">{ex.prompt}</div>
          </div>
        )}
      </div>
      <div className="options">
        {ex.options.map((opt) => {
          let cls = 'option'
          if (picked === opt) cls += ' selected'
          if (status !== 'answering') {
            if (opt === ex.answer) cls += ' right'
            else if (picked === opt) cls += ' wrong'
          }
          return (
            <button key={opt} className={cls} disabled={status !== 'answering'} onClick={() => setPicked(opt)}>
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── 단어 뱅크 조립 ──────────────────────────────
function BankView({
  ex,
  tilesPicked,
  setTilesPicked,
  status,
  lang,
}: {
  ex: Extract<Exercise, { kind: 'bank' }>
  tilesPicked: number[]
  setTilesPicked: (v: number[]) => void
  status: Status
  lang: string
}) {
  return (
    <div>
      <div className="prompt-card">
        {ex.promptAudio && (
          <button className="speaker" onClick={() => playMp3(lang, ex.promptAudio!)}>🔊</button>
        )}
        {!ex.audioOnly && (
          <div className="prompt-text">
            {ex.promptReading && <div className="reading">{ex.promptReading}</div>}
            <div className="prompt-main">{ex.prompt}</div>
          </div>
        )}
      </div>
      <div className="bank-answer">
        {tilesPicked.length === 0 && <span className="bank-placeholder">아래 타일을 눌러 조립하세요</span>}
        {tilesPicked.map((ti, i) => (
          <button
            key={i}
            className="tile picked"
            disabled={status !== 'answering'}
            onClick={() => setTilesPicked(tilesPicked.filter((_, j) => j !== i))}
          >
            {ex.tiles[ti]}
          </button>
        ))}
      </div>
      <div className="bank-tiles">
        {ex.tiles.map((t, i) => (
          <button
            key={i}
            className={`tile ${tilesPicked.includes(i) ? 'used' : ''}`}
            disabled={status !== 'answering' || tilesPicked.includes(i)}
            onClick={() => setTilesPicked([...tilesPicked, i])}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── 직접 타이핑 ──────────────────────────────
function TypeView({
  ex,
  typed,
  setTyped,
  status,
  onEnter,
}: {
  ex: Extract<Exercise, { kind: 'type' }>
  typed: string
  setTyped: (v: string) => void
  status: Status
  onEnter: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return (
    <div>
      <div className="prompt-card">
        <div className="prompt-text">
          {ex.promptReading && <div className="reading">{ex.promptReading}</div>}
          <div className="prompt-main">{ex.prompt}</div>
        </div>
      </div>
      <input
        ref={ref}
        className="type-input"
        value={typed}
        disabled={status !== 'answering'}
        placeholder="여기에 입력하세요"
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter()
        }}
      />
    </div>
  )
}

// ── 짝 맞추기 ──────────────────────────────
function MatchView({
  pairs,
  soundOn,
  onDone,
}: {
  pairs: { a: string; b: string }[]
  soundOn: boolean
  onDone: () => void
}) {
  const left = useMemo(() => shuffleArr(pairs.map((p) => p.a)), [pairs])
  const right = useMemo(() => shuffleArr(pairs.map((p) => p.b)), [pairs])
  const [selA, setSelA] = useState<string | null>(null)
  const [selB, setSelB] = useState<string | null>(null)
  const [matched, setMatched] = useState<Set<string>>(new Set())
  const [shake, setShake] = useState<string | null>(null)

  function tryMatch(a: string | null, b: string | null) {
    if (!a || !b) return
    const pair = pairs.find((p) => p.a === a)
    if (pair && pair.b === b) {
      const next = new Set(matched)
      next.add(a)
      next.add(b)
      setMatched(next)
      setSelA(null)
      setSelB(null)
      if (next.size === pairs.length * 2) setTimeout(onDone, 300)
    } else {
      if (soundOn) playWrong()
      setShake(a + b)
      setTimeout(() => {
        setShake(null)
        setSelA(null)
        setSelB(null)
      }, 400)
    }
  }

  return (
    <div className="match-grid">
      <div className="match-col">
        {left.map((a) => (
          <button
            key={a}
            className={`option match ${selA === a ? 'selected' : ''} ${matched.has(a) ? 'matched' : ''} ${shake && selA === a ? 'shake' : ''}`}
            disabled={matched.has(a)}
            onClick={() => {
              setSelA(a)
              tryMatch(a, selB)
            }}
          >
            {a}
          </button>
        ))}
      </div>
      <div className="match-col">
        {right.map((b) => (
          <button
            key={b}
            className={`option match ${selB === b ? 'selected' : ''} ${matched.has(b) ? 'matched' : ''} ${shake && selB === b ? 'shake' : ''}`}
            disabled={matched.has(b)}
            onClick={() => {
              setSelB(b)
              tryMatch(selA, b)
            }}
          >
            {b}
          </button>
        ))}
      </div>
    </div>
  )
}

function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
