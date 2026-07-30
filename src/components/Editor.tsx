import { useRef, useState } from 'react'
import type { Unit } from '../types'
import {
  adoptIds,
  newLesson,
  newSection,
  normalizeBook,
  rekeyBook,
} from '../lib/normalize'
import { deleteCustomBook, isBuiltinBook, isCustomBook, newBookId, parseBookJson, upsertBook } from '../lib/books'
import { putImage } from '../lib/imageStore'
import { LANGUAGES, languageOf } from '../data'
import SectionEditor from './SectionEditor'

interface Props {
  lang: string // 새 책을 만들 때 기본 언어 (지금 책장 탭)
  initial?: Unit
  onDone: (savedBookId?: string) => void
  onBack: () => void
}

const EMOJIS = ['📕', '📗', '📘', '📙', '📓', '🥟', '⚡️', '☕️', '🌠', '🕵️', '🎬', '🎵', '🌸', '🧸']

/**
 * 편집용 사본. **id는 절대 건드리지 않는다** — id가 바뀌면 그 항목에 쌓인 숙련도와
 * 학습 기록이 끊긴다. 새 책은 여기서 책 id를 미리 발급해 하위 id의 접두사로 쓴다.
 */
function toEditable(unit: Unit | undefined, lang: string): Unit {
  if (!unit) {
    const id = newBookId(lang)
    return {
      id,
      lang,
      title: '',
      emoji: '📕',
      track: 'media',
      sourceType: 'textbook',
      sourceTitle: '',
      lessons: [newLesson(id)],
    }
  }
  return normalizeBook(unit, unit.id)
}

