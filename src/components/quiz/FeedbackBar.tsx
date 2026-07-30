import type { Status } from './types'

interface Props {
  status: Status
  /** 짝 맞추기는 확인 버튼이 없다 */
  selfChecking: boolean
  canCheck: boolean
  /** 오타 한 글자로 맞은 경우 — 정답을 보여준다 */
  nearMiss: boolean
  answerText: string
  onCheck: () => void
  onNext: () => void
}

/** 하단 확인 / 정·오답 피드백 바 */
export default function FeedbackBar({
  status,
  selfChecking,
  canCheck,
  nearMiss,
  answerText,
  onCheck,
  onNext,
}: Props) {
  if (status === 'answering') {
    return (
      <footer className="lesson-footer answering">
        {selfChecking ? (
          <div className="feedback-hint">모든 짝을 맞추면 다음으로 넘어가요</div>
        ) : (
          <button className="btn primary big" disabled={!canCheck} onClick={onCheck}>확인</button>
        )}
      </footer>
    )
  }

  return (
    <footer className={`lesson-footer ${status}`}>
      <div className="feedback">
        <div className="feedback-text">
          {status === 'correct' ? (
            nearMiss ? (
              <span>💮 거의 맞았어요! 정답: <b>{answerText}</b></span>
            ) : (
              <span>💮 정답이에요!</span>
            )
          ) : (
            <span>🥀 아쉬워요! 정답: <b>{answerText}</b></span>
          )}
        </div>
        <button className={`btn big ${status === 'correct' ? 'primary' : 'danger'}`} onClick={onNext} autoFocus>
          계속
        </button>
      </div>
    </footer>
  )
}
