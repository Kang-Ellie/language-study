import type { Exercise } from '../../types'
import PromptCard from './PromptCard'
import type { Status } from './types'

interface Props {
  ex: Extract<Exercise, { kind: 'pick' }>
  picked: string | null
  setPicked: (v: string) => void
  status: Status
  lang: string
}

/** 4지선다 — 뜻 고르기 · 원문 고르기 · 빈칸 · 듣고 고르기가 모두 이 모양이다 */
export default function ExercisePick({ ex, picked, setPicked, status, lang }: Props) {
  return (
    <div>
      <PromptCard
        lang={lang}
        prompt={ex.prompt}
        reading={ex.promptReading}
        audio={ex.promptAudio}
        audioOnly={ex.audioOnly}
      />
      <div className="options">
        {ex.options.map((opt) => {
          let cls = 'option'
          if (picked === opt) cls += ' selected'
          if (status !== 'answering') {
            if (opt === ex.answer) cls += ' right'
            else if (picked === opt) cls += ' wrong'
          }
          return (
            <button key={opt} className={cls} disabled={status !== 'answering'} onClick={() => setPicked(opt)}>
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}
