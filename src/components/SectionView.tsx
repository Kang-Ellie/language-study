import type { Lesson, Section, Unit } from '../types'
import type { AppState } from '../lib/storage'
import { sectionHasContent, sectionMastery } from '../lib/progress'
import { playMp3 } from '../lib/audio'
import ImageThumb from './ImageThumb'

interface Props {
  book: Unit
  chapter: Lesson
  section: Section
  /** 파일이 실제로 있는 오디오 — 없는 mp3에는 🔊를 띄우지 않는다 */
  audioOk: Set<string>
  /** 숙달도를 함께 보여줄지 (학습 화면 O, 훑어보기 X) */
  state?: AppState
}

/** 소단원 하나 — 본문 · 문장 · 새단어 · 문법 · 첨부 이미지 */
export default function SectionView({ book, chapter, section, audioOk, state }: Props) {
  const lang = book.lang

  // 빈 소단원은 점선 회색 카드로 — "여기 아직 안 채웠다"가 눈에 보이게
  if (!sectionHasContent(section)) {
    return (
      <div className="study-section empty-section">
        <div className="content-sec-title">📂 {section.title}</div>
        <p className="empty-section-hint">아직 안 채운 곳이에요. ✏️ 편집에서 본문·새단어를 넣어 보세요.</p>
      </div>
    )
  }

  const mastery = state ? sectionMastery(book, chapter, section, state) : null

  const Speaker = ({ file, label }: { file?: string; label?: string }) =>
    file && audioOk.has(file) ? (
      <button className="spk" onClick={() => playMp3(lang, file)} title={label}>🔊</button>
    ) : (
      <span className="spk off">·</span>
    )

  return (
    <div className="study-section">
      <div className="content-sec-title">
        📂 {section.title}
        {mastery && mastery.total > 0 && (
          <span className="sec-mastery">💮 {mastery.mastered}/{mastery.total}</span>
        )}
      </div>

      {(section.images ?? []).length > 0 && (
        <div className="img-gallery">
          {section.images!.map((img, i) => (
            <ImageThumb key={i} ns={lang} file={img} className="gallery-thumb" />
          ))}
        </div>
      )}

      {section.passageText && (
        <div className="passage-block">
          <div className="content-kind">
            📖 본문
            {section.passageAudio && audioOk.has(section.passageAudio) && (
              <button className="spk inline" onClick={() => playMp3(lang, section.passageAudio!)}>🔊 전체 듣기</button>
            )}
          </div>
          <p className="passage-text">{section.passageText}</p>
          {section.passageTranslation && <p className="passage-translation">{section.passageTranslation}</p>}
        </div>
      )}

      {section.passages.length > 0 && (
        <>
          <div className="content-kind">🔎 문장별 보기 (퀴즈·개별듣기용)</div>
          {section.passages.map((p) => (
            <div key={p.id} className="vrow">
              <Speaker file={p.audio} label="선생님 녹음" />
              <div className="vtext">
                {p.reading && <span className="vreading">{p.reading}</span>}
                <span className="vmain">{p.text}</span>
              </div>
              <div className="vmean">{p.meaning}</div>
            </div>
          ))}
        </>
      )}

      {section.words.length > 0 && (
        <>
          <div className="content-kind">🔤 새단어</div>
          {section.words.map((w) => (
            <div key={w.id} className="vrow">
              <Speaker file={w.audio} />
              <div className="vtext">
                {w.reading && <span className="vreading">{w.reading}</span>}
                <span className="vmain">{w.text}</span>
              </div>
              <div className="vmean">{w.meaning}</div>
            </div>
          ))}
        </>
      )}

      {section.grammar.length > 0 && (
        <>
          <div className="content-kind">📐 문법</div>
          {section.grammar.map((g) => (
            <div key={g.id} className="grammar-box">
              <div className="grammar-point">{g.point}</div>
              {g.explanation && <div className="grammar-explain">{g.explanation}</div>}
              {g.examples.map((ex) => (
                <div key={ex.id} className="vrow example">
                  <Speaker file={ex.audio} />
                  <div className="vtext"><span className="vmain">{ex.text}</span></div>
                  <div className="vmean">{ex.meaning}</div>
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
