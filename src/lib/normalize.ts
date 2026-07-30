// 외부에서 들어오는 책 데이터를 정규 스키마(types.ts)로 변환하는 단일 경계.
//
// 여기를 통과해야 하는 입력은 셋이다.
//   1. 내장 JSON (src/data/**)         — 변환 스크립트로 id가 이미 박혀 있지만, 없어도 동작해야 함
//   2. 사용자가 붙여넣은 AI 생성 JSON  — id 없음
//   3. 구버전 localStorage의 내 책      — id 없음 + 평면 구조(words/sentences)일 수 있음
//
// 규칙:
//  - id가 **이미 있으면 절대 바꾸지 않는다.** id를 바꾸면 SRS 이력과 학습 기록이 끊긴다.
//  - id가 없으면 위치 기반으로 만든다. 지금 순서 그대로이므로 여러 번 실행해도 같은 값이 나온다.
//  - 중복 id는 뒤에 온 쪽에 접미사를 붙여 떼어낸다 (id는 전역 고유여야 한다).
import type { Grammar, Lesson, Section, Sentence, Unit, Word } from '../types'

// ── 느슨한 입력 타입 (뭐가 올지 모른다) ──────────────────
export interface RawWord {
  id?: string
  text?: string
  reading?: string
  meaning?: string
  audio?: string
  pos?: string
  example?: string
  note?: string
  quizEnabled?: boolean
}

export interface RawSentence extends RawWord {
  tokens?: string[]
  tip?: string
}

export interface RawGrammar {
  id?: string
  point?: string
  explanation?: string
  examples?: RawSentence[]
}

export interface RawSection {
  id?: string
  order?: number
  title?: string
  kind?: string
  passageText?: string
  passageTranslation?: string
  passageAudio?: string
  passages?: RawSentence[]
  words?: RawWord[]
  grammar?: RawGrammar[]
  images?: string[]
}

export interface RawLesson {
  id?: string
  order?: number
  title?: string
  context?: string
  sections?: RawSection[]
  /** 구버전 평면 구조 — 단일 섹션으로 승격된다 */
  words?: RawWord[]
  sentences?: RawSentence[]
}

export interface RawUnit {
  id?: string
  lang?: string
  title?: string
  emoji?: string
  track?: string
  sourceType?: string
  sourceTitle?: string
  lessons?: RawLesson[]
  createdAt?: string
  updatedAt?: string
}

const SECTION_KINDS = ['passage', 'vocab', 'grammar', 'writing', 'speaking', 'listening'] as const
const TRACKS = ['foundation', 'media', 'vocab'] as const
const SOURCE_TYPES = ['book', 'drama', 'movie', 'anime', 'textbook'] as const

function oneOf<T extends readonly string[]>(list: T, v: unknown, fallback: T[number]): T[number] {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T[number]) : fallback
}

function optional<T extends readonly string[]>(list: T, v: unknown): T[number] | undefined {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T[number]) : undefined
}

/**
 * id 발급기. 같은 책을 정규화하는 동안 이미 쓰인 id를 기억해 중복을 막는다.
 * 기존 id는 그대로 통과시키고, 없을 때만 `${parent}/${prefix}${n}` 을 만든다.
 */
class IdMinter {
  private used = new Set<string>()

  /** 이미 확정된 id를 등록 (충돌 검사용) */
  private claim(id: string): string {
    if (!this.used.has(id)) {
      this.used.add(id)
      return id
    }
    let n = 2
    while (this.used.has(`${id}-${n}`)) n++
    const fresh = `${id}-${n}`
    this.used.add(fresh)
    return fresh
  }

  take(existing: string | undefined, parent: string, prefix: string, index: number): string {
    const id = existing && existing.trim() ? existing.trim() : `${parent}/${prefix}${index + 1}`
    return this.claim(id)
  }
}

function normalizeWord(raw: RawWord, mint: IdMinter, sectionId: string, i: number): Word {
  const w: Word = {
    id: mint.take(raw.id, sectionId, 'w', i),
    text: String(raw.text ?? ''),
    meaning: String(raw.meaning ?? ''),
  }
  if (raw.reading) w.reading = raw.reading
  if (raw.audio) w.audio = raw.audio
  if (raw.pos) w.pos = raw.pos
  if (raw.example) w.example = raw.example
  if (raw.note) w.note = raw.note
  if (raw.quizEnabled === false) w.quizEnabled = false
  return w
}

function normalizeSentence(
  raw: RawSentence,
  mint: IdMinter,
  parentId: string,
  prefix: string,
  i: number
): Sentence {
  const s: Sentence = {
    id: mint.take(raw.id, parentId, prefix, i),
    text: String(raw.text ?? ''),
    meaning: String(raw.meaning ?? ''),
  }
  if (raw.reading) s.reading = raw.reading
  if (raw.audio) s.audio = raw.audio
  if (Array.isArray(raw.tokens) && raw.tokens.length > 0) s.tokens = raw.tokens.filter(Boolean)
  if (raw.tip) s.tip = raw.tip
  if (raw.quizEnabled === false) s.quizEnabled = false
  return s
}

