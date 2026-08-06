// 오늘 스터디 인증 — 책장 맨 위.
//
// 이 앱이 대체하려는 카톡 스터디의 핵심이 "매일 증거를 남긴다"라서,
// 퀴즈 XP보다 이걸 더 눈에 띄는 자리에 둔다.
import { useMemo } from 'react'
import type { AppState } from '../lib/storage'
import { allLogEntries } from '../lib/studyLog'
import { checkInStreak, missingFor, recentRate, todayCheck } from '../lib/checkin'

interface Props {
  state: AppState
  /** 학습 기록이 바뀌면 다시 세도록 (기록은 localStorage에 있어 리액트가 모른다) */
  version: number
}

export default function CheckInCard({ state, version }: Props) {
  const rule = state.checkInRule
  const { check, streak, rate } = useMemo(() => {
    const entries = allLogEntries()
    return {
      check: todayCheck(entries, rule),
      streak: checkInStreak(entries, rule),
      rate: recentRate(entries, rule, 7),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rule, version])

  const missing = missingFor(rule, check)

  return (
    <div className={`checkin ${check.done ? 'done' : ''}`}>
      <div className="checkin-mark">{check.done ? '✅' : '⬜️'}</div>
      <div className="checkin-body">
        <div className="checkin-title">
          {check.done ? '오늘 인증 완료!' : '오늘 아직 인증 전이에요'}
        </div>
        <div className="checkin-sub">
          {check.done ? (
            <>
              {check.hasRecording && '🎙 녹음'}
              {check.hasRecording && check.hasWriting && ' · '}
              {check.hasWriting && '✍️ 쓰기'}
              {' 남겼어요'}
            </>
          ) : (
            <>{missing.join(' + ')}를 남기면 완료돼요</>
          )}
        </div>
      </div>
      <div className="checkin-stats">
        <div className="checkin-streak">🔥 {streak}일</div>
        <div className="checkin-rate">최근 7일 {rate.done}/7</div>
      </div>
    </div>
  )
}
