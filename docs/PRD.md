# My Study Duolingo — 설계서

> 대상 코드베이스: `/Users/kangyoungah/Desktop/language-study` (React 18 + TS + Vite 4, 완전 로컬)
> 작성일: 2026-07-30
> 짝 문서: [`RESTRUCTURE.md`](./RESTRUCTURE.md) — 현행 코드 실측 기준 갭 분석과 작업 순서.
> **§0 표의 현행 상태 판정 세 곳이 실측과 다르다** (Section 계층 데이터 0건, 간격 반복이 본 퀴즈 경로에 미적용, 문장 SRS 부재). 착수 전 그 문서를 먼저 볼 것.

---

## 0. 전제와 현행 대비 갭

요청서는 그린필드 기준으로 쓰였지만 이 레포에는 이미 같은 제품이 구현돼 있다. 그래서 이 문서는 **재설계서가 아니라 현행 스키마의 정식화 + 실제로 비어 있는 부분의 설계서**다.

| 요청 항목 | 현행 상태 | 이 문서에서 다루는 것 |
|---|---|---|
| Book > Chapter > SubChapter > Item 계층 | `Unit > Lesson > Section > {passages, words, grammar}` 로 이미 존재 | 이름 매핑 + id 부여(§1.1) |
| 매일 녹음/쓰기 기록 | `studyLog.ts` + `RecordButton.tsx`로 구현됨 | 스키마 정식화 |
| 4지선다 / 단어조립 / 빈칸 / 듣기 | `exercises.ts`에 4종 모두 구현됨 (`pick`/`match`/`bank`/`type`) | 함수 명세 재정리(§3) |
| **퀴즈 범위 선택 (챕터/대단원/교재 전체)** | **없음.** `buildLessonExercises(course, unit, lessonIdx)` — 레슨 1개 고정 | 신규 설계(§3.2) |
| **문장 단위 SRS** | **없음.** `srsKey = "courseId|단어텍스트"` — 문장은 포함된 단어 키를 빌려 쓰기만 함(`exercises.ts:146`), `dueWords()`는 단어만 스캔 | 신규 설계(§1.1, §3.5) |
| 진행률 | `completed: Record<unitId, 레슨수>` 만 | 섹션 단위 진행률(§1.1) |

### 짚고 갈 것 두 가지

**(1) 컨셉 문구가 2026-07-09 본인 결정과 어긋난다.** 요청서 §1은 "듀오링고 퀴즈 학습 UX가 기본, 교재 제작이 부가"로 읽힌다. 하지만 이 앱은 7/9에 "카톡 스터디(매일 본문·녹음·필기) 대체 = 본체, 퀴즈 = 보조"로 방향을 잡았고 `ChapterPage.tsx`가 그 결정의 결과물이다. 여기서 다시 퀴즈 중심으로 돌리면 3번째 방향 전환이고, `ChapterPage`/`studyLog` 계열이 사실상 폐기된다. **이 문서는 7/9 결정(학습 로그 본체)을 유지하고 퀴즈를 강화하는 쪽으로 작성했다.** 진짜로 뒤집을 생각이면 그건 별도 결정이다.

**(2) Prisma/User 테이블 = 서버 도입인데, 지금은 편익보다 비용이 크다.**
- (정정) 이 맥북은 이제 Node v22.22.3 — Next.js 실행은 가능하다. 아래 나머지 이유는 그대로 유효하다.
- 혼자 쓰는 앱에 `User` 테이블은 순수 오버헤드(인증·세션·비번 재설정).
- 매일 쌓이는 녹음 mp3/webm이 서버 스토리지 비용과 백업 책임을 만든다. 현재는 IndexedDB에 무료·무제한(디스크 한도)으로 들어간다.
- 오프라인 원칙이 깨진다.

서버가 실제로 필요해지는 조건은 **"폰에서도 보고 싶다 / 맥북이 죽어도 기록이 남아야 한다"** 하나뿐이다. 그건 §1.3의 export/import(JSON + 파일 zip)로 90% 해결된다. 그래서 **§1.1(로컬 스키마)이 지금 구현할 것, §1.2(Prisma)는 나중에 서버로 옮길 때의 목표 스키마**로 둘 다 적었다.

---

## 1. 데이터 모델

### 1.1 로컬 스키마 (지금 구현 — 현행 확장)

