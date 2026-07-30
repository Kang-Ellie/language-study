import { playMp3, type AudioScope } from '../../lib/audio'

interface Props {
  scope: AudioScope
  prompt: string
  reading?: string
  audio?: string
  /** 듣기 문제 — 글자를 감추고 소리만 낸다 */
  audioOnly?: boolean
}

/** 문제 위쪽의 지문 카드. 4지선다와 조립 문제가 함께 쓴다. */
export default function PromptCard({ scope, prompt, reading, audio, audioOnly }: Props) {
  return (
    <div className="prompt-card">
      {audio && (
        <button className="speaker" onClick={() => playMp3(scope, audio)}>🔊</button>
      )}
      {!audioOnly && (
        <div className="prompt-text">
          {reading && <div className="reading">{reading}</div>}
          <div className="prompt-main">{prompt}</div>
        </div>
      )}
    </div>
  )
}
