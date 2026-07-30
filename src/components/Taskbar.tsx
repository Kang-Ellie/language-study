import { useEffect, useState } from 'react'

interface Props {
  label: string
  onStart?: () => void
}

/** 하단 작업표시줄 — start 버튼 + 현재 창 + 시계 */
export default function Taskbar({ label, onStart }: Props) {
  const [clock, setClock] = useState(timeStr())
  useEffect(() => {
    const t = setInterval(() => setClock(timeStr()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="taskbar">
      <button className="start-btn" onClick={onStart} title="책장으로">
        <span className="start-flower">🌸</span> start
      </button>
      <div className="taskbar-label">📚 {label}</div>
      <div className="taskbar-clock">{clock}</div>
    </div>
  )
}

function timeStr(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