용어 매핑: **Book = `Unit`**, **Chapter = `Lesson`**, **Sub-Chapter = `Section`**, **Item = `Word` | `Sentence`**.

핵심 변경 3가지:
1. 모든 계층에 **안정적 `id`** 부여 (지금은 배열 인덱스로 참조 → 중간 삽입/삭제 시 SRS·로그가 어긋남)
2. **`Item`을 SRS의 1급 단위로 승격** (단어·문장 공통)
3. `Section.kind` 태그 추가 (작문/말하기/본문/어휘) — **선택 필드**. enum 강제는 안 한다. 摩登时代처럼 실제 교재의 소단원 이름은 제각각이라 고정 enum이 오히려 방해된다. 태그는 퀴즈 범위 필터용으로만 쓴다.

```ts
// src/types.ts (확장안)

export type Lang = 'zh' | 'en' | 'ja'
export type ItemType = 'word' | 'sentence'
export type SectionKind = 'passage' | 'vocab' | 'grammar' | 'writing' | 'speaking' | 'listening'

/** SRS·로그가 참조하는 전역 고유 키. 텍스트가 아니라 id 기반 */
export type ItemId = string   // `${unitId}:${lessonId}:${sectionId}:${localId}`

// ── Book ────────────────────────────────
export interface Unit {
  id: string
  title: string
  emoji: string
  lang: Lang                       // Course.id 에서 승격 (책이 언어를 갖는다)
  track: 'foundation' | 'media' | 'vocab'
  sourceType?: 'book' | 'drama' | 'movie' | 'anime' | 'textbook'
  sourceTitle?: string
  lessons: Lesson[]
  createdAt: string                // ISO
  updatedAt: string
}

// ── Chapter ─────────────────────────────
export interface Lesson {
  id: string
  order: number
  title: string
  context?: string
  sections: Section[]
  // 하위호환(읽기 전용): lessonModel.ts가 단일 섹션으로 흡수
  words?: Word[]
  sentences?: Sentence[]
}

// ── Sub-Chapter ─────────────────────────
export interface Section {
  id: string
  order: number
  title: string
  kind?: SectionKind               // 선택 태그. 퀴즈 범위 필터에만 사용
  passageText?: string             // 본문 통 붙여넣기 (기본 입력 방식)
  passageTranslation?: string
  passageAudio?: string
  passages: Sentence[]             // passageText에서 분리된 문장 (퀴즈용 보조)
  words: Word[]
  grammar: Grammar[]
  images?: string[]                // imageStore(IndexedDB) 파일명
}

// ── Study Item ──────────────────────────
export interface Word {
  id: string                       // section 내 로컬 id
  text: string
  reading?: string                 // 병음 / 후리가나
  meaning: string
  pos?: string                     // 품사
  example?: string                 // 예문
  note?: string                    // 나의 메모
  audio?: string
  quizEnabled?: boolean            // 기본 true. 고유명사 등 제외용
}

export interface Sentence {
  id: string
  text: string
  reading?: string
  meaning: string                  // 비어 있으면 퀴즈에서 자동 제외
  audio?: string                   // 선생님/교재 오디오
  tokens?: string[]                // 단어 뱅크 분절. 없으면 자동 분절
  tip?: string                     // 해석 팁
  quizEnabled?: boolean
}

export interface Grammar {
  id: string
  point: string
  explanation: string
  examples: Sentence[]
}
```

**SRS 카드 (`storage.ts` 확장)**

```ts
export interface SrsEntry {
  itemId: ItemId
  type: ItemType
  level: number        // 0~5
  next: string         // yyyy-mm-dd
  seen: number
  wrong: number
  lastSeen: string
  lastWrong?: string
}

export interface AppState {
  // ... 기존 xp / streak / hearts / dailyGoal 유지
  srs: Record<ItemId, SrsEntry>          // ← 키가 텍스트에서 ItemId로 변경
  progress: Record<string, SectionProgress>  // sectionId → 진행률
}

export interface SectionProgress {
  markedDone: boolean          // 수동 "📌 완료로 표시"
  quizRuns: number
  lastQuizAt?: string
  bestAccuracy?: number
}
```

**일일 학습 기록 (`studyLog.ts` 확장)**

