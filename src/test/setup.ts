// 노드 환경에는 localStorage가 없다. 테스트마다 초기화되는 최소 구현으로 대체한다.
import { beforeEach } from 'vitest'

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  clear() {
    this.map.clear()
  }
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null
  }
  removeItem(key: string) {
    this.map.delete(key)
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value))
  }
}

const storage = new MemoryStorage()
Object.defineProperty(globalThis, 'localStorage', { value: storage, writable: true })

beforeEach(() => {
  storage.clear()
})