function normalizeGrammar(raw: RawGrammar, mint: IdMinter, sectionId: string, i: number): Grammar {
  const id = mint.take(raw.id, sectionId, 'g', i)
  return {
    id,
    point: String(raw.point ?? ''),
    explanation: String(raw.explanation ?? ''),
    // 문법 예문도 문장이므로 SRS 대상이다. 부모를 문법 id로 두어 소속이 드러나게 한다.
    examples: (raw.examples ?? []).map((ex, ei) => normalizeSentence(ex, mint, id, 'e', ei)),
  }
}

function normalizeSection(raw: RawSection, mint: IdMinter, lessonId: string, i: number): Section {
  const id = mint.take(raw.id, lessonId, 's', i)
  const section: Section = {
    id,
    order: typeof raw.order === 'number' ? raw.order : i,
    title: String(raw.title ?? '본문'),
    passages: (raw.passages ?? []).map((p, pi) => normalizeSentence(p, mint, id, 'p', pi)),
    words: (raw.words ?? []).map((w, wi) => normalizeWord(w, mint, id, wi)),
    grammar: (raw.grammar ?? []).map((g, gi) => normalizeGrammar(g, mint, id, gi)),
  }
  const kind = optional(SECTION_KINDS, raw.kind)
  if (kind) section.kind = kind
  if (raw.passageText) section.passageText = raw.passageText
  if (raw.passageTranslation) section.passageTranslation = raw.passageTranslation
  if (raw.passageAudio) section.passageAudio = raw.passageAudio
  if (Array.isArray(raw.images) && raw.images.length > 0) section.images = [...raw.images]
  return section
}

/** 평면 구조(words/sentences)를 단일 섹션으로 승격 */
function sectionsOf(raw: RawLesson): RawSection[] {
  if (Array.isArray(raw.sections) && raw.sections.length > 0) return raw.sections
  return [{ title: '본문', words: raw.words ?? [], passages: raw.sentences ?? [], grammar: [] }]
}

function normalizeLesson(raw: RawLesson, mint: IdMinter, bookId: string, i: number): Lesson {
  const id = mint.take(raw.id, bookId, 'c', i)
  const lesson: Lesson = {
    id,
    order: typeof raw.order === 'number' ? raw.order : i,
    title: String(raw.title ?? ''),
    sections: sectionsOf(raw).map((s, si) => normalizeSection(s, mint, id, si)),
  }
  if (raw.context) lesson.context = raw.context
  return lesson
}

/**
 * 책의 언어. `lang` 필드가 없는 예전 데이터는 id 접두사에서 유추한다
 * (내장 책 `zh-mccs-l1-conv`, 내 책 `zh-book-1234` 둘 다 언어로 시작한다).
 */
export function langOf(raw: RawUnit, id: string): string {
  if (raw.lang && raw.lang.trim()) return raw.lang.trim()
  const m = /^([a-z]{2,3})-/.exec(id)
  return m ? m[1] : 'zh'
}

/**
 * 책 하나를 정규 스키마로. 이 함수는 순수하며 여러 번 적용해도 결과가 같다(멱등).
 * @param fallbackId 책에 id가 없을 때 쓸 id (예: 새로 만든 책)
 */
export function normalizeBook(raw: RawUnit, fallbackId: string): Unit {
  const id = raw.id && raw.id.trim() ? raw.id.trim() : fallbackId
  const mint = new IdMinter()
  const book: Unit = {
    id,
    lang: langOf(raw, id),
    title: String(raw.title ?? ''),
    emoji: raw.emoji || '📕',
    track: oneOf(TRACKS, raw.track, 'media'),
    lessons: (raw.lessons ?? []).map((l, li) => normalizeLesson(l, mint, id, li)),
  }
  const sourceType = optional(SOURCE_TYPES, raw.sourceType)
  if (sourceType) book.sourceType = sourceType
  if (raw.sourceTitle) book.sourceTitle = raw.sourceTitle
  if (raw.createdAt) book.createdAt = raw.createdAt
  if (raw.updatedAt) book.updatedAt = raw.updatedAt
  return book
}

/** 이 책이 이미 정규화됐는지 (id가 전부 있는지). 마이그레이션 필요 여부 판단용 */
export function isNormalized(raw: RawUnit): boolean {
  if (!raw.id || !raw.lang) return false
  for (const l of raw.lessons ?? []) {
    if (!l.id || !Array.isArray(l.sections)) return false
    for (const s of l.sections) {
      if (!s.id) return false
      for (const w of s.words ?? []) if (!w.id) return false
      for (const p of s.passages ?? []) if (!p.id) return false
      for (const g of s.grammar ?? []) {
        if (!g.id) return false
        for (const e of g.examples ?? []) if (!e.id) return false
      }
    }
  }
  return true
}

