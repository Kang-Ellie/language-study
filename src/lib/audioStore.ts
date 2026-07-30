// mp3를 브라우저 안에 저장 (IndexedDB) — 폴더를 안 건드려도 앱에서 업로드/재생 가능.
// localStorage는 텍스트 5MB 한계라 오디오 바이너리는 여기 저장한다.
const DB_NAME = 'language-study-audio'
const STORE = 'files'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function key(courseId: string, file: string): string {
  return `${courseId}/${file}`
}

export async function putAudio(courseId: string, file: string, blob: Blob): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, key(courseId, file))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getAudioBlob(courseId: string, file: string): Promise<Blob | null> {
  try {
    const db = await openDb()
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(key(courseId, file))
      req.onsuccess = () => resolve((req.result as Blob) ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function hasAudioStored(courseId: string, file: string): Promise<boolean> {
  try {
    const db = await openDb()
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).getKey(key(courseId, file))
      req.onsuccess = () => resolve(req.result != null)
      req.onerror = () => resolve(false)
    })
  } catch {
    return false
  }
}

export async function deleteAudio(courseId: string, file: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key(courseId, file))
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

export interface StoredFile {
  key: string // `${courseId}/${file}`
  blob: Blob
}

/** 저장된 오디오 전체 (백업 내보내기용) */
export async function allAudioFiles(): Promise<StoredFile[]> {
  try {
    const db = await openDb()
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly')
      const os = tx.objectStore(STORE)
      const kReq = os.getAllKeys()
      const vReq = os.getAll()
      tx.oncomplete = () => {
        const keys = kReq.result as IDBValidKey[]
        const vals = vReq.result as Blob[]
        resolve(keys.map((k, i) => ({ key: String(k), blob: vals[i] })).filter((f) => f.blob))
      }
      tx.onerror = () => resolve([])
    })
  } catch {
    return []
  }
}

/** 키를 그대로 써서 저장 (백업 복원용) */
export async function putAudioRaw(key: string, blob: Blob): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** 이미 저장된 키 목록 (복원 시 '합치기' 판단용) */
export async function audioKeys(): Promise<Set<string>> {
  const files = await allAudioFiles()
  return new Set(files.map((f) => f.key))
}

/** 업로드된 파일 크기 합계(MB) — 설정 화면 표시용 */
export async function audioUsageMb(): Promise<number> {
  try {
    const db = await openDb()
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).getAll()
      req.onsuccess = () => {
        const total = (req.result as Blob[]).reduce((sum, b) => sum + (b?.size ?? 0), 0)
        resolve(Math.round((total / 1024 / 1024) * 10) / 10)
      }
      req.onerror = () => resolve(0)
    })
  } catch {
    return 0
  }
}
