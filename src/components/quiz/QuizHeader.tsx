interface Props {
  /** 0~100 */
  progress: number
  hearts?: number
  onExit: () => void
}

/** 진행바 · 하트 · 나가기 */
export default function QuizHeader({ progress, hearts, onExit }: Props) {
  return (
    <header className="lesson-top">
      <button className="quit" onClick={onExit}>✕</button>
      <div className="progress"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
      {hearts !== undefined && <span className="hearts">💗 {hearts}</span>}
    </header>
  )
}
