// 퀴즈 엔진은 다음 단계에서 통째로 갈아엎을 예정이라, 그 전에 "지금 동작"을 못박아 둔다.
// 여기서 검사하는 건 문제의 예쁨이 아니라 **불변식**이다 — 정답이 보기 안에 있는가,
// SRS 키가 실재하는 항목 id인가, 없는 오디오로 듣기 문제를 내지 않는가.
import { describe, expect, it } from 'vitest'
import type { Course, Unit } from '../types'
import { normalizeBook } from './normalize'
import { bookSentences, bookWords } from './lessonModel'
import { buildLessonExercises, buildReviewExercises, courseAllWords, normalize, sentenceTokens } from './exercises'

const book: Unit = normalizeBook(
  {
    id: 'zh-t',
    title: '테스트',
    lessons: [
      {
        title: '1과',
        sections: [
          {
            title: '회화',
            words: [
              { text: '去', reading: 'qù', meaning: '가다' },
              { text: '学校', reading: 'xuéxiào', meaning: '학교' },
              { text: '商店', reading: 'shāngdiàn', meaning: '가게' },
              { text: '现在', reading: 'xiànzài', meaning: '지금' },
              { text: '哪儿', reading: 'nǎr', meaning: '어디' },
            ],
            passages: [
              { text: '我去学校。', meaning: '나는 학교에 가요', tokens: ['我', '去', '学校'] },
              { text: '你去哪儿？', meaning: '어디 가요?', tokens: ['你', '去', '哪儿'] },
            ],
            grammar: [
              { point: '吗 의문문', explanation: '문장 끝 吗', examples: [{ text: '你忙吗？', meaning: '바빠요?' }] },
            ],
          },
        ],
      },
      {
        title: '2과',
        words: [{ text: '吃', meaning: '먹다' }],
        sentences: [{ text: '我吃饭。', meaning: '나는 밥을 먹어요' }],
      },
    ],
  },
  'zh-t'
)

const course: Course = { id: 'zh', name: '중국어', flag: '🇨🇳', units: [book] }

/** 이 책에 실재하는 모든 항목 id */
const validIds = new Set([...bookWords(book), ...bookSentences(book)].map((x) => x.id))

describe('buildLessonExercises', () => {
  const chapter = book.lessons[0]

  it('문제를 만든다', () => {
    expect(buildLessonExercises(course, book, chapter, new Set()).length).toBeGreaterThan(0)
  })

  it('모든 srsKey가 실재하는 항목 id다', () => {
    // v1에서는 문장 문제가 포함된 단어의 키를 빌려 썼고, 듣기 조립은 키가 아예 비어 있었다.
    for (let run = 0; run < 20; run++) {
      for (const ex of buildLessonExercises(course, book, chapter, new Set())) {
        expect(ex.srsKeys.length).toBeGreaterThan(0)
        for (const key of ex.srsKeys) expect(validIds).toContain(key)
      }
    }
  })

  it('4지선다는 정답이 보기 안에 있고 보기가 중복되지 않는다', () => {
    for (let run = 0; run < 20; run++) {
      for (const ex of buildLessonExercises(course, book, chapter, new Set())) {
        if (ex.kind !== 'pick') continue
        expect(ex.options).toContain(ex.answer)
        expect(new Set(ex.options).size).toBe(ex.options.length)
      }
    }
  })

  it('조립 문제의 정답 타일이 전부 제공된 타일 안에 있다', () => {
    for (let run = 0; run < 20; run++) {
      for (const ex of buildLessonExercises(course, book, chapter, new Set())) {
        if (ex.kind !== 'bank') continue
        const pool = [...ex.tiles]
        for (const t of ex.answer) {
          const i = pool.indexOf(t)
          expect(i, `타일 "${t}" 없음`).toBeGreaterThanOrEqual(0)
          pool.splice(i, 1)
        }
      }
    }
  })

  it('오디오가 없으면 듣기 문제를 내지 않는다', () => {
    for (let run = 0; run < 20; run++) {
      for (const ex of buildLessonExercises(course, book, chapter, new Set())) {
        if (ex.kind === 'pick' || ex.kind === 'bank') expect(ex.audioOnly).toBeFalsy()
      }
    }
  })

  it('오디오가 실제로 있는 항목에만 듣기 문제를 낸다', () => {
    const withAudio = normalizeBook(
      {
        id: 'zh-a',
        title: 'a',
        lessons: [
          {
            title: '1과',
            sections: [
              {
                title: 's',
                words: [
                  { text: '去', meaning: '가다', audio: 'yes.mp3' },
                  { text: '吃', meaning: '먹다', audio: 'missing.mp3' },
                ],
              },
            ],
          },
        ],
      },
      'zh-a'
    )
    const c: Course = { ...course, units: [withAudio] }
    for (let run = 0; run < 20; run++) {
      for (const ex of buildLessonExercises(c, withAudio, withAudio.lessons[0], new Set(['yes.mp3']))) {
        if ('promptAudio' in ex && ex.promptAudio) expect(ex.promptAudio).toBe('yes.mp3')
      }
    }
  })

  it('빈 챕터에서도 죽지 않는다', () => {
    const empty = normalizeBook({ id: 'e', title: 'e', lessons: [{ title: '빈 과' }] }, 'e')
    expect(() => buildLessonExercises({ ...course, units: [empty] }, empty, empty.lessons[0], new Set())).not.toThrow()
  })
})

describe('buildReviewExercises', () => {
  it('복습 문제의 srsKey도 실재하는 id다', () => {
    const due = bookWords(book).slice(0, 4)
    for (const ex of buildReviewExercises(course, due, courseAllWords(course))) {
      for (const key of ex.srsKeys) expect(validIds).toContain(key)
    }
  })
})

describe('sentenceTokens', () => {
  it('tokens 필드를 최우선으로 쓴다', () => {
    expect(sentenceTokens({ id: 'x', text: '我去学校。', meaning: '', tokens: ['我', '去', '学校'] })).toEqual([
      '我',
      '去',
      '学校',
    ])
  })

  it('영어는 공백으로 나눈다', () => {
    expect(sentenceTokens({ id: 'x', text: 'I go to school.', meaning: '' })).toEqual(['I', 'go', 'to', 'school'])
  })

  it('[알려진 한계] tokens가 없는 중국어는 글자 단위로 쪼갠다', () => {
    // 다음 단계(quiz 엔진 분리)에서 새단어 기반 최장일치 분절로 교체할 지점이다.
    expect(sentenceTokens({ id: 'x', text: '我是韩国人', meaning: '' })).toEqual(['我', '是', '韩', '国', '人'])
  })
})

describe('normalize (타이핑 채점)', () => {
  it('대소문자·공백·구두점을 무시한다', () => {
    expect(normalize('I Go, To School!')).toBe(normalize('igotoschool'))
    expect(normalize('你好。')).toBe(normalize('你好'))
  })
})