/**
 * 붙여넣은 JSON에 기존 책의 id를 물려준다.
 *
 * README가 권하는 워크플로("AI에게 이 과를 다시 만들어 달라고 해서 붙여넣기")에서는
 * 같은 단어가 id 없이 다시 들어온다. 그대로 정규화하면 새 id가 발급되어 그동안 쌓인
 * 숙련도가 전부 리셋된다. 그래서 **텍스트가 같으면 원래 id를 그대로 쓴다.**
 * 한 텍스트당 한 번만 물려주므로 중복 단어가 서로의 이력을 훔치지 않는다.
 */
export function adoptIds(raw: RawUnit, existing: Unit): RawUnit {
  const words = new Map<string, string>()
  const sentences = new Map<string, string>()
  for (const lesson of existing.lessons) {
    for (const section of lesson.sections) {
      for (const w of section.words) if (w.text && !words.has(w.text)) words.set(w.text, w.id)
      const all = [...section.passages, ...section.grammar.flatMap((g) => g.examples)]
      for (const s of all) if (s.text && !sentences.has(s.text)) sentences.set(s.text, s.id)
    }
  }

  const claim = (map: Map<string, string>, text?: string): string | undefined => {
    if (!text) return undefined
    const id = map.get(text)
    if (id) map.delete(text) // 한 번 쓰면 회수 — 둘 이상이 같은 id를 갖지 않게
    return id
  }

  return {
    ...raw,
    id: raw.id ?? existing.id,
    lang: raw.lang ?? existing.lang,
    lessons: (raw.lessons ?? []).map((l) => ({
      ...l,
      sections: (l.sections ?? []).map((s) => ({
        ...s,
        words: (s.words ?? []).map((w) => ({ ...w, id: w.id ?? claim(words, w.text) })),
        passages: (s.passages ?? []).map((p) => ({ ...p, id: p.id ?? claim(sentences, p.text) })),
        grammar: (s.grammar ?? []).map((g) => ({
          ...g,
          examples: (g.examples ?? []).map((e) => ({ ...e, id: e.id ?? claim(sentences, e.text) })),
        })),
      })),
      // 평면 구조로 들어온 경우도 동일하게 물려준다
      words: l.sections ? l.words : (l.words ?? []).map((w) => ({ ...w, id: w.id ?? claim(words, w.text) })),
      sentences: l.sections
        ? l.sentences
        : (l.sentences ?? []).map((s) => ({ ...s, id: s.id ?? claim(sentences, s.text) })),
    })),
  }
}

/**
 * 책 id를 바꾸고, 그 id를 접두사로 쓰는 하위 id를 전부 따라 바꾼다.
 *
 * **아직 저장하지 않은 새 책에만 쓴다.** 이미 저장된 책의 id를 바꾸면 그 책에 쌓인
 * 숙련도·학습 기록이 전부 끊긴다. 편집기에서 새 책의 언어를 고를 때, 언어가 바뀌면
 * 책 id의 언어 접두사도 따라가야 해서 필요하다.
 */
export function rekeyBook(book: Unit, newId: string): Unit {
  if (book.id === newId) return book
  const swap = (id: string) => (id === book.id || id.startsWith(book.id + '/') ? newId + id.slice(book.id.length) : id)
  return {
    ...book,
    id: newId,
    lessons: book.lessons.map((l) => ({
      ...l,
      id: swap(l.id),
      sections: l.sections.map((s) => ({
        ...s,
        id: swap(s.id),
        words: s.words.map((w) => ({ ...w, id: swap(w.id) })),
        passages: s.passages.map((p) => ({ ...p, id: swap(p.id) })),
        grammar: s.grammar.map((g) => ({
          ...g,
          id: swap(g.id),
          examples: g.examples.map((e) => ({ ...e, id: swap(e.id) })),
        })),
      })),
    })),
  }
}

// ── 새 항목 만들기 (Editor용) ────────────────────────────
// 편집 중 추가되는 항목은 위치 기반 id를 쓸 수 없다 — 앞에 항목이 삽입되면 겹친다.
// 그래서 난수 접미사를 붙인다. 저장 후에는 normalizeBook이 그대로 통과시킨다.

function rand(): string {
  return Math.random().toString(36).slice(2, 8)
}

export function newSection(lessonId: string, title = '본문'): Section {
  return { id: `${lessonId}/s-${rand()}`, order: 0, title, passages: [], words: [], grammar: [] }
}

export function newLesson(bookId: string): Lesson {
  const id = `${bookId}/c-${rand()}`
  return { id, order: 0, title: '', context: '', sections: [newSection(id)] }
}

export function newWord(sectionId: string): Word {
  return { id: `${sectionId}/w-${rand()}`, text: '', meaning: '' }
}

export function newSentence(sectionId: string, text = '', meaning = ''): Sentence {
  return { id: `${sectionId}/p-${rand()}`, text, meaning }
}

export function newGrammar(sectionId: string): Grammar {
  return { id: `${sectionId}/g-${rand()}`, point: '', explanation: '', examples: [] }
}

export function newGrammarExample(grammarId: string): Sentence {
  return { id: `${grammarId}/e-${rand()}`, text: '', meaning: '' }
}
