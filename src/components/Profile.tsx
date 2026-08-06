import { useEffect, useState } from 'react'
import type { Unit } from '../types'
import { MAX_HEARTS, resetAll, type AppState } from '../lib/storage'
import { learnedCount } from '../lib/srs'
import { audioUsageMb } from '../lib/audioStore'
import { imageUsageMb } from '../lib/imageStore'
import { languageOf } from '../data'
import { allLogEntries } from '../lib/studyLog'
import { RULE_LABEL, checkInStreak, checkedDates, type CheckInRule } from '../lib/checkin'
import BackupPanel from './BackupPanel'

export default function Profile({
  state,
  setState,
  books,
  onBack,
}: {
  state: AppState
  setState: (fn: (s: AppState) => AppState) => void
  books: Unit[]
  onBack: () => void
}) {
  const language = languageOf(state.lang)
  const logEntries = allLogEntries()
  const checked = checkedDates(logEntries, state.checkInRule)
  const checkStreak = checkInStreak(logEntries, state.checkInRule)
  const [mp3Mb, setMp3Mb] = useState<number | null>(null)
  const [imgMb, setImgMb] = useState<number | null>(null)
  useEffect(() => {
    audioUsageMb().then(setMp3Mb)
    imageUsageMb().then(setImgMb)
  }, [])

  // 최근 8주 스트릭 달력 (일요일 시작)
  const weeks: string[][] = []
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - (7 * 8 - 1) - end.getDay())
  const cursor = new Date(start)
  while (cursor <= end) {
    const week: string[] = []
    for (let i = 0; i < 7; i++) {
      const d = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
      week.push(cursor <= end ? d : '')
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
  }

  return (
    <div className="page">
      <header className="topbar">
        <button className="btn ghost" onClick={onBack}>← 홈</button>
        <h1 className="page-title">프로필 · 통계</h1>
      </header>

      <div className="result-cards">
        <div className="result-card">
          <div className="result-label">🔥 스트릭</div>
          <div className="result-value">{state.streak}일</div>
          <div className="result-sub">최고 {state.bestStreak}일</div>
        </div>
        <div className="result-card">
          <div className="result-label">✅ 인증 스트릭</div>
          <div className="result-value">{checkStreak}일</div>
          <div className="result-sub">{RULE_LABEL[state.checkInRule]}</div>
        </div>
        <div className="result-card">
          <div className="result-label">✨ 총 XP</div>
          <div className="result-value">{state.xp}</div>
        </div>
        <div className="result-card">
          <div className="result-label">📚 학습 단어</div>
          <div className="result-value">{learnedCount(state, books)}</div>
          <div className="result-sub">{language.flag} {language.name}</div>
        </div>
      </div>

      <section className="card">
        <h3>🗓 달력 (최근 8주) <span className="cal-legend">✅ 인증 · ✨ 퀴즈</span></h3>
        <div className="calendar">
          {weeks.map((week, wi) => (
            <div key={wi} className="cal-week">
              {week.map((d, di) => (
                <div
                  key={di}
                  className={`cal-day ${d && state.studyDays.includes(d) ? 'studied' : ''} ${d && checked.has(d) ? 'checked' : ''}`}
                  title={d ? `${d}${checked.has(d) ? ' · ✅ 인증' : ''}` : undefined}
                />
              ))}
            </div>
          ))}
        </div>
      </section>

      <BackupPanel />

      <section className="card">
        <h3>⚙️ 설정</h3>
        <label className="setting-row">
          <span>✨ 일일 목표</span>
          <select
            value={state.dailyGoal}
            onChange={(e) => setState((s) => ({ ...s, dailyGoal: Number(e.target.value) }))}
          >
            <option value={10}>가볍게 10 XP</option>
            <option value={20}>기본 20 XP</option>
            <option value={30}>열심히 30 XP</option>
            <option value={50}>진심 50 XP</option>
          </select>
        </label>
        <label className="setting-row">
          <span>✅ 인증 기준</span>
          <select
            value={state.checkInRule}
            onChange={(e) => setState((s) => ({ ...s, checkInRule: e.target.value as CheckInRule }))}
          >
            {(Object.keys(RULE_LABEL) as CheckInRule[]).map((r) => (
              <option key={r} value={r}>{RULE_LABEL[r]}</option>
            ))}
          </select>
        </label>
        <label className="setting-row">
          <span>💗 하트 사용</span>
          <input
            type="checkbox"
            checked={state.heartsEnabled}
            onChange={(e) =>
              setState((s) => ({ ...s, heartsEnabled: e.target.checked, hearts: MAX_HEARTS }))
            }
          />
        </label>
        <label className="setting-row">
          <span>🔔 효과음</span>
          <input
            type="checkbox"
            checked={state.soundOn}
            onChange={(e) => setState((s) => ({ ...s, soundOn: e.target.checked }))}
          />
        </label>
        <div className="setting-row">
          <span>🔊 오디오 (mp3 · 녹음)</span>
          <span>{mp3Mb === null ? '…' : `${mp3Mb} MB`}</span>
        </div>
        <div className="setting-row">
          <span>🖼 사진 (필기 · 교재 스캔)</span>
          <span>{imgMb === null ? '…' : `${imgMb} MB`}</span>
        </div>
        <button
          className="btn danger"
          onClick={() => {
            if (confirm('정말 모든 학습 기록을 지울까요? 되돌릴 수 없어요.\n먼저 위에서 백업을 내보냈는지 확인해 주세요.')) {
              resetAll()
              location.reload()
            }
          }}
        >
          학습 기록 초기화
        </button>
      </section>
    </div>
  )
}
