import type { Course, Exercise, Lesson, Sentence, Unit, Word } from '../types'
import { bookWords, lessonSentences, lessonWords } from './lessonModel'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pickN<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n)
}

/** 문장 → 타일 배열 (tokens 필드 > 공백 분리 > 한자·가나는 글자 단위) */
export function sentenceTokens(s: Sentence): string[] {
  if (s.tokens && s.tokens.length > 0) return s.tokens
  if (s.text.includes(' ')) {
    return s.text
      .split(' ')
      .map((t) => t.replace(/[.,!?"”。！？、]/g, ''))
      .filter(Boolean)
  }
  // 띄어쓰기 없는 중국어/일본어 문장 → 글자 단위 분절
  return [...s.text.replace(/[。！？、．，.!?…\s"”]/g, '')]
}

function koTokens(meaning: string): string[] {
  return meaning
    .replace(/[.?!]/g, '')
    .split(' ')
    .filter(Boolean)
}

/** 타이핑 채점용 정규화 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s.,!?。！？、·'’"”-]/g, '')
    .trim()
}

interface Pools {
  words: Word[] // 보기(distractor)용 단어 풀
  tokens: string[] // 타일 distractor용
  koWords: string[]
}

function buildPools(unit: Unit, course: Course): Pools {
  const words: Word[] = []
  const tokens = new Set<string>()
  const koWords = new Set<string>()
  const collect = (u: Unit) => {
    for (const l of u.lessons) {
      for (const w of lessonWords(l)) if (!words.some((x) => x.text === w.text)) words.push(w)
      for (const s of lessonSentences(l)) {
        if (!s.text) continue
        sentenceTokens(s).forEach((t) => tokens.add(t))
        koTokens(s.meaning).forEach((t) => koWords.add(t))
      }
    }
  }
  collect(unit)
  // 풀이 작으면 코스 전체에서 보충
  if (words.length < 12) course.units.forEach(collect)
  return { words, tokens: [...tokens], koWords: [...koWords] }
}

function meaningOptions(word: Word, pool: Word[]): string[] {
  const others = pool.filter((w) => w.meaning !== word.meaning).map((w) => w.meaning)
  return shuffle([word.meaning, ...pickN([...new Set(others)], 3)])
}

function textOptions(word: Word, pool: Word[]): string[] {
  const others = pool.filter((w) => w.text !== word.text).map((w) => w.text)
  return shuffle([word.text, ...pickN([...new Set(others)], 3)])
}

function bankTiles(answer: string[], distractors: string[]): string[] {
  const extra = pickN(
    distractors.filter((d) => !answer.includes(d)),
    Math.min(3, Math.max(0, 8 - answer.length))
  )
  return shuffle([...answer, ...extra])
}

/**
 * 레슨 하나 → 문제 시퀀스 생성
 * 유닛 초반 레슨은 "고르기" 위주, 후반 레슨은 타이핑 포함 (난이도 점진 상승)
 */
export function buildLessonExercises(
  course: Course,
  unit: Unit,
  lesson: Lesson,
  audioOk: Set<string>
): Exercise[] {
  const lessonIdx = Math.max(0, unit.lessons.findIndex((l) => l.id === lesson.id))
  const pools = buildPools(unit, course)
  const ex: Exercise[] = []
  const lWords = lessonWords(lesson).filter((w) => w.text && w.meaning)
  const lSentences = lessonSentences(lesson).filter((s) => s.text)
  const words = shuffle(lWords)
  const later = lessonIdx >= Math.ceil(unit.lessons.length / 2) // 유닛 후반?

  // 1) 새 단어 소개 — 뜻 고르기
  for (const w of words.slice(0, 4)) {
    ex.push({
      kind: 'pick',
      question: '알맞은 뜻을 고르세요',
      prompt: w.text,
      promptReading: w.reading,
      promptAudio: w.audio && audioOk.has(w.audio) ? w.audio : undefined,
      options: meaningOptions(w, pools.words),
      answer: w.meaning,
      srsKeys: [w.id],
    })
  }

  // 2) 짝 맞추기
  const matchWords = pickN(lWords, Math.min(5, lWords.length))
  if (matchWords.length >= 3) {
    ex.push({
      kind: 'match',
      question: '짝을 맞춰 보세요',
      pairs: matchWords.map((w) => ({ a: w.text, b: w.meaning })),
      srsKeys: matchWords.map((w) => w.id),
    })
  }

  // 3) 반대 방향 — 단어 고르기 (뜻 → 단어)
  for (const w of words.slice(4, 6).length ? words.slice(4, 6) : words.slice(0, 2)) {
    ex.push({
      kind: 'pick',
      question: `"${w.meaning}" 은(는) 어떤 단어일까요?`,
      prompt: w.meaning,
      options: textOptions(w, pools.words),
      answer: w.text,
      srsKeys: [w.id],
    })
  }

  // 4) 문장 — 단어 뱅크 번역 + 빈칸 (뜻이 없는 문장은 퀴즈에서 제외)
  const sentences = shuffle(lSentences.filter((s) => s.meaning.trim()))
  sentences.forEach((s, i) => {
    const tokens = sentenceTokens(s)
    // 문장도 자기 id로 SRS 카드를 갖는다. v1에서는 포함된 단어의 카드를 빌려 썼는데,
    // 그러면 문장 자체의 숙련도는 어디에도 남지 않았다.
    const sKeys = [s.id]
    if (i % 2 === 0) {
      // 원문 → 타일로 조립
      ex.push({
        kind: 'bank',
        question: '단어를 조립해 문장을 완성하세요',
        prompt: s.meaning,
        tiles: bankTiles(tokens, pools.tokens),
        answer: tokens,
        srsKeys: sKeys,
      })
    } else {
      // 원문 보고 한국어 뜻 조립
      const ko = koTokens(s.meaning)
      ex.push({
        kind: 'bank',
        question: '우리말 뜻을 조립하세요',
        prompt: s.text,
        promptReading: s.reading,
        promptAudio: s.audio && audioOk.has(s.audio) ? s.audio : undefined,
        tiles: bankTiles(ko, pools.koWords),
        answer: ko,
        srsKeys: sKeys,
      })
    }
    // 빈칸 채우기 (토큰 3개 이상 문장, 한 문장만)
    if (i === 0 && tokens.length >= 3) {
      const target = tokens.find((t) => lWords.some((w) => w.text === t)) ?? tokens[0]
      const blanked = tokens.map((t) => (t === target ? '＿＿' : t)).join(' ')
      const distract = pickN(pools.tokens.filter((t) => t !== target && !tokens.includes(t)), 3)
      ex.push({
        kind: 'pick',
        question: '빈칸에 들어갈 말을 고르세요',
        prompt: `${blanked}\n(${s.meaning})`,
        options: shuffle([target, ...distract]),
        answer: target,
        srsKeys: sKeys,
      })
    }
  })

  // 5) 듣기 — mp3가 있는 단어만 (듣고 고르기)
  const audible = lWords.filter((w) => w.audio && audioOk.has(w.audio))
  for (const w of pickN(audible, 2)) {
    ex.push({
      kind: 'pick',
      question: '🔊 잘 듣고 알맞은 단어를 고르세요',
      prompt: w.text,
      promptAudio: w.audio,
      audioOnly: true,
      options: textOptions(w, pools.words),
      answer: w.text,
      srsKeys: [w.id],
    })
  }
  // 듣고 조립 (mp3 있는 문장)
  const audibleSent = lSentences.filter((s) => s.audio && audioOk.has(s.audio))
  for (const s of pickN(audibleSent, 1)) {
    const tokens = sentenceTokens(s)
    ex.push({
      kind: 'bank',
      question: '🔊 잘 듣고 문장을 조립하세요',
      prompt: s.text,
      promptAudio: s.audio,
      audioOnly: true,
      tiles: bankTiles(tokens, pools.tokens),
      answer: tokens,
      srsKeys: [s.id],
    })
  }

  // 6) 유닛 후반 레슨 — 직접 타이핑 (쓰기)
  if (later) {
    for (const w of pickN(lWords, 2)) {
      if (course.id === 'en') {
        ex.push({
          kind: 'type',
          question: `"${w.meaning}" 을(를) 영어로 써 보세요`,
          prompt: w.meaning,
          answer: w.text,
          srsKeys: [w.id],
        })
      } else {
        ex.push({
          kind: 'type',
          question: '이 단어의 뜻을 우리말로 써 보세요',
          prompt: w.text,
          promptReading: w.reading,
          answer: w.meaning,
          srsKeys: [w.id],
        })
      }
    }
  }

  return ex.slice(0, 14)
}

/** 복습 세션 — 잊기 직전 단어들 위주로 출제 */
export function buildReviewExercises(course: Course, due: Word[], allWords: Word[]): Exercise[] {
  const ex: Exercise[] = []
  const targets = due.slice(0, 10)
  targets.forEach((w, i) => {
    if (i % 3 === 2 && course.id === 'en') {
      ex.push({
        kind: 'type',
        question: `"${w.meaning}" 을(를) 영어로 써 보세요`,
        prompt: w.meaning,
        answer: w.text,
        srsKeys: [w.id],
      })
    } else if (i % 3 === 1) {
      ex.push({
        kind: 'pick',
        question: `"${w.meaning}" 은(는) 어떤 단어일까요?`,
        prompt: w.meaning,
        options: textOptions(w, allWords),
        answer: w.text,
        srsKeys: [w.id],
      })
    } else {
      ex.push({
        kind: 'pick',
        question: '알맞은 뜻을 고르세요',
        prompt: w.text,
        promptReading: w.reading,
        options: meaningOptions(w, allWords),
        answer: w.meaning,
        srsKeys: [w.id],
      })
    }
  })
  // 마지막에 짝 맞추기 하나
  if (targets.length >= 4) {
    const m = targets.slice(0, 5)
    ex.push({
      kind: 'match',
      question: '짝을 맞춰 보세요',
      pairs: m.map((w) => ({ a: w.text, b: w.meaning })),
      srsKeys: m.map((w) => w.id),
    })
  }
  return ex
}

export function courseAllWords(course: Course): Word[] {
  const all: Word[] = []
  for (const u of course.units)
    for (const w of bookWords(u)) if (w.text && !all.some((x) => x.text === w.text)) all.push(w)
  return all
}