export default function Editor({ lang, initial, onDone, onBack }: Props) {
  const [book, setBook] = useState<Unit>(() => toEditable(initial, lang))
  const bookId = book.id
  const [openCh, setOpenCh] = useState(0)
  const [showJson, setShowJson] = useState<'none' | 'import' | 'export'>('none')
  const [jsonText, setJsonText] = useState('')
  const [error, setError] = useState('')

  const isNew = !initial
  const builtin = initial ? isBuiltinBook(initial.id) : false
  const custom = initial ? isCustomBook(initial.id) : false

  /** 깊은 복제 후 수정 — 중첩 구조를 안전하게 업데이트 */
  function mutate(fn: (b: Unit) => void) {
    setBook((b) => {
      const draft: Unit = JSON.parse(JSON.stringify(b))
      fn(draft)
      return draft
    })
  }
  const sec = (b: Unit, li: number, si: number) => b.lessons[li].sections[si]
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const galleryTarget = useRef<{ li: number; si: number } | null>(null)

  function openGalleryPicker(li: number, si: number) {
    galleryTarget.current = { li, si }
    galleryInputRef.current?.click()
  }

  async function onGalleryFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    const target = galleryTarget.current
    if (!files.length || !target) return
    const names: string[] = []
    for (const f of files) {
      const name = `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`
      await putImage(book.lang, name, f)
      names.push(name)
    }
    mutate((b) => {
      const s = sec(b, target.li, target.si)
      s.images = [...(s.images ?? []), ...names]
    })
    e.target.value = ''
  }

  /** 빈 항목만 걸러내고 저장. id·order는 그대로 넘긴다. */
  function save() {
    if (!book.title.trim()) return setError('책 제목을 입력해 주세요.')
    const lessons = book.lessons
      .map((l) => ({
        ...l,
        title: l.title.trim(),
        context: l.context?.trim() || undefined,
        sections: l.sections
          .map((s) => ({
            ...s,
            title: s.title.trim() || '본문',
            passageText: s.passageText?.trim() || undefined,
            passageTranslation: s.passageTranslation?.trim() || undefined,
            passages: s.passages.filter((p) => p.text.trim()),
            words: s.words.filter((w) => w.text.trim() && w.meaning.trim()),
            grammar: s.grammar
              .filter((g) => g.point.trim())
              .map((g) => ({
                ...g,
                point: g.point.trim(),
                explanation: g.explanation.trim(),
                examples: g.examples.filter((e) => e.text.trim()),
              })),
          }))
          .filter((s) => s.passageText || s.passages.length || s.words.length || s.grammar.length),
      }))
      .filter((l) => l.title && l.sections.length)
    if (lessons.length === 0) return setError('내용이 있는 챕터가 최소 1개 필요해요. (본문·새단어·문법 중 하나는 채워주세요)')
    upsertBook({ ...book, lessons })
    onDone(book.id)
  }

  function importJson() {
    // 붙여넣은 JSON에 id가 없으면, 지금 편집 중인 책에서 같은 텍스트의 id를 물려받는다.
    // (같은 과를 AI로 다시 만들어 붙여넣어도 숙련도가 리셋되지 않는다)
    let raw: unknown
    try {
      raw = JSON.parse(jsonText)
    } catch {
      return setError('JSON 형식이 아니에요. 중괄호 { } 전체를 붙여넣었는지 확인해 주세요.')
    }
    const withIds = adoptIds(raw as Parameters<typeof adoptIds>[0], book)
    const parsed = parseBookJson(JSON.stringify(withIds), book.id, book.lang)
    if (typeof parsed === 'string') return setError(parsed)
    setBook(parsed)
    setShowJson('none')
    setJsonText('')
    setError('')
    setOpenCh(0)
  }

  function exportJson() {
    const clean = {
      ...book,
      lessons: book.lessons.map((l) => ({ ...l, context: l.context || undefined })),
    }
    const text = JSON.stringify(clean, null, 2)
    setJsonText(text)
    setShowJson('export')
    navigator.clipboard?.writeText(text).catch(() => {})
  }

  return (
    <div className="desktop-page">
      <div className="win editor-win">
        <div className="win-bar bar-purple">
          <span className="win-dots"><i className="win-dot dot-r" /><i className="win-dot dot-y" /><i className="win-dot dot-g" /></span>
          <span className="win-title">{isNew ? 'NEW_BOOK.EXE' : 'EDIT_BOOK.EXE'}</span>
          <button className="win-x" onClick={onBack}>×</button>
        </div>
        <div className="win-body">
          <input ref={galleryInputRef} type="file" accept="image/*" multiple hidden onChange={onGalleryFiles} />
          {/* 책 정보 */}
          <div className="editor-field">
            <label>책 제목</label>
            <input value={book.title} placeholder="예: 맛있는 중국어 L2" onChange={(e) => mutate((b) => { b.title = e.target.value })} />
          </div>
          <div className="editor-field">
            <label>언어</label>
            <div className="editor-inline">
              <select
                value={book.lang}
                onChange={(e) => {
                  // 새 책은 id의 언어 접두사도 따라가야 한다 (하위 id까지 함께 다시 매김).
                  // 이미 저장된 책은 select가 비활성이라 여기로 오지 않는다.
                  const next = e.target.value
                  setBook((b) => ({ ...rekeyBook(b, newBookId(next)), lang: next }))
                }}
                disabled={!!initial}
                title={initial ? '이미 만든 책의 언어는 바꿀 수 없어요 (녹음·사진이 언어별로 저장돼 있어요)' : undefined}
              >
                {(LANGUAGES.some((l) => l.id === book.lang) ? LANGUAGES : [...LANGUAGES, languageOf(book.lang)]).map((l) => (
                  <option key={l.id} value={l.id}>{l.flag} {l.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="editor-field">
            <label>책 종류</label>
            <div className="editor-inline">
              <select value={book.track} onChange={(e) => mutate((b) => { b.track = e.target.value as Unit['track'] })}>
                <option value="media">📚 교재 · 미디어</option>
                <option value="vocab">📇 단어장</option>
                <option value="foundation">🌱 기초</option>
              </select>
            </div>
          </div>
          <div className="editor-field">
            <label>표지 이모지</label>
            <div className="emoji-row">
              {EMOJIS.map((e) => (
                <button key={e} className={`emoji-pick ${book.emoji === e ? 'selected' : ''}`} onClick={() => mutate((b) => { b.emoji = e })}>{e}</button>
              ))}
            </div>
          </div>
          <div className="editor-field">
            <label>출처 (선택)</label>
            <div className="editor-inline">
              <select value={book.sourceType ?? 'book'} onChange={(e) => mutate((b) => { b.sourceType = e.target.value as Unit['sourceType'] })}>
                <option value="book">📖 책</option>
                <option value="textbook">📘 교재</option>
                <option value="drama">🎬 드라마</option>
                <option value="movie">🎞 영화</option>
                <option value="anime">✨ 애니</option>
              </select>
              <input value={book.sourceTitle ?? ''} placeholder="원작 제목" onChange={(e) => mutate((b) => { b.sourceTitle = e.target.value })} />
            </div>
          </div>

          {/* JSON 가져오기/내보내기 */}
          <div className="editor-inline json-btns">
            <button className="pill" onClick={() => { setShowJson(showJson === 'import' ? 'none' : 'import'); setJsonText(''); setError('') }}>🤖 JSON 붙여넣기</button>
            <button className="pill" onClick={exportJson}>📤 JSON 내보내기</button>
          </div>
          {showJson === 'import' && (
            <div className="json-box">
              <p className="editor-hint">AI에게 <b>"README 형식으로 ○○책 △과 본문·새단어·문법 만들어줘"</b> 라고 한 뒤 결과 JSON 전체를 붙여넣으세요. (섹션 구조 지원)</p>
              <textarea value={jsonText} onChange={(e) => setJsonText(e.target.value)} placeholder='{ "title": "...", "lessons": [ { "title": "1과", "sections": [...] } ] }' rows={7} />
              <button className="pill primary" onClick={importJson}>불러오기</button>
            </div>
          )}
          {showJson === 'export' && (
            <div className="json-box">
              <p className="editor-hint">📋 클립보드에 복사했어요.</p>
              <textarea value={jsonText} readOnly rows={7} />
            </div>
          )}

          {/* 챕터들 */}
          {book.lessons.map((lesson, li) => (
            <div key={li} className="chapter-card">
              <button className="chapter-head" onClick={() => setOpenCh(openCh === li ? -1 : li)}>
                <span>📑 {li + 1}장 — {lesson.title || '(제목 없음)'}</span>
                <span className="chapter-meta">{lesson.sections.length}개 소카테고리 {openCh === li ? '▲' : '▼'}</span>
              </button>
              {openCh === li && (
                <div className="chapter-body">
                  <div className="editor-inline">
                    <input value={lesson.title} placeholder="챕터 제목 (예: 3과 — 你去哪儿?)" onChange={(e) => mutate((b) => { b.lessons[li].title = e.target.value })} />
                    <input value={lesson.context ?? ''} placeholder="한 줄 설명 (선택)" onChange={(e) => mutate((b) => { b.lessons[li].context = e.target.value })} />
                  </div>

                  {lesson.sections.map((section, si) => (
                    <SectionEditor
                      key={section.id}
                      section={section}
                      lang={book.lang}
                      canDelete={lesson.sections.length > 1}
                      update={(fn) => mutate((b) => fn(sec(b, li, si)))}
                      onDelete={() => mutate((b) => { b.lessons[li].sections.splice(si, 1) })}
                      onPickImages={() => openGalleryPicker(li, si)}
                    />
                  ))}

                  <button className="pill" onClick={() => mutate((b) => { b.lessons[li].sections.push(newSection(b.lessons[li].id, '')) })}>＋ 소카테고리 추가</button>
                  {book.lessons.length > 1 && (
                    <button className="pill danger-text" onClick={() => { if (confirm('이 챕터를 삭제할까요?')) mutate((b) => { b.lessons.splice(li, 1) }) }}>이 챕터 삭제</button>
                  )}
                </div>
              )}
            </div>
          ))}

          <button className="pill big" onClick={() => { mutate((b) => { b.lessons.push(newLesson(bookId)) }); setOpenCh(book.lessons.length) }}>＋ 챕터 추가</button>

          {error && <p className="editor-error">⚠️ {error}</p>}

          <div className="editor-actions">
            <button className="pill primary big" onClick={save}>💾 저장</button>
            {custom && (
              <button className="pill danger big" onClick={() => {
                const msg = builtin ? '수정 내용을 버리고 원래 내장 책으로 되돌릴까요?' : '이 책을 책장에서 삭제할까요?'
                if (confirm(msg)) { deleteCustomBook(book.id); onDone(builtin ? book.id : undefined) }
              }}>{builtin ? '원본으로 되돌리기' : '책 삭제'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
