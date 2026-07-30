import { useRef, useState } from 'react'
import type { Course, Lesson, Section, Unit } from '../types'
import { lessonSections } from '../lib/lessonModel'
import { deleteCustomBook, isBuiltinBook, isCustomBook, newBookId, parseBookJson, upsertBook } from '../lib/books'
import { putImage } from '../lib/imageStore'
import AudioField from './AudioField'
import ImageThumb from './ImageThumb'

interface Props {
  course: Course
  initial?: Unit
  onDone: (savedBookId?: string) => void
  onBack: () => void
}

const EMOJIS = ['📕', '📗', '📘', '📙', '📓', '🥟', '⚡️', '☕️', '🌠', '🕵️', '🎬', '🎵', '🌸', '🧸']

function newSection(title = '본문'): Section {
  return { title, passages: [], words: [], grammar: [] }
}
function newChapter(): Lesson {
  return { title: '', context: '', sections: [newSection()] }
}

/** 편집용으로 정규화 (평면 구조 → 섹션 구조) */
function toEditable(unit?: Unit, courseId?: string): Unit {
  if (!unit)
    return {
      id: '',
      title: '',
      emoji: '📕',
      track: 'media',
      sourceType: 'textbook',
      sourceTitle: '',
      lessons: [newChapter()],
    }
  return {
    ...unit,
    lessons: unit.lessons.map((l) => ({
      title: l.title,
      context: l.context ?? '',
      sections: lessonSections(l).map((s) => ({
        title: s.title,
        passageText: s.passageText ?? '',
        passageTranslation: s.passageTranslation ?? '',
        passageAudio: s.passageAudio,
        passages: [...(s.passages ?? [])],
        words: [...(s.words ?? [])],
        grammar: (s.grammar ?? []).map((g) => ({ point: g.point, explanation: g.explanation, examples: [...(g.examples ?? [])] })),
      })),
    })),
  }
}

