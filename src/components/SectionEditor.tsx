// 소단원 하나 편집.
//
// 부모(Editor)가 인덱스를 들고 있던 걸 `update(fn)` 콜백 하나로 바꿨다.
// 이 컴포넌트는 자기가 몇 번째 소단원인지 알 필요가 없다.
import { useState } from 'react'
import type { Section, SectionKind } from '../types'
import { newGrammar, newGrammarExample, newSentence, newWord } from '../lib/normalize'
import AudioField from './AudioField'
import ImageThumb from './ImageThumb'

interface Props {
  section: Section
  bookId: string
  lang: string
  /** 소단원이 하나뿐이면 지울 수 없다 */
  canDelete: boolean
  update: (fn: (s: Section) => void) => void
  onDelete: () => void
  onPickImages: () => void
}

const SECTION_KINDS: { id: SectionKind; label: string }[] = [
  { id: 'passage', label: '📖 본문·회화' },
  { id: 'vocab', label: '🔤 핵심 어휘' },
  { id: 'grammar', label: '📐 문법' },
  { id: 'writing', label: '✍️ 작문' },
  { id: 'speaking', label: '🗣 말하기' },
  { id: 'listening', label: '🔊 듣기' },
]

/** 이 항목을 퀴즈에 낼지 — 고유명사처럼 외울 필요 없는 것을 끈다 */
function QuizToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={`pill tiny ${on ? '' : 'soft'}`}
      title={on ? '퀴즈에 출제됩니다 (누르면 제외)' : '퀴즈에서 제외됨 (누르면 포함)'}
      onClick={() => onChange(!on)}
    >
      {on ? '🎯 출제' : '🚫 제외'}
    </button>
  )
}

