import { useMemo, useState } from 'react'
import { playWrong } from '../../lib/audio'

interface Props {
  pairs: { a: string; b: string }[]
  soundOn: boolean
  onDone: () => void
}

function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 짝 맞추기 — 다 맞추면 스스로 다음으로 넘어간다 (확인 버튼이 없다) */
export default function ExerciseMatch({ pairs, soundOn, onDone }: Props) {
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
