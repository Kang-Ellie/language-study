// ─────────────────────────────────────────────────────────
// 정규 스키마 (schemaVersion 2)
//
// 모든 계층이 **안정적인 id**를 갖는다. SRS·학습기록·진도는 배열 인덱스가 아니라
// 이 id를 참조하므로, 챕터를 중간에 끼워 넣거나 순서를 바꿔도 기록이 어긋나지 않는다.
//
// id 형식은 계층 경로다 — 사람이 읽을 수 있고, 부모를 문자열로 유추할 수 있다.
//   책        zh-mccs-l1-conv
//   챕터      zh-mccs-l1-conv/c1
//   소단원    zh-mccs-l1-conv/c1/s1
//   단어      zh-mccs-l1-conv/c1/s1/w3
//   문장      zh-mccs-l1-conv/c1/s1/p2
//
// 외부에서 들어오는 데이터(내장 JSON·붙여넣은 JSON·구버전 localStorage)는 전부
// `lib/normalize.ts`의 normalizeBook()을 거쳐 이 모양이 된 뒤에야 앱 안으로 들어온다.
// 그래서 이 파일의 타입에는 옵셔널 하위호환 필드가 없다. 느슨한 입력 타입은 normalize.ts에 있다.
// ─────────────────────────────────────────────────────────

/** 소단원 성격 태그. 퀴즈 범위 필터용 — 화면 표시는 자유 제목(title)을 쓴다. */
export type SectionKind = 'passage' | 'vocab' | 'grammar' | 'writing' | 'speaking' | 'listening'

/** SRS·통계가 참조하는 전역 고유 키 */
export type ItemId = string

export interface Word {
  id: ItemId
  text: string
  reading?: string // 병음(중국어) / 후리가나(일본어)
  meaning: string
  audio?: string // 파일명 (IndexedDB 또는 public/audio/<courseId>/)
  pos?: string // 품사 — 오답 보기 생성에 사용 (선택)
  note?: string // 나의 메모
  quizEnabled?: boolean // 기본 true. 고유명사 등 출제 제외용
}

export interface Sentence {
  id: ItemId
  text: string
  reading?: string
  meaning: string
  audio?: string
  tokens?: string[] // 단어 뱅크용 분절. 없으면 공백/글자 단위로 분리
  tip?: string // 해석 팁
  quizEnabled?: boolean
}

export interface Grammar {
  id: string
  point: string // 문법 제목 (예: "동사 + 吗 의문문")
  explanation: string // 설명
  examples: Sentence[] // 예문 (문제로도 출제됨)
}

// 소단원 — 챕터 안의 한 묶음 (예: 회화1, 본문, 독해)
export interface Section {
  id: string
  order: number
  title: string
  kind?: SectionKind
  // 본문 전체 — 긴 지문을 한 덩어리로 붙여넣는 방식 (기본)
  passageText?: string
  passageTranslation?: string
  passageAudio?: string // 선생님이 본문 전체를 낭독한 통 녹음
  passages: Sentence[] // 문장별 세부 (퀴즈·문장 단위 듣기용)
  words: Word[] // 새단어
  grammar: Grammar[] // 문법
  images?: string[] // 첨부 이미지 (교재 페이지 스캔 등) — imageStore 파일명
}

// 챕터 (교재의 '과')
export interface Lesson {
  id: string
  order: number
  title: string
  context?: string
  sections: Section[]
}

// 책
export interface Unit {
  id: string
  title: string
  emoji: string
  track: 'foundation' | 'media' | 'vocab'
  sourceType?: 'book' | 'drama' | 'movie' | 'anime' | 'textbook'
  sourceTitle?: string
  lessons: Lesson[]
  createdAt?: string
  updatedAt?: string
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
      srsKeys: ItemId[]
    }
  | {
      kind: 'match'
      question: string
      pairs: { a: string; b: string }[]
      srsKeys: ItemId[]
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
      srsKeys: ItemId[]
    }
  | {
      kind: 'type'
      question: string
      prompt: string
      promptReading?: string
      answer: string
      srsKeys: ItemId[]
    }

export interface LessonResult {
  xp: number
  total: number
  correctFirstTry: number
  isReview: boolean
}
