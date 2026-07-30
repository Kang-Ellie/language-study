// 퀴즈 러너 — 문제를 만들고, 답을 받고, 채점 결과를 SRS에 반영한다.
// 문제 유형별 화면과 머리·발 부분은 components/quiz/ 로 나가 있다.
// 이 파일이 갖는 건 "세션 진행 상태" 하나뿐이다.
import { useEffect, useState } from 'react'
import type { Exercise, Lesson, LessonResult, Unit } from '../types'
import type { AppState } from '../lib/storage'
import { updateSrs, type Outcome } from '../lib/srs'
import { buildQuiz, defaultRequest, grade as gradeAnswer, requestToOptions, type QuizRequest } from '../lib/quiz'
import { bookAudioFiles, lessonAudioFiles } from '../lib/lessonModel'
import { playCorrect, playWrong, playMp3, checkAudioFiles } from '../lib/audio'
import ExerciseBank from './quiz/ExerciseBank'
import ExerciseMatch from './quiz/ExerciseMatch'
import ExercisePick from './quiz/ExercisePick'
import ExerciseType from './quiz/ExerciseType'
import FeedbackBar from './quiz/FeedbackBar'
import QuizHeader from './quiz/QuizHeader'
import type { Status } from './quiz/types'

interface Props {
  lang: string
  books: Unit[] // 같은 언어의 책 전부 (보기 풀 보충용)
  book?: Unit
  lesson?: Lesson
  /** 무엇을 어떻게 낼지. 없으면 복습 기본값 */
  request?: QuizRequest
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

/** 정답 텍스트 — 오답 피드백에 보여준다 */
function answerTextOf(ex: Exercise): string {
  if (ex.kind === 'bank') return ex.answer.join(' ')
  if (ex.kind === 'pick' || ex.kind === 'type') return ex.answer
  return ''
}

export default function LessonScreen({
  lang,
  books,
  book,
  lesson,
  request,
  isReview,
  state,
  setState,
  onExit,
  onFinish,
}: Props) {
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
  const audioLang = book?.lang ?? lang

  // 문제 생성 (mp3 존재 확인 후)
  useEffect(() => {
    let alive = true
    async function build() {
      const req = request ?? defaultRequest({ type: 'review' })
      // 범위가 한 챕터로 좁으면 그 챕터 오디오만, 아니면 책 전체를 확인한다
      const files =
        req.scope.type === 'chapter' && lesson ? lessonAudioFiles(lesson) : books.flatMap(bookAudioFiles)
      const ok = files.length > 0 ? await checkAudioFiles(lang, files) : new Set<string>()

      const exercises: Exercise[] = buildQuiz(books, req.scope, state, requestToOptions(req, ok))
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
        playMp3(audioLang, ex.promptAudio)
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

  return (
    <div className="page lesson">
      <QuizHeader
        progress={Math.round((pos / items.length) * 100)}
        hearts={state.heartsEnabled && !isReview ? state.hearts : undefined}
        onExit={onExit}
      />

      <main className="exercise">
        <h2 className="question">{ex.question}</h2>

        {ex.kind === 'pick' && (
          <ExercisePick ex={ex} picked={picked} setPicked={setPicked} status={status} lang={audioLang} />
        )}
        {ex.kind === 'bank' && (
          <ExerciseBank
            ex={ex}
            tilesPicked={tilesPicked}
            setTilesPicked={setTilesPicked}
            status={status}
            lang={audioLang}
          />
        )}
        {ex.kind === 'type' && (
          <ExerciseType ex={ex} typed={typed} setTyped={setTyped} status={status} onEnter={check} />
        )}
        {ex.kind === 'match' && (
          <ExerciseMatch
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

      <FeedbackBar
        status={status}
        selfChecking={ex.kind === 'match'}
        canCheck={canCheck()}
        nearMiss={nearMiss}
        answerText={answerTextOf(ex)}
        onCheck={check}
        onNext={next}
      />

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
