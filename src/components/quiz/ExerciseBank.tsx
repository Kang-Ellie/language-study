import type { Exercise } from '../../types'
import type { AudioScope } from '../../lib/audio'
import PromptCard from './PromptCard'
import type { Status } from './types'

interface Props {
  ex: Extract<Exercise, { kind: 'bank' }>
  tilesPicked: number[]
  setTilesPicked: (v: number[]) => void
  status: Status
  scope: AudioScope
}

/** 단어 조각을 순서대로 눌러 문장을 완성 */
export default function ExerciseBank({ ex, tilesPicked, setTilesPicked, status, scope }: Props) {
  return (
    <div>
      <PromptCard
        scope={scope}
        prompt={ex.prompt}
        reading={ex.promptReading}
        audio={ex.promptAudio}
        audioOnly={ex.audioOnly}
      />
      <div className="bank-answer">
        {tilesPicked.length === 0 && <span className="bank-placeholder">아래 타일을 눌러 조립하세요</span>}
        {tilesPicked.map((ti, i) => (
          <button
            key={i}
            className="tile picked"
            disabled={status !== 'answering'}
            onClick={() => setTilesPicked(tilesPicked.filter((_, j) => j !== i))}
          >
            {ex.tiles[ti]}
          </button>
        ))}
      </div>
      <div className="bank-tiles">
        {ex.tiles.map((t, i) => (
          <button
            key={i}
            className={`tile ${tilesPicked.includes(i) ? 'used' : ''}`}
            disabled={status !== 'answering' || tilesPicked.includes(i)}
            onClick={() => setTilesPicked([...tilesPicked, i])}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  )
}
