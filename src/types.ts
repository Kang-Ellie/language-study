export interface Word {
  text: string
  reading?: string // 병음(중국어) / 후리가나(일본어)
  meaning: string
  audio?: string // 파일명 (IndexedDB 또는 public/audio/<courseId>/)
}

export interface Sentence {
  text: string
  reading?: string
  meaning: string
  audio?: string
  tokens?: string[] // 단어 뱅크용 분절. 없으면 공백/글자 단위로 분리
}

export interface Grammar {
  point: string // 문법 제목 (예: "동사 + 吗 의문문")
  explanation: string // 설명
  examples: Sentence[] // 예문 (문제로도 출제됨)
}

// 소카테고리 — 챕터 안의 한 묶음 (예: 회화1, 본문, 독해)
export interface Section {
  title: string
  // 본문 전체 — 긴 지문을 한 덩어리로 붙여넣는 방식 (기본)
  passageText?: string
  passageTranslation?: string
  passageAudio?: string // 선생님이 본문 전체를 낭독한 통 녹음
  passages: Sentence[] // 문장별 세부 (퀴즈·문장 단위 듣기용, 선택 — passageText에서 자동 분리하거나 직접 추가)
  words: Word[] // 새단어
  grammar: Grammar[] // 문법
  images?: string[] // 첨부 이미지 (교재 페이지 스캔 등) — 파일명, imageStore에 저장됨
}

// 챕터 (교재의 '과')
export interface Lesson {
  title: string
  context?: string
  sections?: Section[] // 신규 구조
  // ── 하위호환: 기존 평면 필드 (섹션 없으면 이걸 단일 섹션으로 취급) ──
  words?: Word[]
  sentences?: Sentence[]
}

export interface Unit {
  id: string
  title: string
  emoji: string
  track: 'foundation' | 'media' | 'vocab'
  sourceType?: 'book' | 'drama' | 'movie' | 'anime' | 'textbook'
  sourceTitle?: string
  lessons: Lesson[]
}

export interface Course {
  id: 'zh' | 'en' | 'ja'
  name: string
  flag: string
  units: Unit[]
}

// ── 문제 유형 ──────────────────────────────
export type Exercise =
  | {
      kind: 'pick'
      question: string
      prompt: string
      promptReading?: string
      promptAudio?: string
      audioOnly?: boolean
      options: string[]
      answer: string
      srsKeys: string[]
    }
  | {
      kind: 'match'
      question: string
      pairs: { a: string; b: string }[]
      srsKeys: string[]
    }
  | {
      kind: 'bank'
      question: string
      prompt: string
      promptReading?: string
      promptAudio?: string
      audioOnly?: boolean
      tiles: string[]
      answer: string[]
      srsKeys: string[]
    }
  | {
      kind: 'type'
      question: string
      prompt: string
      promptReading?: string
      answer: string
      srsKeys: string[]
    }

export interface LessonResult {
  xp: number
  total: number
  correctFirstTry: number
  isReview: boolean
}
