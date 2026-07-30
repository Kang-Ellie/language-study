import { useMemo, useState } from 'react'
import type { Unit } from '../types'
import type { AppState } from '../lib/storage'
import {
  ALL_KINDS,
  KIND_LABEL,
  collectItems,
  countAvailable,
  defaultRequest,
  type QuizKind,
  type QuizRequest,
  type QuizScope,
} from '../lib/quiz'

export interface ScopeChoice {
  scope: QuizScope
  label: string
}

interface Props {
  books: Unit[]
  state: AppState
  choices: ScopeChoice[]
  /** 파일이 실제로 있는 오디오 — 듣기 문제를 낼 수 있는지 판단 */
  audioOk: Set<string>
  onStart: (request: QuizRequest) => void
  onClose: () => void
}

// 범위별 기본값(소단원 10 · 대단원 15 · 교재 20)이 전부 여기 있어야
// 처음 열었을 때 어떤 칩이든 선택 표시가 보인다
const COUNTS: (number | 'all')[] = [10, 15, 20, 30, 'all']

export default function QuizScopePicker({ books, state, choices, audioOk, onStart, onClose }: Props) {
  const [pick, setPick] = useState(0)
  const [count, setCount] = useState<number | 'all'>(() => defaultRequest(choices[0].scope).count)
  // 사용자가 문항 수를 직접 고르기 전까지는 범위에 맞는 기본값을 따라간다
  // (교재 전체는 20, 소단원은 10 — 범위가 넓을수록 많이)
  const [countTouched, setCountTouched] = useState(false)
  const [kinds, setKinds] = useState<Set<QuizKind>>(() => new Set(ALL_KINDS))
  const [useSrsWeight, setUseSrsWeight] = useState(true)

  function selectScope(i: number) {
    setPick(i)
    if (!countTouched) setCount(defaultRequest(choices[i].scope).count)
  }

  // 범위별 항목 수를 미리 세어 보여준다 — 고르기 전에 "여기 몇 개 있는지"를 알 수 있게
  const sizes = useMemo(
    () => choices.map((c) => collectItems(books, c.scope, state).length),
    [books, choices, state]
  )

  const selected = choices[pick]
  const available = useMemo(
    () => countAvailable(collectItems(books, selected.scope, state), audioOk),
    [books, selected, state, audioOk]
  )

  // 실제로 낼 수 있는 유형만 켤 수 있다. 듣기를 켰는데 오디오가 없으면 시작 전에 보인다.
  const enabledKinds = [...kinds].filter((k) => available[k] > 0)
  const canStart = sizes[pick] > 0 && enabledKinds.length > 0

  function toggleKind(k: QuizKind) {
    setKinds((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal picker" onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <h3>🎯 퀴즈 시작</h3>
          <button className="win-x" onClick={onClose}>×</button>
        </div>

        <div className="picker-group">
          <div className="picker-label">범위</div>
          {choices.map((c, i) => (
            <button
              key={i}
              className={`picker-row ${i === pick ? 'on' : ''} ${sizes[i] === 0 ? 'empty' : ''}`}
              disabled={sizes[i] === 0}
              onClick={() => selectScope(i)}
            >
              <span className="picker-radio">{i === pick ? '●' : '○'}</span>
              <span className="picker-row-label">{c.label}</span>
              <span className="picker-count">{sizes[i] === 0 ? '없음' : `${sizes[i]}개`}</span>
            </button>
          ))}
        </div>

        <div className="picker-group">
          <div className="picker-label">문항 수</div>
          <div className="picker-chips">
            {COUNTS.map((c) => (
              <button
                key={String(c)}
                className={`pill tiny ${count === c ? 'active' : ''}`}
                onClick={() => {
                  setCount(c)
                  setCountTouched(true)
                }}
              >
                {c === 'all' ? '전부' : c}
              </button>
            ))}
          </div>
        </div>

        <div className="picker-group">
          <div className="picker-label">문제 유형</div>
          <div className="picker-chips">
            {ALL_KINDS.map((k) => {
              const n = available[k]
              return (
                <button
                  key={k}
                  className={`pill tiny ${kinds.has(k) && n > 0 ? 'active' : ''}`}
                  disabled={n === 0}
                  title={n === 0 ? '이 범위에서는 낼 수 없어요' : `${n}개 가능`}
                  onClick={() => toggleKind(k)}
                >
                  {kinds.has(k) && n > 0 ? '☑' : '☐'} {KIND_LABEL[k]} <span className="picker-n">{n}</span>
                </button>
              )
            })}
          </div>
          {available.listen === 0 && (
            <p className="editor-hint">🔊 듣기는 mp3가 등록된 항목이 있어야 나와요.</p>
          )}
        </div>

        <label className="setting-row">
          <span>🎯 약한 것 먼저 (간격 반복)</span>
          <input type="checkbox" checked={useSrsWeight} onChange={(e) => setUseSrsWeight(e.target.checked)} />
        </label>

        {!canStart && (
          <p className="editor-error">
            ⚠️ {sizes[pick] === 0 ? '이 범위에는 출제할 내용이 없어요.' : '유형을 하나 이상 골라 주세요.'}
          </p>
        )}

        <button
          className="btn primary big"
          disabled={!canStart}
          onClick={() => onStart({ scope: selected.scope, count, kinds: enabledKinds, useSrsWeight })}
        >
          시작하기
        </button>
      </div>
    </div>
  )
}