```ts
export interface StudyLog {
  id: string
  date: string                 // yyyy-mm-dd
  unitId: string
  lessonId: string
  sectionId?: string
  writing?: string             // 쓰기 연습 텍스트
  memo?: string
  audioKeys: string[]          // audioStore(IndexedDB) 키, namespace `log-${unitId}`
  imageKeys: string[]          // imageStore(IndexedDB) 키
  durationSec?: number
  createdAt: string
}
```

**저장소 배치**

| 데이터 | 위치 | 키 |
|---|---|---|
| 내장 교재 | 번들 JSON | `src/data/index.ts` 등록부 |
| 사용자 교재 | localStorage | `language-study-books-v1` |
| 진행도·SRS·XP | localStorage | `language-study-v1` |
| 학습 로그 메타 | localStorage | `language-study-log-v1` |
| 오디오 바이너리 | IndexedDB | `language-study-audio` |
| 이미지 바이너리 | IndexedDB | `language-study-images` |

> localStorage는 5MB 한도. 교재 텍스트만 담으므로 여유롭지만, SRS 엔트리는 아이템 수에 비례해 늘어난다. 아이템 3,000개 기준 약 400KB — 문제없음. 1만 개를 넘기면 SRS도 IndexedDB로 옮긴다.

**id 부여 마이그레이션**: 기존 데이터는 `id`가 없다. 앱 부팅 시 1회 실행하는 `migrateV1toV2()`에서 인덱스 기반으로 id를 생성해 주입하고, 기존 SRS 키(`"zh|你好"`)는 텍스트 매칭으로 새 `ItemId`에 이어붙인다. 매칭 실패분은 버린다(레벨 0으로 재시작 — 손실 감수).

### 1.2 Prisma Schema (서버 이전 시 목표 스키마)

