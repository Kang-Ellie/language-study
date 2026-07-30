// 시드를 줄 수 있는 난수. 테스트가 흔들리지 않게 하고, "같은 퀴즈 다시"를 가능하게 한다.
// 시드를 안 주면 Math.random()을 쓴다.

export type Rng = () => number

/** mulberry32 — 짧고 분포가 충분히 고르다 */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makeRng(seed?: number): Rng {
  return seed === undefined ? Math.random : seededRng(seed)
}

export function shuffle<T>(arr: readonly T[], rng: Rng = Math.random): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function pickN<T>(arr: readonly T[], n: number, rng: Rng = Math.random): T[] {
  return shuffle(arr, rng).slice(0, Math.max(0, n))
}

/**
 * 가중치 비복원 추출. weights[i] > 0 인 것만 뽑힌다.
 * 누적합 + 선형 탐색 — 항목 수가 수천 단위라 이 정도면 충분하다.
 */
export function weightedPick<T>(items: readonly T[], weights: number[], n: number, rng: Rng): T[] {
  const pool = items.map((item, i) => ({ item, w: Math.max(0, weights[i]) }))
  const out: T[] = []
  let total = pool.reduce((s, p) => s + p.w, 0)

  while (out.length < n && pool.length > 0 && total > 0) {
    let r = rng() * total
    let idx = pool.length - 1
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].w
      if (r <= 0) {
        idx = i
        break
      }
    }
    out.push(pool[idx].item)
    total -= pool[idx].w
    pool.splice(idx, 1)
  }
  return out
}
