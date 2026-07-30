// 내장 교재 JSON을 정규 스키마(schemaVersion 2)로 한 번 변환한다.
//
//   평면 구조                        정규 구조
//   lesson.words     ────────────▶   lesson.sections[0].words   (+ id)
//   lesson.sentences ────────────▶   lesson.sections[0].passages(+ id)
//
// id는 위치 기반이라 이 스크립트를 여러 번 돌려도 결과가 같다.
// 이미 변환된 파일은 건드리지 않는다.
//
// 실행: node scripts/migrate-data.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data')

function convertSentence(raw, parentId, prefix, i) {
  const out = { id: raw.id ?? `${parentId}/${prefix}${i + 1}`, text: raw.text ?? '' }
  if (raw.reading) out.reading = raw.reading
  out.meaning = raw.meaning ?? ''
  if (raw.audio) out.audio = raw.audio
  if (Array.isArray(raw.tokens) && raw.tokens.length) out.tokens = raw.tokens
  if (raw.tip) out.tip = raw.tip
  return out
}

function convertWord(raw, sectionId, i) {
  const out = { id: raw.id ?? `${sectionId}/w${i + 1}`, text: raw.text ?? '' }
  if (raw.reading) out.reading = raw.reading
  out.meaning = raw.meaning ?? ''
  if (raw.audio) out.audio = raw.audio
  if (raw.pos) out.pos = raw.pos
  if (raw.note) out.note = raw.note
  return out
}

function convertGrammar(raw, sectionId, i) {
  const id = raw.id ?? `${sectionId}/g${i + 1}`
  return {
    id,
    point: raw.point ?? '',
    explanation: raw.explanation ?? '',
    examples: (raw.examples ?? []).map((e, ei) => convertSentence(e, id, 'e', ei)),
  }
}

function convertSection(raw, lessonId, i) {
  const id = raw.id ?? `${lessonId}/s${i + 1}`
  const out = { id, order: i, title: raw.title ?? '본문' }
  if (raw.kind) out.kind = raw.kind
  if (raw.passageText) out.passageText = raw.passageText
  if (raw.passageTranslation) out.passageTranslation = raw.passageTranslation
  if (raw.passageAudio) out.passageAudio = raw.passageAudio
  out.passages = (raw.passages ?? []).map((p, pi) => convertSentence(p, id, 'p', pi))
  out.words = (raw.words ?? []).map((w, wi) => convertWord(w, id, wi))
  out.grammar = (raw.grammar ?? []).map((g, gi) => convertGrammar(g, id, gi))
  if (Array.isArray(raw.images) && raw.images.length) out.images = raw.images
  return out
}

function convertLesson(raw, bookId, i) {
  const id = raw.id ?? `${bookId}/c${i + 1}`
  // 평면 구조는 단일 섹션 '본문'으로 승격
  const rawSections =
    Array.isArray(raw.sections) && raw.sections.length > 0
      ? raw.sections
      : [{ title: '본문', words: raw.words ?? [], passages: raw.sentences ?? [], grammar: [] }]
  const out = { id, order: i, title: raw.title ?? '' }
  if (raw.context) out.context = raw.context
  out.sections = rawSections.map((s, si) => convertSection(s, id, si))
  return out
}

function convertBook(raw, lang) {
  const out = {
    id: raw.id,
    lang: raw.lang ?? lang, // 책이 자기 언어를 갖는다 (상위 Course 계층 폐기)
    title: raw.title,
    emoji: raw.emoji ?? '📕',
    track: raw.track ?? 'media',
  }
  if (raw.sourceType) out.sourceType = raw.sourceType
  if (raw.sourceTitle) out.sourceTitle = raw.sourceTitle
  out.lessons = (raw.lessons ?? []).map((l, li) => convertLesson(l, raw.id, li))
  return out
}

function isConverted(raw) {
  return !!raw.lang && (raw.lessons ?? []).every((l) => l.id && Array.isArray(l.sections))
}

let changed = 0
let skipped = 0
for (const lang of readdirSync(DATA_DIR, { withFileTypes: true })) {
  if (!lang.isDirectory()) continue
  const dir = join(DATA_DIR, lang.name)
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue
    const path = join(dir, file)
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    if (isConverted(raw)) {
      skipped++
      continue
    }
    writeFileSync(path, JSON.stringify(convertBook(raw, lang.name), null, 2) + '\n', 'utf8')
    console.log(`✓ ${lang.name}/${file}  lang=${raw.lang ?? lang.name} · 챕터 ${raw.lessons.length}`)
    changed++
  }
}
console.log(`\n변환 ${changed}권, 건너뜀 ${skipped}권`)