```prisma
// schema.prisma — PostgreSQL 기준
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

enum Lang        { zh en ja ko other }
enum ItemType    { word sentence }
enum SectionKind { passage vocab grammar writing speaking listening }
enum QuizScope   { section chapter book review }
enum QuizKind    { pick match bank type listen }

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())

  books      Book[]
  srsCards   SrsCard[]
  sessions   QuizSession[]
  studyLogs  StudyLog[]
  dailyStats DailyStat[]
}

model Book {
  id          String   @id @default(cuid())
  userId      String
  title       String
  lang        Lang
  emoji       String   @default("📕")
  sourceType  String?
  sourceTitle String?
  order       Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  chapters Chapter[]

  @@index([userId, order])
}

model Chapter {
  id     String @id @default(cuid())
  bookId String
  order  Int
  title  String
  context String?

  book        Book         @relation(fields: [bookId], references: [id], onDelete: Cascade)
  subChapters SubChapter[]

  @@unique([bookId, order])
}

model SubChapter {
  id        String       @id @default(cuid())
  chapterId String
  order     Int
  title     String
  kind      SectionKind?

  passageText        String?  @db.Text
  passageTranslation String?  @db.Text
  passageAudioId     String?

  chapter Chapter @relation(fields: [chapterId], references: [id], onDelete: Cascade)
  items   Item[]
  assets  Asset[]

  @@unique([chapterId, order])
}

/// 단어와 문장을 한 테이블로 합친다.
/// 이유: 퀴즈 생성이 "범위 내 전체 아이템 1회 조회 → 가중 샘플링"이라
/// 테이블이 갈리면 매 요청마다 UNION이 필요하고 SRS 조인도 두 벌이 된다.
model Item {
  id           String   @id @default(cuid())
  subChapterId String
  type         ItemType
  order        Int

  text     String  @db.Text   // 원문
  reading  String?            // 병음 / 후리가나 / 발음기호
  meaning  String? @db.Text   // 뜻·번역. null이면 퀴즈 제외
  pos      String?            // word 전용: 품사
  example  String? @db.Text   // word 전용: 예문
  tip      String? @db.Text   // sentence 전용: 해석 팁
  tokens   String[]           // sentence 전용: 단어 뱅크 분절 (빈 배열이면 자동 분절)
  note     String? @db.Text   // 나의 메모

  audioId     String?
  quizEnabled Boolean @default(true)

  subChapter SubChapter    @relation(fields: [subChapterId], references: [id], onDelete: Cascade)
  audio      Asset?        @relation("ItemAudio", fields: [audioId], references: [id])
  srsCards   SrsCard[]
  attempts   QuizAttempt[]

  @@index([subChapterId, order])
  @@index([type, quizEnabled])
}

model Asset {
  id           String  @id @default(cuid())
  userId       String
  kind         String  // "audio" | "image"
  url          String  // S3/R2 key 또는 로컬 IndexedDB 키
  mimeType     String
  bytes        Int
  durationSec  Float?
  subChapterId String?
  createdAt    DateTime @default(now())

  subChapter SubChapter? @relation(fields: [subChapterId], references: [id], onDelete: SetNull)
  items      Item[]      @relation("ItemAudio")
}

/// 간격 반복 카드. 사용자 × 아이템 = 1장.
model SrsCard {
  id       String @id @default(cuid())
  userId   String
  itemId   String

  level      Int      @default(0)   // 0~5
  dueAt      DateTime @default(now())
  seenCount  Int      @default(0)
  wrongCount Int      @default(0)
  streak     Int      @default(0)   // 연속 정답
  lastSeenAt DateTime?
  lastWrongAt DateTime?
  easeFactor Float    @default(2.5) // SM-2 확장 여지

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  item Item @relation(fields: [itemId], references: [id], onDelete: Cascade)

  @@unique([userId, itemId])
  @@index([userId, dueAt])          // 복습 대상 조회의 핵심 인덱스
}

model QuizSession {
  id        String    @id @default(cuid())
  userId    String
  scope     QuizScope
  scopeId   String?   // section/chapter/book 의 id
  startedAt DateTime  @default(now())
  endedAt   DateTime?
  total     Int       @default(0)
  correct   Int       @default(0)
  xpEarned  Int       @default(0)

  user     User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  attempts QuizAttempt[]

  @@index([userId, startedAt])
}

model QuizAttempt {
  id         String   @id @default(cuid())
  sessionId  String
  itemId     String
  kind       QuizKind
  correct    Boolean
  firstTry   Boolean  @default(true)
  answerText String?  @db.Text   // 오답 분석용 실제 입력값
  elapsedMs  Int?
  createdAt  DateTime @default(now())

  session QuizSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  item    Item        @relation(fields: [itemId], references: [id], onDelete: Cascade)

  @@index([itemId, createdAt])
}

/// 매일의 학습 기록 — 쓰기 연습 + 내 녹음 + 필기 사진
model StudyLog {
  id           String   @id @default(cuid())
  userId       String
  date         DateTime @db.Date
  bookId       String
  chapterId    String?
  subChapterId String?
  writing      String?  @db.Text
  memo         String?  @db.Text
  assetIds     String[]
  createdAt    DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, date])
}

model DailyStat {
  id        String   @id @default(cuid())
  userId    String
  date      DateTime @db.Date
  xp        Int      @default(0)
  quizCount Int      @default(0)
  newItems  Int      @default(0)
  studied   Boolean  @default(false)   // 스트릭 계산용

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, date])
}
```

**설계 판단 3가지**

- `Item` 단일 테이블: 위 주석대로 퀴즈 생성 쿼리가 단순해진다. 대가는 nullable 컬럼이 늘어나는 것 — 애플리케이션 레벨(zod)에서 type별 required를 검증한다.
- 진행률은 **컬럼으로 저장하지 않는다.** `Book.progress`를 컬럼으로 두면 아이템 추가·삭제·퀴즈마다 갱신해야 하고 반드시 어긋난다. 조회 시 `COUNT(SrsCard WHERE level>=3) / COUNT(Item)`로 계산하고, 느려지면 그때 머티리얼라이즈드 뷰.
- `QuizAttempt.answerText` 보관: "내가 자주 틀리는 오답 패턴"이 이 앱에서 제일 값어치 있는 데이터다. 지금 앱은 이걸 안 남긴다.

### 1.3 서버 없이 백업/이동 (권장 우선순위)

`Profile.tsx`에 버튼 2개로 끝난다.

- **내보내기**: `{ books, state, logs }` JSON + IndexedDB 바이너리 전부 → `JSZip` → `study-backup-2026-07-30.zip` 다운로드
- **가져오기**: zip 선택 → 병합(같은 id는 `updatedAt` 최신 우선) 또는 덮어쓰기

