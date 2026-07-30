import { playMp3 } from '../../lib/audio'

interface Props {
  lang: string
  prompt: string
  reading?: string
  audio?: string
  /** 듣기 문제 — 글자를 감추고 소리만 낸다 */
  audioOnly?: boolean
}

/** 문제 위쪽의 지문 카드. 4지선다와 조립 문제가 함께 쓴다. */
export default function PromptCard({ lang, prompt, reading, audio, audioOnly }: Props) {
  return (
    <div className="prompt-card">
      {audio && (
        <button className="speaker" onClick={() => playMp3(lang, audio)}>🔊</button>
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
