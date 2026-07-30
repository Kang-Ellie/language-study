import { useEffect } from 'react'
import type { LessonResult } from '../types'
import type { AppState } from '../lib/storage'
import { playFanfare } from '../lib/audio'

export default function Complete({
  result,
  state,
  onContinue,
}: {
  result: LessonResult
  state: AppState
  onContinue: () => void
}) {
  useEffect(() => {
    if (state.soundOn) playFanfare()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const accuracy = result.total > 0 ? Math.round((result.correctFirstTry / result.total) * 100) : 100
  const goalDone = state.xpToday >= state.dailyGoal

  return (
    <div className="page center complete">
      <div className="complete-emoji">{accuracy === 100 ? '💯' : '🎉'}</div>
      <h1>{result.isReview ? '복습 완료!' : '레슨 완료!'}</h1>
      <div className="result-cards">
        <div className="result-card">
          <div className="result-label">✨ XP</div>
          <div className="result-value">+{result.xp}</div>
        </div>
        <div className="result-card">
          <div className="result-label">🎯 정확도</div>
          <div className="result-value">{accuracy}%</div>
        </div>
        <div className="result-card">
          <div className="result-label">🔥 스트릭</div>
          <div className="result-value">{state.streak}일</div>
        </div>
      </div>
      {result.isReview && <p className="complete-note">💗 하트가 가득 회복됐어요!</p>}
      {goalDone && <p className="complete-note">🌸 오늘 목표 달성! ({state.xpToday}/{state.dailyGoal} XP)</p>}
      <button className="btn primary big" onClick={onContinue} autoFocus>계속</button>
    </div>
  )
}