이게 서버 도입 대비 1/50 비용으로 데이터 손실 위험을 없앤다. 서버는 "폰에서 실시간으로" 요구가 실제로 생긴 뒤에.

---

## 2. UI/UX 컴포넌트 구조

### 2.1 화면 흐름

```
Shelf (책장, 홈)
 └ BookPage (교재 = Unit)
    ├ 목차 트리 + 챕터별 진도바
    ├ [🎯 이 교재 전체 퀴즈]      ← 신규
    └ ChapterPage (챕터 = Lesson)     ※ 퀴즈가 아니라 학습 화면이 먼저
       ├ SectionAccordion (소단원)
       │   ├ PassageBlock  (본문 + 통 오디오 + 번역 토글)
       │   ├ WordTable     (새단어 + 🔊 + 메모)
       │   ├ GrammarBlock
       │   └ ImageStrip    (교재 스캔)
       ├ StudyLogTimeline (날짜별 내 기록)
       │   └ StudyLogEntry (내 녹음 / 필기사진 / 쓰기 / 메모)
       ├ [🎯 이 챕터 퀴즈] [🎯 소단원만]  ← 범위 선택 신규
       └ [📌 완료로 표시]
LessonScreen (퀴즈 실행)  →  Complete (결과)
Editor (교재 입력/편집)
Profile (통계 / 백업)
```

### 2.2 컴포넌트 트리 (현행 → 목표)

```
App.tsx                        상태 소유 + 라우팅 (현행 유지)
├─ Taskbar / Marquee           Y2K 크롬 (현행)
├─ Shelf.tsx                   책장 그리드 (현행)
├─ BookPage.tsx                교재 상세 (현행)
│  ├─ ⊕ TocTree.tsx            ★신규 — 챕터>소단원 트리 + 진도율
│  └─ ⊕ QuizScopePicker.tsx    ★신규 — 범위/문항수/유형 선택 모달
├─ ChapterPage.tsx             학습 화면 (현행, 252줄 — 아래로 분해 권장)
│  ├─ ⊕ SectionAccordion.tsx   ★신규 (ChapterPage에서 추출)
│  ├─ ⊕ PassageBlock.tsx       ★신규 (본문 + 번역 토글 + 문장 단위 재생)
│  ├─ ⊕ WordTable.tsx          ★신규
│  ├─ ⊕ StudyLogTimeline.tsx   ★신규 (ChapterPage에서 추출)
│  ├─ RecordButton.tsx         MediaRecorder 녹음 (현행)
│  ├─ AudioField.tsx           오디오 지정/업로드 (현행)
│  └─ ImageThumb.tsx           (현행)
├─ LessonScreen.tsx            퀴즈 러너 (현행, 462줄 — 아래로 분해 권장)
│  ├─ ⊕ QuizHeader.tsx         ★신규 (진행바 + 하트 + 나가기)
│  ├─ ⊕ ExercisePick.tsx       ★신규 (4지선다 / 듣기 4지선다)
│  ├─ ⊕ ExerciseBank.tsx       ★신규 (단어 조립)
│  ├─ ⊕ ExerciseType.tsx       ★신규 (타이핑 빈칸)
│  ├─ ⊕ ExerciseMatch.tsx      ★신규 (짝맞추기)
│  └─ ⊕ FeedbackBar.tsx        ★신규 (정/오답 하단바 + "계속")
├─ Complete.tsx                결과 (현행)
├─ Editor.tsx                  교재 편집 (현행, 392줄)
│  └─ ⊕ SectionEditor.tsx      ★신규 (소단원 단위로 분해)
└─ Profile.tsx                 통계 (현행)
   └─ ⊕ BackupPanel.tsx        ★신규 (zip export/import)
```

> `LessonScreen.tsx` 462줄 / `Editor.tsx` 392줄은 이미 한 파일이 감당할 한계를 넘었다. 퀴즈 유형이 5종(듣기 추가)으로 늘면 `LessonScreen`은 600줄을 넘긴다. 위 분해는 기능 추가 전에 먼저 하는 편이 싸다.

### 2.3 신규 화면: QuizScopePicker

