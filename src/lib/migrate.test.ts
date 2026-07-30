import { describe, expect, it } from 'vitest'
import type { Unit } from '../types'
import { normalizeBook } from './normalize'
import { BACKUP_SUFFIX, migrate, rollbackMigration } from './migrate'
import { BOOKS_KEY } from './books'
import { LOG_KEY } from './studyLog'
import { SCHEMA_VERSION, STATE_KEY } from './storage'

/** 내장 책 흉내 — 이미 정규화된 상태로 전달된다 */
const zhBook: Unit = normalizeBook(
  {
    id: 'zh-demo',
    lang: 'zh',
    title: '데모',
    lessons: [
      { title: '1과', words: [{ text: '去', meaning: '가다' }], sentences: [{ text: '我去。', meaning: '나는 가요' }] },
      { title: '2과', words: [{ text: '吃', meaning: '먹다' }] },
      { title: '3과', words: [{ text: '喝', meaning: '마시다' }] },
    ],
  },
  'zh-demo'
)
const builtin: Unit[] = [zhBook]

const C1 = 'zh-demo/c1'
const C2 = 'zh-demo/c2'
const C3 = 'zh-demo/c3'

function seedV1(state: Record<string, unknown>, logs: Record<string, unknown[]> = {}) {
  localStorage.setItem(STATE_KEY, JSON.stringify(state))
  localStorage.setItem(LOG_KEY, JSON.stringify(logs))
}

