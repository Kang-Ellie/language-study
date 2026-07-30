import { useEffect, useRef } from 'react'
import type { Exercise } from '../../types'
import type { Status } from './types'

interface Props {
  ex: Extract<Exercise, { kind: 'type' }>
  typed: string
  setTyped: (v: string) => void
  status: Status
  onEnter: () => void
}

/** 직접 타이핑 */
export default function ExerciseType({ ex, typed, setTyped, status, onEnter }: Props) {
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