```
┌─ 🎯 퀴즈 시작 ────────────────┐
│ 범위                          │
│  ○ 이 소단원  (12문항 가능)    │
│  ● 이 챕터    (48문항 가능)    │
│  ○ 교재 전체  (312문항 가능)   │
│  ○ 오늘 복습할 것 (23개 밀림)  │
│                               │
│ 문항 수   [10] [20] [30] [∞]  │
│                               │
│ 유형  ☑뜻고르기 ☑문장조립      │
│       ☑빈칸   ☑타이핑 ☑듣기   │
│       (듣기: 오디오 있는 8개)  │
│                               │
│ ☑ 틀렸던 것 먼저 (SRS 가중치)  │
│         [ 시작하기 ]           │
└───────────────────────────────┘
```

"문항 수 가능" 숫자는 `countAvailable(scope, kinds)`가 미리 계산해 보여준다 — 듣기를 켰는데 오디오가 3개뿐이면 사용자가 바로 안다. 현행 앱이 "오디오 실제 존재 항목만 출제"(`checkAudioFiles`)하는 원칙의 UI 확장이다.

### 2.4 진행률 표시 규칙

- **소단원**: `아이템 중 SRS level≥3 비율`. 수동 "완료로 표시"는 별도 📌 배지로 병기 — 둘을 하나로 합치지 않는다(퀴즈 안 풀고 완료 표시한 것과 실제 숙달을 구분해야 한다).
- **챕터**: 소속 소단원 진행률의 아이템 수 가중 평균
- **교재**: 챕터 평균 + "채워진 정도"(입력 완성도) 별도 표시
- **교재 완성도(입력)**: `내용이 있는 소단원 / 전체 소단원`. 빈 소단원은 점선 테두리 회색 카드로 보여 "여기 아직 안 채웠다"가 보이게 한다 — 요청서의 "나만의 교재가 완성돼 가는 시각적 피드백"은 이 대비로 만든다.

---

## 3. 퀴즈 엔진 로직

파일: `src/lib/exercises.ts` (현행 301줄) → `src/lib/quiz/` 로 분리

```
src/lib/quiz/
├─ scope.ts        범위 → 아이템 수집
├─ weight.ts       SRS 가중 샘플링
├─ tokenize.ts     문장 분절 (언어별)
├─ distractor.ts   오답 보기 생성
├─ builders.ts     유형별 문제 빌더
├─ grade.ts        채점
└─ index.ts        buildQuiz() 진입점
```

### 3.1 파이프라인

```
scope 선택
  → collectItems()        범위 내 출제 가능 아이템 수집·필터
  → weightedSample()      SRS 가중치로 N개 뽑기
  → assignKinds()         아이템별 출제 유형 결정
  → build*()              유형별 문제 생성 (오답·타일 포함)
  → interleave()          같은 아이템·같은 유형 연속 방지
  → Exercise[]
```

### 3.2 `collectItems` — 범위 수집

```ts
export type QuizScope =
  | { type: 'section'; unitId: string; lessonId: string; sectionId: string }
  | { type: 'chapter'; unitId: string; lessonId: string }
  | { type: 'book';    unitId: string }
  | { type: 'review';  unitId?: string }        // 오늘 복습 대상만
  | { type: 'wrong';   unitId?: string; days: number }  // 최근 N일 틀린 것

export interface QuizItem {
  id: ItemId
  type: ItemType
  text: string
  reading?: string
  meaning: string
  audio?: string
  tokens?: string[]
  sectionId: string
  sectionKind?: SectionKind
}

/**
 * 범위 내 출제 가능 아이템을 모은다.
 * 제외 규칙:
 *  - quizEnabled === false
 *  - meaning 이 빈 문자열 (현행 exercises.ts:144 규칙 유지)
 *  - type='sentence' 이고 분절 토큰이 2개 미만
 *  - 중복 text (앞선 것 우선)
 */
export function collectItems(course: Course, scope: QuizScope, state: AppState): QuizItem[]

/** 각 유형별로 실제 몇 문항 낼 수 있는지 — QuizScopePicker가 미리 표시 */
export function countAvailable(
  items: QuizItem[],
  audioOk: Set<string>
): Record<QuizKind, number>
```

**책 전체 퀴즈의 함정**: 아이템 300개에서 20문항을 뽑으면 사용자 체감은 "매번 다른 것만 나오고 아무것도 안 외워진다"가 된다. 그래서 book 스코프는 **가중 샘플링을 반드시 켜고**(약한 아이템 집중), 문항 수 기본값을 20으로 둔다. 무작위 균등 샘플링은 book 스코프에서 금지.

