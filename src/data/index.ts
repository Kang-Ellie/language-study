// ─────────────────────────────────────────────────────────
// 내장 교재 등록부 — 책을 바꾸고 싶으면 이 파일만 수정하면 됩니다.
//
// 새 책 추가:
//   1. src/data/<언어>/ 에 JSON 파일을 만든다 (기존 파일 형식 복사)
//   2. 아래에 import 한 줄 추가
//   3. builtinBooks 배열에 넣는다 (배열 순서 = 책장 표시 순서)
// 빼고 싶으면 배열에서 지우면 됩니다.
//
// 새 언어 추가:
//   LANGUAGES 에 { id, name, flag } 한 줄만 추가하면 됩니다.
//   책은 각자 "lang" 필드로 자기 언어를 갖고 있어서 타입을 고칠 필요가 없습니다.
// ─────────────────────────────────────────────────────────
import type { Language, Unit } from '../types'

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

export const LANGUAGES: Language[] = [
  { id: 'zh', name: '중국어', flag: '🇨🇳' },
  { id: 'en', name: '영어', flag: '🇬🇧' },
  { id: 'ja', name: '일본어', flag: '🇯🇵' },
]

export const builtinBooks: Unit[] = [
  u(zhF1),
  u(zhF2),
  u(zhMccsPron),
  u(zhMccsConv),
  u(enF1),
  u(enF2),
  u(enHarryPotter),
  u(enFriends),
  u(jaF1),
  u(jaF2),
  u(jaKimiNoNaWa),
  u(jaSpyFamily),
]

/** 등록되지 않은 언어 코드도 화면에 뜰 수 있게 — 이름은 코드 그대로 */
export function languageOf(id: string): Language {
  return LANGUAGES.find((l) => l.id === id) ?? { id, name: id, flag: '📗' }
}