describe('migrateV1toV2', () => {
  it('저장된 게 없으면 아무 일도 하지 않는다', () => {
    const report = migrate(builtin)
    expect(report.ran).toBe(false)
  })

  it('이미 v2면 다시 돌지 않는다 (멱등)', () => {
    seedV1({ schemaVersion: SCHEMA_VERSION, srs: {}, progress: {} })
    expect(migrate(builtin).ran).toBe(false)
  })

  it('SRS 키를 단어 텍스트에서 항목 id로 옮긴다', () => {
    seedV1({
      srs: {
        'zh|去': { level: 3, next: '2026-08-01', seen: 5, wrong: 1 },
        'zh|吃': { level: 1, next: '2026-07-30', seen: 2, wrong: 2 },
      },
    })
    const report = migrate(builtin)

    const state = JSON.parse(localStorage.getItem(STATE_KEY)!)
    expect(report.srsMatched).toBe(2)
    expect(report.srsDropped).toBe(0)
    expect(state.srs['zh-demo/c1/s1/w1']).toEqual({ level: 3, next: '2026-08-01', seen: 5, wrong: 1 })
    expect(state.srs['zh-demo/c2/s1/w1']).toEqual({ level: 1, next: '2026-07-30', seen: 2, wrong: 2 })
    expect(state.srs['zh|去']).toBeUndefined()
    expect(state.schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('지금 책에 없는 단어의 숙련도는 버리고 보고한다', () => {
    seedV1({ srs: { 'zh|없는단어': { level: 4, next: '2026-08-01', seen: 9, wrong: 0 } } })
    const report = migrate(builtin)
    expect(report.srsMatched).toBe(0)
    expect(report.srsDropped).toBe(1)
    expect(report.notes.join()).toContain('1개')
  })

  it('"완료한 개수"를 챕터별 플래그로 전개한다', () => {
    seedV1({ completed: { 'zh-demo': 2 } })
    migrate(builtin)

    const state = JSON.parse(localStorage.getItem(STATE_KEY)!)
    expect(state.progress[C1].markedDone).toBe(true)
    expect(state.progress[C2].markedDone).toBe(true)
    expect(state.progress[C3]).toBeUndefined()
    expect(state.completed).toBeUndefined()
  })

  it('완료 개수가 챕터 수보다 많아도 넘치지 않는다', () => {
    seedV1({ completed: { 'zh-demo': 99 } })
    migrate(builtin)
    const state = JSON.parse(localStorage.getItem(STATE_KEY)!)
    expect(Object.keys(state.progress)).toHaveLength(3)
  })

  it('학습 기록 키를 챕터 id로 바꾼다', () => {
    seedV1({}, {
      'zh|zh-demo|0': [{ id: '1', date: '2026-07-01', note: '1과 녹음' }],
      'zh|zh-demo|2': [{ id: '2', date: '2026-07-03', audioFile: '2.webm' }],
    })
    const report = migrate(builtin)

    const logs = JSON.parse(localStorage.getItem(LOG_KEY)!)
    expect(report.logsRekeyed).toBe(2)
    expect(logs[C1][0].note).toBe('1과 녹음')
    expect(logs[C3][0].audioFiles).toEqual(['2.webm']) // v4에서 배열이 된다
    expect(logs['zh|zh-demo|0']).toBeUndefined()
  })

  it('챕터를 못 찾은 기록은 지우지 않고 원래 키로 남긴다', () => {
    // 녹음·필기 사진은 되살릴 수 없으므로 삭제보다 고아 상태가 낫다
    seedV1({}, { 'zh|사라진책|0': [{ id: '9', date: '2026-07-01', audioFile: '9.webm' }] })
    const report = migrate(builtin)

    const logs = JSON.parse(localStorage.getItem(LOG_KEY)!)
    expect(report.logsDropped).toBe(1)
    expect(logs['zh|사라진책|0']).toHaveLength(1)
  })

  it('사용자 책을 정규화하고 평평한 배열로 되저장한다', () => {
    localStorage.setItem(
      BOOKS_KEY,
      JSON.stringify({
        zh: [{ id: 'zh-mine', title: '내 책', lessons: [{ title: '1과', words: [{ text: '看', meaning: '보다' }] }] }],
      })
    )
    seedV1({ srs: { 'zh|看': { level: 2, next: '2026-08-01', seen: 3, wrong: 0 } } })
    const report = migrate(builtin)

    const books = JSON.parse(localStorage.getItem(BOOKS_KEY)!)
    expect(report.booksNormalized).toBe(1)
    expect(Array.isArray(books)).toBe(true) // v3: Record<언어, 책[]> → 책[]
    expect(books[0].lang).toBe('zh')
    expect(books[0].lessons[0].id).toBe('zh-mine/c1')
    expect(books[0].lessons[0].sections[0].words[0].id).toBe('zh-mine/c1/s1/w1')
    // 내 책의 단어도 숙련도가 이어진다
    const state = JSON.parse(localStorage.getItem(STATE_KEY)!)
    expect(state.srs['zh-mine/c1/s1/w1'].level).toBe(2)
  })

  it('XP·스트릭 등 나머지 상태는 건드리지 않는다', () => {
    seedV1({ xp: 420, streak: 7, bestStreak: 9, studyDays: ['2026-07-01'], dailyGoal: 20, srs: {}, courseId: 'zh' })
    migrate(builtin)
    const state = JSON.parse(localStorage.getItem(STATE_KEY)!)
    expect(state.xp).toBe(420)
    expect(state.streak).toBe(7)
    expect(state.bestStreak).toBe(9)
    expect(state.studyDays).toEqual(['2026-07-01'])
    expect(state.dailyGoal).toBe(20)
  })

  it('변환 전 원본을 스냅샷하고, 되돌릴 수 있다', () => {
    const before = { srs: { 'zh|去': { level: 3, next: '2026-08-01', seen: 5, wrong: 1 } }, completed: { 'zh-demo': 1 } }
    seedV1(before)
    migrate(builtin)

    expect(JSON.parse(localStorage.getItem(STATE_KEY + BACKUP_SUFFIX)!)).toEqual(before)
    expect(rollbackMigration()).toBe(true)
    expect(JSON.parse(localStorage.getItem(STATE_KEY)!)).toEqual(before)
    expect(localStorage.getItem(STATE_KEY + BACKUP_SUFFIX)).toBeNull()
  })

  it('한 번 변환한 뒤 다시 실행해도 결과가 바뀌지 않는다', () => {
    seedV1({ srs: { 'zh|去': { level: 3, next: '2026-08-01', seen: 5, wrong: 1 } }, completed: { 'zh-demo': 1 } }, {
      'zh|zh-demo|0': [{ id: '1', date: '2026-07-01' }],
    })
    migrate(builtin)
    const afterFirst = {
      state: localStorage.getItem(STATE_KEY),
      logs: localStorage.getItem(LOG_KEY),
    }
    expect(migrate(builtin).ran).toBe(false)
    expect(localStorage.getItem(STATE_KEY)).toBe(afterFirst.state)
    expect(localStorage.getItem(LOG_KEY)).toBe(afterFirst.logs)
  })

  it('손상된 JSON이 들어 있어도 죽지 않는다', () => {
    localStorage.setItem(STATE_KEY, '{망가진')
    localStorage.setItem(LOG_KEY, 'nope')
    expect(() => migrate(builtin)).not.toThrow()
  })
})


describe('v2 → v3 (언어 계층 폐기)', () => {
  it('내 책 저장을 Record<언어, 책[]> 에서 평평한 배열로 옮긴다', () => {
    localStorage.setItem(STATE_KEY, JSON.stringify({ schemaVersion: 2, courseId: 'ja', srs: {}, progress: {} }))
    localStorage.setItem(
      BOOKS_KEY,
      JSON.stringify({
        zh: [normalizeBook({ id: 'zh-a', lang: 'zh', title: '중국어책', lessons: [{ title: '1과' }] }, 'zh-a')],
        ja: [normalizeBook({ id: 'ja-b', lang: 'ja', title: '일본어책', lessons: [{ title: '1과' }] }, 'ja-b')],
      })
    )
    const report = migrate(builtin)

    expect(report.ran).toBe(true)
    expect(report.from).toBe(2)
    const books = JSON.parse(localStorage.getItem(BOOKS_KEY)!)
    expect(Array.isArray(books)).toBe(true)
    expect(books).toHaveLength(2)
    expect(books.map((b: Unit) => b.lang).sort()).toEqual(['ja', 'zh'])
  })

  it('lang 필드가 없는 예전 책은 담겨 있던 언어 키를 물려받는다', () => {
    localStorage.setItem(STATE_KEY, JSON.stringify({ schemaVersion: 2, srs: {}, progress: {} }))
    localStorage.setItem(
      BOOKS_KEY,
      JSON.stringify({ ja: [{ id: 'mybook', title: '언어 없는 책', lessons: [{ title: '1과' }] }] })
    )
    migrate(builtin)
    const books = JSON.parse(localStorage.getItem(BOOKS_KEY)!)
    expect(books[0].lang).toBe('ja')
  })

  it('courseId를 lang으로 옮긴다', () => {
    localStorage.setItem(STATE_KEY, JSON.stringify({ schemaVersion: 2, courseId: 'en', srs: {}, progress: {} }))
    migrate(builtin)
    const state = JSON.parse(localStorage.getItem(STATE_KEY)!)
    expect(state.lang).toBe('en')
    expect(state.courseId).toBeUndefined()
    expect(state.schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('v1 데이터는 v3까지 한 번에 올라온다', () => {
    seedV1(
      {
        courseId: 'zh',
        completed: { 'zh-demo': 1 },
        srs: { 'zh|去': { level: 3, next: '2026-08-01', seen: 5, wrong: 1 } },
      },
      { 'zh|zh-demo|0': [{ id: '1', date: '2026-07-01' }] }
    )
    localStorage.setItem(
      BOOKS_KEY,
      JSON.stringify({ zh: [{ id: 'zh-mine', title: '내 책', lessons: [{ title: '1과' }] }] })
    )
    const report = migrate(builtin)

    expect(report.from).toBe(1)
    expect(report.to).toBe(SCHEMA_VERSION)
    const state = JSON.parse(localStorage.getItem(STATE_KEY)!)
    expect(state.schemaVersion).toBe(SCHEMA_VERSION)
    expect(state.lang).toBe('zh')
    expect(state.courseId).toBeUndefined()
    expect(state.completed).toBeUndefined()
    expect(state.srs['zh-demo/c1/s1/w1'].level).toBe(3) // v1 SRS 이관
    expect(state.progress['zh-demo/c1'].markedDone).toBe(true) // v1 진도 전개
    expect(JSON.parse(localStorage.getItem(LOG_KEY)!)['zh-demo/c1']).toHaveLength(1) // v1 로그 이관
    expect(Array.isArray(JSON.parse(localStorage.getItem(BOOKS_KEY)!))).toBe(true) // v3 평평한 배열
  })
})


describe('v3 → v4 (학습 기록 확장)', () => {
  it('오디오·이미지 한 개짜리 필드를 배열로 옮긴다', () => {
    localStorage.setItem(STATE_KEY, JSON.stringify({ schemaVersion: 3, lang: 'zh', srs: {}, progress: {} }))
    localStorage.setItem(
      LOG_KEY,
      JSON.stringify({
        'zh-demo/c1': [
          { id: '1', date: '2026-07-01', note: '메모', audioFile: 'a.webm', imageFile: 'b.jpg' },
          { id: '2', date: '2026-07-02' },
        ],
      })
    )
    const report = migrate(builtin)

    expect(report.from).toBe(3)
    const logs = JSON.parse(localStorage.getItem(LOG_KEY)!)
    expect(logs['zh-demo/c1'][0].audioFiles).toEqual(['a.webm'])
    expect(logs['zh-demo/c1'][0].imageFiles).toEqual(['b.jpg'])
    expect(logs['zh-demo/c1'][0].audioFile).toBeUndefined()
    // 첨부가 없던 기록은 빈 배열
    expect(logs['zh-demo/c1'][1].audioFiles).toEqual([])
    expect(logs['zh-demo/c1'][1].imageFiles).toEqual([])
  })

  it('메모는 그대로 두고 쓰기 연습으로 옮기지 않는다', () => {
    // v3의 note가 한 줄 메모였는지 쓰기 연습이었는지 알 수 없다 — 있던 자리에 둔다
    localStorage.setItem(STATE_KEY, JSON.stringify({ schemaVersion: 3, lang: 'zh', srs: {}, progress: {} }))
    localStorage.setItem(LOG_KEY, JSON.stringify({ 'zh-demo/c1': [{ id: '1', date: '2026-07-01', note: '어제 쓴 것' }] }))
    migrate(builtin)

    const entry = JSON.parse(localStorage.getItem(LOG_KEY)!)['zh-demo/c1'][0]
    expect(entry.note).toBe('어제 쓴 것')
    expect(entry.writing).toBeUndefined()
  })

  it('v1 데이터가 v4까지 한 번에 올라온다', () => {
    seedV1({ courseId: 'zh', srs: { 'zh|去': { level: 3, next: '2026-08-01', seen: 5, wrong: 1 } } }, {
      'zh|zh-demo|0': [{ id: '1', date: '2026-07-01', audioFile: 'old.webm' }],
    })
    const report = migrate(builtin)

    expect(report.from).toBe(1)
    expect(report.to).toBe(SCHEMA_VERSION)
    const state = JSON.parse(localStorage.getItem(STATE_KEY)!)
    expect(state.schemaVersion).toBe(4)
    expect(state.lang).toBe('zh')
    expect(state.srs['zh-demo/c1/s1/w1'].level).toBe(3)
    // 키는 챕터 id로, 첨부는 배열로
    const entry = JSON.parse(localStorage.getItem(LOG_KEY)!)['zh-demo/c1'][0]
    expect(entry.audioFiles).toEqual(['old.webm'])
  })
})