/** 본문 전체 텍스트를 문장 부호 기준으로 쪼갬 (퀴즈용 문장 자동 생성) */
export function splitPassage(text: string): string[] {
  return text
    .split(/(?<=[。！？.!?…])\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export default function SectionEditor({ section, bookId, lang, canDelete, update, onDelete, onPickImages }: Props) {
  const scope = { bookId, lang }
  const [openDetail, setOpenDetail] = useState(false)
  const showReading = lang !== 'en' // 영어는 발음·분절 칸이 필요 없다

  return (
    <div className="section-card">
      <div className="section-head">
        <span className="section-tag">📂 소카테고리</span>
        <input
          className="section-title"
          value={section.title}
          placeholder="예: 회화1 / 본문 / 독해"
          onChange={(e) => update((s) => { s.title = e.target.value })}
        />
        {canDelete && (
          <button className="mini-del" title="소카테고리 삭제" onClick={onDelete}>🗑</button>
        )}
      </div>

      {/* 성격 태그 — 퀴즈 범위를 고를 때 "작문만" 처럼 걸러 쓰기 위한 것. 선택 사항 */}
      <div className="edit-line">
        <label className="mini-label">성격 (선택)</label>
        <select
          value={section.kind ?? ''}
          onChange={(e) => update((s) => { s.kind = (e.target.value || undefined) as SectionKind | undefined })}
        >
          <option value="">— 지정 안 함 —</option>
          {SECTION_KINDS.map((k) => (
            <option key={k.id} value={k.id}>{k.label}</option>
          ))}
        </select>
      </div>

      {/* 첨부 이미지 (교재 페이지 스캔 등) */}
      <h5>🖼 첨부 이미지</h5>
      <div className="img-gallery-edit">
        {(section.images ?? []).map((img, ii) => (
          <div key={ii} className="img-gallery-item">
            <ImageThumb ns={lang} file={img} />
            <button
              className="mini-del gallery-del"
              onClick={() => update((s) => { s.images = (s.images ?? []).filter((_, j) => j !== ii) })}
            >✕</button>
          </div>
        ))}
        <button className="pill soft tiny" onClick={onPickImages}>＋ 이미지 추가</button>
      </div>

      {/* 본문 — 긴 지문은 통째로 붙여넣기 */}
      <h5>📖 본문 <span className="hint-inline">(교재 원문을 통째로 붙여넣으세요)</span></h5>
      <div className="edit-item">
        <label className="mini-label">원문 전체</label>
        <textarea
          className="passage-textarea"
          value={section.passageText ?? ''}
          placeholder="교재 본문을 통째로 붙여넣으세요 (여러 문장이어도 OK)"
          rows={5}
          onChange={(e) => update((s) => { s.passageText = e.target.value })}
        />
        <label className="mini-label">번역 전체 (선택)</label>
        <textarea
          className="passage-textarea"
          value={section.passageTranslation ?? ''}
          placeholder="전체 번역 (선택)"
          rows={3}
          onChange={(e) => update((s) => { s.passageTranslation = e.target.value })}
        />
        <div className="edit-line">
          <AudioField
            scope={scope}
            value={section.passageAudio}
            slug={section.title}
            onChange={(f) => update((s) => { s.passageAudio = f })}
          />
          <span className="hint-inline">선생님 낭독 전체 녹음</span>
        </div>
        {(section.passageText ?? '').trim() && (
          <button
            className="pill soft tiny"
            onClick={() =>
              update((s) => {
                const parts = splitPassage(s.passageText ?? '')
                const existing = new Set(s.passages.map((p) => p.text))
                for (const t of parts) if (!existing.has(t)) s.passages.push(newSentence(s.id, t))
              })
            }
          >
            ✂️ 문장으로 자동 분리 (퀴즈용, 선택)
          </button>
        )}
      </div>

      {section.passages.length > 0 && (
        <button className="pill soft tiny detail-toggle" onClick={() => setOpenDetail((v) => !v)}>
          {openDetail
            ? '▲ 문장별 세부 편집 접기'
            : `▼ 문장별 세부 편집 (${section.passages.length}개 · 퀴즈/개별듣기용, 선택)`}
        </button>
      )}
      {openDetail && (
        <>
          {section.passages.map((p, pi) => (
            <div key={p.id} className="edit-item">
              <div className="edit-line">
                <input
                  value={p.text}
                  placeholder="문장 (你去哪儿？)"
                  onChange={(e) => update((s) => { s.passages[pi].text = e.target.value })}
                />
                <button className="mini-del" onClick={() => update((s) => { s.passages.splice(pi, 1) })}>✕</button>
              </div>
              <div className="edit-line">
                {showReading && (
                  <input
                    value={p.reading ?? ''}
                    placeholder="발음(병음/후리가나)"
                    onChange={(e) => update((s) => { s.passages[pi].reading = e.target.value || undefined })}
                  />
                )}
                <input
                  value={p.meaning}
                  placeholder="뜻 (선택, 퀴즈에 쓰려면 입력)"
                  onChange={(e) => update((s) => { s.passages[pi].meaning = e.target.value })}
                />
              </div>
              <div className="edit-line">
                <AudioField
                  scope={scope}
                  value={p.audio}
                  slug={p.text}
                  onChange={(f) => update((s) => { s.passages[pi].audio = f })}
                />
                {showReading && (
                  <input
                    className="tok"
                    value={(p.tokens ?? []).join(' ')}
                    placeholder="타일 분절 (你 去 哪儿) · 비우면 새단어로 자동"
                    onChange={(e) =>
                      update((s) => { s.passages[pi].tokens = e.target.value.split(' ').filter(Boolean) })
                    }
                  />
                )}
              </div>
              <div className="edit-line">
                <input
                  value={p.tip ?? ''}
                  placeholder="💡 해석 팁 (선택) — 어순·뉘앙스 메모"
                  onChange={(e) => update((s) => { s.passages[pi].tip = e.target.value || undefined })}
                />
                <QuizToggle
                  on={p.quizEnabled !== false}
                  onChange={(v) => update((s) => { s.passages[pi].quizEnabled = v ? undefined : false })}
                />
              </div>
            </div>
          ))}
          <button
            className="pill soft tiny"
            onClick={() => update((s) => { s.passages.push(newSentence(s.id)) })}
          >＋ 문장 직접 추가</button>
        </>
      )}

      {/* 새단어 */}
      <h5>🔤 새단어</h5>
      {section.words.map((w, wi) => (
        <div key={w.id} className="edit-item">
          <div className="edit-line">
            <input
              value={w.text}
              placeholder="단어 (你好)"
              onChange={(e) => update((s) => { s.words[wi].text = e.target.value })}
            />
            {showReading && (
              <input
                value={w.reading ?? ''}
                placeholder="발음"
                onChange={(e) => update((s) => { s.words[wi].reading = e.target.value || undefined })}
              />
            )}
            <input
              value={w.meaning}
              placeholder="뜻"
              onChange={(e) => update((s) => { s.words[wi].meaning = e.target.value })}
            />
            <button className="mini-del" onClick={() => update((s) => { s.words.splice(wi, 1) })}>✕</button>
          </div>
          <div className="edit-line">
            <AudioField
              scope={scope}
              value={w.audio}
              slug={w.text}
              onChange={(f) => update((s) => { s.words[wi].audio = f })}
            />
            <input
              className="tok"
              value={w.pos ?? ''}
              placeholder="품사 (명사/동사…)"
              onChange={(e) => update((s) => { s.words[wi].pos = e.target.value || undefined })}
            />
            <QuizToggle
              on={w.quizEnabled !== false}
              onChange={(v) => update((s) => { s.words[wi].quizEnabled = v ? undefined : false })}
            />
          </div>
          <div className="edit-line">
            <input
              value={w.example ?? ''}
              placeholder="📝 예문 (선택)"
              onChange={(e) => update((s) => { s.words[wi].example = e.target.value || undefined })}
            />
            <input
              value={w.note ?? ''}
              placeholder="✏️ 나의 메모 (선택)"
              onChange={(e) => update((s) => { s.words[wi].note = e.target.value || undefined })}
            />
          </div>
        </div>
      ))}
      <button className="pill soft" onClick={() => update((s) => { s.words.push(newWord(s.id)) })}>＋ 새단어</button>

      {/* 문법 */}
      <h5>📐 문법</h5>
      {section.grammar.map((g, gi) => (
        <div key={g.id} className="edit-item">
          <div className="edit-line">
            <input
              value={g.point}
              placeholder="문법 제목 (예: 동사 + 吗 의문문)"
              onChange={(e) => update((s) => { s.grammar[gi].point = e.target.value })}
            />
            <button className="mini-del" onClick={() => update((s) => { s.grammar.splice(gi, 1) })}>✕</button>
          </div>
          <textarea
            className="g-explain"
            value={g.explanation}
            placeholder="설명"
            rows={2}
            onChange={(e) => update((s) => { s.grammar[gi].explanation = e.target.value })}
          />
          {g.examples.map((ex, ei) => (
            <div key={ex.id} className="edit-line indent">
              <input
                value={ex.text}
                placeholder="예문"
                onChange={(e) => update((s) => { s.grammar[gi].examples[ei].text = e.target.value })}
              />
              <input
                value={ex.meaning}
                placeholder="뜻"
                onChange={(e) => update((s) => { s.grammar[gi].examples[ei].meaning = e.target.value })}
              />
              <button
                className="mini-del"
                onClick={() => update((s) => { s.grammar[gi].examples.splice(ei, 1) })}
              >✕</button>
            </div>
          ))}
          <button
            className="pill soft tiny"
            onClick={() => update((s) => { s.grammar[gi].examples.push(newGrammarExample(s.grammar[gi].id)) })}
          >＋ 예문</button>
        </div>
      ))}
      <button className="pill soft" onClick={() => update((s) => { s.grammar.push(newGrammar(s.id)) })}>＋ 문법</button>
    </div>
  )
}