/** 본문 전체 텍스트를 문장 부호 기준으로 쪼갬 (퀴즈용 문장 자동 생성) */
function splitPassage(text: string): string[] {
  return text
    .split(/(?<=[。！？.!?…])\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export default function Editor({ course, initial, onDone, onBack }: Props) {
  const [book, setBook] = useState<Unit>(() => toEditable(initial, course.id))
  const [openCh, setOpenCh] = useState(0)
  const [showJson, setShowJson] = useState<'none' | 'import' | 'export'>('none')
  const [jsonText, setJsonText] = useState('')
  const [error, setError] = useState('')
  const [openDetail, setOpenDetail] = useState<Record<string, boolean>>({})
  const toggleDetail = (li: number, si: number) =>
    setOpenDetail((d) => ({ ...d, [`${li}-${si}`]: !d[`${li}-${si}`] }))

  const isNew = !initial
  const builtin = initial ? isBuiltinBook(course.id, initial.id) : false
  const custom = initial ? isCustomBook(course.id, initial.id) : false

  /** 깊은 복제 후 수정 — 중첩 구조를 안전하게 업데이트 */
  function mutate(fn: (b: Unit) => void) {
    setBook((b) => {
      const draft: Unit = JSON.parse(JSON.stringify(b))
      fn(draft)
      return draft
    })
  }
  const sec = (b: Unit, li: number, si: number) => b.lessons[li].sections![si]
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
      await putImage(course.id, name, f)
      names.push(name)
    }
    mutate((b) => {
      const s = sec(b, target.li, target.si)
      s.images = [...(s.images ?? []), ...names]
    })
    e.target.value = ''
  }

  function save() {
    if (!book.title.trim()) return setError('책 제목을 입력해 주세요.')
    const lessons = book.lessons
      .map((l) => ({
        title: l.title.trim(),
        context: l.context?.trim() || undefined,
        sections: (l.sections ?? [])
          .map((s) => ({
            title: s.title.trim() || '본문',
            passageText: s.passageText?.trim() || undefined,
            passageTranslation: s.passageTranslation?.trim() || undefined,
            passageAudio: s.passageAudio,
            passages: s.passages.filter((p) => p.text.trim()),
            words: s.words.filter((w) => w.text.trim() && w.meaning.trim()),
            grammar: s.grammar
              .filter((g) => g.point.trim())
              .map((g) => ({
                point: g.point.trim(),
                explanation: g.explanation.trim(),
                examples: g.examples.filter((e) => e.text.trim()),
              })),
          }))
          .filter((s) => s.passageText || s.passages.length || s.words.length || s.grammar.length),
      }))
      .filter((l) => l.title && l.sections.length)
    if (lessons.length === 0) return setError('내용이 있는 챕터가 최소 1개 필요해요. (본문·새단어·문법 중 하나는 채워주세요)')
    const id = book.id || newBookId(course.id)
    upsertBook(course.id, { ...book, id, lessons })
    onDone(id)
  }

  function importJson() {
    const parsed = parseBookJson(jsonText)
    if (typeof parsed === 'string') return setError(parsed)
    setBook(toEditable({ ...parsed, id: initial?.id ?? parsed.id }, course.id))
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
                <span className="chapter-meta">{(lesson.sections ?? []).length}개 소카테고리 {openCh === li ? '▲' : '▼'}</span>
              </button>
              {openCh === li && (
                <div className="chapter-body">
                  <div className="editor-inline">
                    <input value={lesson.title} placeholder="챕터 제목 (예: 3과 — 你去哪儿?)" onChange={(e) => mutate((b) => { b.lessons[li].title = e.target.value })} />
                    <input value={lesson.context ?? ''} placeholder="한 줄 설명 (선택)" onChange={(e) => mutate((b) => { b.lessons[li].context = e.target.value })} />
                  </div>

                  {(lesson.sections ?? []).map((section, si) => (
                    <div key={si} className="section-card">
                      <div className="section-head">
                        <span className="section-tag">📂 소카테고리</span>
                        <input className="section-title" value={section.title} placeholder="예: 회화1 / 본문 / 독해" onChange={(e) => mutate((b) => { sec(b, li, si).title = e.target.value })} />
                        {(lesson.sections?.length ?? 0) > 1 && (
                          <button className="mini-del" title="소카테고리 삭제" onClick={() => mutate((b) => { b.lessons[li].sections!.splice(si, 1) })}>🗑</button>
                        )}
                      </div>

                      {/* 첨부 이미지 (교재 페이지 스캔 등) */}
                      <h5>🖼 첨부 이미지</h5>
                      <div className="img-gallery-edit">
                        {(section.images ?? []).map((img, ii) => (
                          <div key={ii} className="img-gallery-item">
                            <ImageThumb ns={course.id} file={img} />
                            <button className="mini-del gallery-del" onClick={() => mutate((b) => { sec(b, li, si).images = (sec(b, li, si).images ?? []).filter((_, j) => j !== ii) })}>✕</button>
                          </div>
                        ))}
                        <button className="pill soft tiny" onClick={() => openGalleryPicker(li, si)}>＋ 이미지 추가</button>
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
                          onChange={(e) => mutate((b) => { sec(b, li, si).passageText = e.target.value })}
                        />
                        <label className="mini-label">번역 전체 (선택)</label>
                        <textarea
                          className="passage-textarea"
                          value={section.passageTranslation ?? ''}
                          placeholder="전체 번역 (선택)"
                          rows={3}
                          onChange={(e) => mutate((b) => { sec(b, li, si).passageTranslation = e.target.value })}
                        />
                        <div className="edit-line">
                          <AudioField courseId={course.id} value={section.passageAudio} slug={section.title} onChange={(f) => mutate((b) => { sec(b, li, si).passageAudio = f })} />
                          <span className="hint-inline">선생님 낭독 전체 녹음</span>
                        </div>
                        {(section.passageText ?? '').trim() && (
                          <button
                            className="pill soft tiny"
                            onClick={() => mutate((b) => {
                              const s = sec(b, li, si)
                              const parts = splitPassage(s.passageText ?? '')
                              const existing = new Set(s.passages.map((p) => p.text))
                              for (const t of parts) if (!existing.has(t)) s.passages.push({ text: t, meaning: '' })
                            })}
                          >
                            ✂️ 문장으로 자동 분리 (퀴즈용, 선택)
                          </button>
                        )}
                      </div>

                      {section.passages.length > 0 && (
                        <button className="pill soft tiny detail-toggle" onClick={() => toggleDetail(li, si)}>
                          {openDetail[`${li}-${si}`] ? '▲ 문장별 세부 편집 접기' : `▼ 문장별 세부 편집 (${section.passages.length}개 · 퀴즈/개별듣기용, 선택)`}
                        </button>
                      )}
                      {openDetail[`${li}-${si}`] && section.passages.map((p, pi) => (
                        <div key={pi} className="edit-item">
                          <div className="edit-line">
                            <input value={p.text} placeholder="문장 (你去哪儿？)" onChange={(e) => mutate((b) => { sec(b, li, si).passages[pi].text = e.target.value })} />
                            <button className="mini-del" onClick={() => mutate((b) => { sec(b, li, si).passages.splice(pi, 1) })}>✕</button>
                          </div>
                          <div className="edit-line">
                            {course.id !== 'en' && <input value={p.reading ?? ''} placeholder="발음(병음/후리가나)" onChange={(e) => mutate((b) => { sec(b, li, si).passages[pi].reading = e.target.value || undefined })} />}
                            <input value={p.meaning} placeholder="뜻 (선택, 퀴즈에 쓰려면 입력)" onChange={(e) => mutate((b) => { sec(b, li, si).passages[pi].meaning = e.target.value })} />
                          </div>
                          <div className="edit-line">
                            <AudioField courseId={course.id} value={p.audio} slug={p.text} onChange={(f) => mutate((b) => { sec(b, li, si).passages[pi].audio = f })} />
                            {course.id !== 'en' && <input className="tok" value={(p.tokens ?? []).join(' ')} placeholder="타일 분절 (你 去 哪儿) · 비우면 글자단위" onChange={(e) => mutate((b) => { sec(b, li, si).passages[pi].tokens = e.target.value.split(' ').filter(Boolean) })} />}
                          </div>
                        </div>
                      ))}
                      {openDetail[`${li}-${si}`] && (
                        <button className="pill soft tiny" onClick={() => mutate((b) => { sec(b, li, si).passages.push({ text: '', meaning: '' }) })}>＋ 문장 직접 추가</button>
                      )}

                      {/* 새단어 */}
                      <h5>🔤 새단어</h5>
                      {section.words.map((w, wi) => (
                        <div key={wi} className="edit-item">
                          <div className="edit-line">
                            <input value={w.text} placeholder="단어 (你好)" onChange={(e) => mutate((b) => { sec(b, li, si).words[wi].text = e.target.value })} />
                            {course.id !== 'en' && <input value={w.reading ?? ''} placeholder="발음" onChange={(e) => mutate((b) => { sec(b, li, si).words[wi].reading = e.target.value || undefined })} />}
                            <input value={w.meaning} placeholder="뜻" onChange={(e) => mutate((b) => { sec(b, li, si).words[wi].meaning = e.target.value })} />
                            <button className="mini-del" onClick={() => mutate((b) => { sec(b, li, si).words.splice(wi, 1) })}>✕</button>
                          </div>
                          <AudioField courseId={course.id} value={w.audio} slug={w.text} onChange={(f) => mutate((b) => { sec(b, li, si).words[wi].audio = f })} />
                        </div>
                      ))}
                      <button className="pill soft" onClick={() => mutate((b) => { sec(b, li, si).words.push({ text: '', meaning: '' }) })}>＋ 새단어</button>

                      {/* 문법 */}
                      <h5>📐 문법</h5>
                      {section.grammar.map((g, gi) => (
                        <div key={gi} className="edit-item">
                          <div className="edit-line">
                            <input value={g.point} placeholder="문법 제목 (예: 동사 + 吗 의문문)" onChange={(e) => mutate((b) => { sec(b, li, si).grammar[gi].point = e.target.value })} />
                            <button className="mini-del" onClick={() => mutate((b) => { sec(b, li, si).grammar.splice(gi, 1) })}>✕</button>
                          </div>
                          <textarea className="g-explain" value={g.explanation} placeholder="설명" rows={2} onChange={(e) => mutate((b) => { sec(b, li, si).grammar[gi].explanation = e.target.value })} />
                          {g.examples.map((ex, ei) => (
                            <div key={ei} className="edit-line indent">
                              <input value={ex.text} placeholder="예문" onChange={(e) => mutate((b) => { sec(b, li, si).grammar[gi].examples[ei].text = e.target.value })} />
                              <input value={ex.meaning} placeholder="뜻" onChange={(e) => mutate((b) => { sec(b, li, si).grammar[gi].examples[ei].meaning = e.target.value })} />
                              <button className="mini-del" onClick={() => mutate((b) => { sec(b, li, si).grammar[gi].examples.splice(ei, 1) })}>✕</button>
                            </div>
                          ))}
                          <button className="pill soft tiny" onClick={() => mutate((b) => { sec(b, li, si).grammar[gi].examples.push({ text: '', meaning: '' }) })}>＋ 예문</button>
                        </div>
                      ))}
                      <button className="pill soft" onClick={() => mutate((b) => { sec(b, li, si).grammar.push({ point: '', explanation: '', examples: [] }) })}>＋ 문법</button>
                    </div>
                  ))}

                  <button className="pill" onClick={() => mutate((b) => { b.lessons[li].sections!.push(newSection('')) })}>＋ 소카테고리 추가</button>
                  {book.lessons.length > 1 && (
                    <button className="pill danger-text" onClick={() => { if (confirm('이 챕터를 삭제할까요?')) mutate((b) => { b.lessons.splice(li, 1) }) }}>이 챕터 삭제</button>
                  )}
                </div>
              )}
            </div>
          ))}

          <button className="pill big" onClick={() => { mutate((b) => { b.lessons.push(newChapter()) }); setOpenCh(book.lessons.length) }}>＋ 챕터 추가</button>

          {error && <p className="editor-error">⚠️ {error}</p>}

          <div className="editor-actions">
            <button className="pill primary big" onClick={save}>💾 저장</button>
            {custom && (
              <button className="pill danger big" onClick={() => {
                const msg = builtin ? '수정 내용을 버리고 원래 내장 책으로 되돌릴까요?' : '이 책을 책장에서 삭제할까요?'
                if (confirm(msg)) { deleteCustomBook(course.id, book.id); onDone(builtin ? book.id : undefined) }
              }}>{builtin ? '원본으로 되돌리기' : '책 삭제'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