### 3.3 `tokenize` — 문장 분절

현행 `sentenceTokens()`의 문제: 중국어/일본어를 **글자 단위**로 쪼갠다(`exercises.ts:28`). "我是韩国人" → `[我,是,韩,国,人]` 7타일이 되어 문제가 아니라 노가다가 된다. 정답은 `[我, 是, 韩国人]`.

```ts
/**
 * 우선순위:
 *  1. item.tokens (사용자 지정)              — 가장 정확
 *  2. 소속 소단원+상위 챕터의 단어 목록으로 최장일치(greedy longest-match) 분절
 *     → 교재에 등록된 새단어가 자동으로 타일 경계가 된다. 이게 핵심.
 *  3. 공백 분리 (영어)
 *  4. 글자 단위 (최후 수단)
 * 구두점은 제거하되 원문 복원용으로 punctuation map을 함께 반환.
 */
export function tokenize(
  item: QuizItem,
  vocab: string[],        // 범위 내 단어 text 목록, 길이 내림차순 정렬해 전달
  lang: Lang
): { tiles: string[]; joiner: string }   // joiner: 'zh'|'ja'는 '', 'en'은 ' '
```

최장일치 구현:
```
i = 0
while i < text.length:
  match = vocab 중 text.startsWith(v, i) 인 것 중 가장 긴 것
  if match: tiles.push(match); i += match.length
  else:     tiles.push(text[i]); i += 1
```
단어 목록에 없는 나머지는 글자 단위로 남지만, 교재를 채울수록 분절이 자동으로 좋아진다 — "교재를 완성할수록 퀴즈가 좋아진다"는 제품 컨셉과 맞물린다.

### 3.4 `distractor` — 오답 보기 생성

```ts
/**
 * 좋은 오답의 조건: 그럴듯하되 확실히 틀릴 것.
 * 점수 = 유사도, 상위 3개 선택. 정답과 완전 일치하는 뜻은 배제.
 *   +3  같은 소단원 출신
 *   +2  같은 챕터 출신
 *   +2  글자 수 차이 ≤ 1
 *   +2  같은 품사(pos)
 *   +1  reading 첫 음절 동일 (병음 성모/가나 첫 글자)
 *   -5  정답과 뜻이 겹침 (부분 문자열 포함 관계)
 * 후보가 3개 미만이면 교재 전체 → 같은 언어의 다른 교재 순으로 확장.
 */
export function buildDistractors(
  answer: QuizItem,
  pool: QuizItem[],
  field: 'meaning' | 'text',
  n = 3
): string[]
```

현행 `meaningOptions()`는 무작위 3개다(`exercises.ts:71`). "안녕하세요 / 컴퓨터 / 3월 / 달리다"처럼 뻔한 보기가 나와 정답률만 뻥튀기된다. 위 점수식이 실제 난이도를 만든다.

### 3.5 `weight` — SRS 가중 샘플링

```ts
/**
 * 가중치 = 기본 1 + 미숙련 + 오답률 + 연체 + 신규
 *   w  = 1
 *      + 2.0 * (1 - level / 5)                    // 레벨 낮을수록
 *      + 3.0 * (wrong / (seen + 1))               // 자주 틀릴수록
 *      + min(overdueDays / 7, 2.0)                // 복습일 지날수록
 *      + (seen === 0 ? 1.5 : 0)                   // 새 아이템 우대
 *      * (lastWrong === today ? 0.3 : 1)          // 오늘 이미 틀린 건 감쇠(연타 방지)
 * 누적합 + 이진탐색으로 비복원 추출.
 */
export function weightedSample(items: QuizItem[], srs: Record<ItemId, SrsEntry>, n: number): QuizItem[]

/** 정답/오답 반영. 간격: [0,1,3,7,14,30]일 (현행 srs.ts 유지) */
export function updateSrs(srs, itemId, correct: boolean, firstTry: boolean): Record<ItemId, SrsEntry>
```

**현행 대비 변경**: `srs.ts`의 `updateSrs`는 오답 시 `level - 1`인데, 이건 레벨 5짜리를 한 번 틀렸다고 4로만 내린다. 문장까지 SRS에 들어오면 **오답 시 `level = max(0, floor(level/2))`** 로 더 세게 떨어뜨리는 편이 실제 망각과 맞다. `firstTry === false`(재시도로 맞춤)는 정답이되 레벨 상승은 없음으로 처리한다.

