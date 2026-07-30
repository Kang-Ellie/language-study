// ─────────────────────────────────────────────────────────
// 코스 등록부 — 작품(유닛)을 바꾸고 싶으면 이 파일만 수정하면 됩니다.
//
// 새 작품 추가 방법:
//   1. src/data/<언어>/ 에 JSON 파일을 만든다 (기존 파일 형식 복사)
//   2. 아래에 import 한 줄 추가
//   3. 해당 언어 units 배열에 넣는다 (배열 순서 = 홈 화면 경로 순서)
// 빼고 싶은 작품은 units 배열에서 지우면 홈에서 사라집니다.
// ─────────────────────────────────────────────────────────
import type { Course, Unit } from '../types'

import zhF1 from './zh/foundation-1.json'
import zhF2 from './zh/foundation-2.json'
import zhMccsPron from './zh/mccs-l1-pron.json'
import zhMccsConv from './zh/mccs-l1-conv.json'

import enF1 from './en/foundation-1.json'
import enF2 from './en/foundation-2.json'
import enHarryPotter from './en/harry-potter-1.json'
import enFriends from './en/friends-s1.json'

import jaF1 from './ja/foundation-1.json'
import jaF2 from './ja/foundation-2.json'
import jaKimiNoNaWa from './ja/kimi-no-na-wa.json'
import jaSpyFamily from './ja/spy-family.json'

const u = (json: unknown) => json as Unit

export const courses: Course[] = [
  {
    id: 'zh',
    name: '중국어',
    flag: '🇨🇳',
    units: [u(zhF1), u(zhF2), u(zhMccsPron), u(zhMccsConv)],
  },
  {
    id: 'en',
    name: '영어',
    flag: '🇬🇧',
    units: [u(enF1), u(enF2), u(enHarryPotter), u(enFriends)],
  },
  {
    id: 'ja',
    name: '일본어',
    flag: '🇯🇵',
    units: [u(jaF1), u(jaF2), u(jaKimiNoNaWa), u(jaSpyFamily)],
  },
]

export function getCourse(id: string): Course {
  return courses.find((c) => c.id === id) ?? courses[0]
}