### 3.6 `assignKinds` — 유형 배분

```ts
/**
 * 아이템 type + 오디오 유무 + SRS 레벨로 출제 유형을 정한다.
 * 레벨이 오를수록 어려운 유형으로 (인식 → 재생).
 */
```

| 아이템 | level 0–1 | level 2–3 | level 4–5 |
|---|---|---|---|
| word | `pick`(뜻 고르기), `match` | `pick`(원문 고르기) | `type`(타이핑) |
| word + audio | `listen-pick` | `listen-pick` | `listen-type` |
| sentence | `bank`(뜻→원문 조립) | `bank`(원문→뜻 조립), `fill` | `type` |
| sentence + audio | — | `listen-bank` | `listen-type` |

- 한 세션에서 같은 아이템은 최대 2회, 같은 유형 3연속 금지 → `interleave()`
- `match`(짝맞추기)는 단어 5개를 한 번에 소비하므로 세션당 최대 2회
- 오디오가 없는 아이템에는 듣기 유형을 절대 배정하지 않는다 (현행 `audioOk: Set<string>` 규칙 유지)

### 3.7 `fill` — 빈칸 생성

```ts
/**
 * 빈칸 대상 토큰 선택 우선순위:
 *  1. 해당 소단원 '새단어'에 등록된 토큰       ← 교재가 지정한 핵심 어휘
 *  2. SRS 레벨이 가장 낮은 토큰
 *  3. 문장 내 최장 토큰
 * 첫 토큰·마지막 토큰은 피한다(문맥 단서가 한쪽뿐이라 난이도가 튄다).
 * 토큰 3개 미만 문장은 빈칸 문제를 만들지 않는다.
 */
export function buildFill(
  item: QuizItem, tiles: string[], vocab: QuizItem[], srs
): Exercise | null
```

### 3.8 `grade` — 채점

```ts
/** 타이핑 채점: 대소문자·공백·구두점 무시 (현행 normalize 유지) + 아래 추가 */
export function grade(ex: Exercise, input: string | string[]): {
  correct: boolean
  nearMiss: boolean      // 편집거리 1 → "거의 맞았어요! 오타 확인" 피드백
  diff?: [number, number][]  // 틀린 문자 위치 하이라이트용
}
```
- `bank`는 배열 순서 완전 일치. 단, 중국어 문장에서 어순이 여러 개 가능한 경우가 있어 `item.altAnswers?: string[][]`를 선택 필드로 둔다.
- `nearMiss`(편집거리 1)는 정답 처리하되 SRS 레벨은 올리지 않는다.

### 3.9 진입점

```ts
export interface QuizOptions {
  count: number | 'all'
  kinds: QuizKind[]
  useSrsWeight: boolean
  audioOk: Set<string>
  seed?: number          // 재현 가능한 세션 (디버깅·"같은 퀴즈 다시")
}

export function buildQuiz(course: Course, scope: QuizScope, state: AppState, opts: QuizOptions): Exercise[]
```

---

## 4. 구현 순서 (권장)

| 단계 | 내용 | 근거 |
|---|---|---|
| 1 | ~~`BackupPanel` (zip export/import)~~ **완료 (2026-07-30)** | 지금 맥북이 죽으면 전부 날아간다. 다른 무엇보다 먼저. |
| 2 | id 부여 + `migrateV1toV2()` | 이후 모든 작업의 전제. 데이터가 쌓일수록 마이그레이션 비용이 커진다. |
| 3 | `QuizScopePicker` + `collectItems` | 요청 기능 중 실제로 없는 것. 체감 효과 최대. |
| 4 | `tokenize` 최장일치 분절 | 중국어 문장 조립 문제가 지금 사실상 못 쓸 수준. |
| 5 | `buildDistractors` 점수식 | 퀴즈 난이도의 질을 결정. |
| 6 | 문장 SRS + 가중 샘플링 | 요청서의 "간격 반복" 요구를 문장까지 확장. |
| 7 | 컴포넌트 분해 (`LessonScreen`, `Editor`) | 3~6 하면서 같이. |
| 8 | Prisma 서버 이전 | **폰 접근이 실제로 필요해진 뒤에.** |
