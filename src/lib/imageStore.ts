// 이미지(교재 스캔·내 필기 사진 등)를 브라우저 안에 저장 (IndexedDB). audioStore.ts와 동일한 패턴.
const DB_NAME = 'language-study-images'
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

function key(ns: string, file: string): string {
  return `${ns}/${file}`
}

export async function putImage(ns: string, file: string, blob: Blob): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, key(ns, file))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getImageBlob(ns: string, file: string): Promise<Blob | null> {
  try {
    const db = await openDb()
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(key(ns, file))
      req.onsuccess = () => resolve((req.result as Blob) ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function hasImageStored(ns: string, file: string): Promise<boolean> {
  try {
    const db = await openDb()
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).getKey(key(ns, file))
      req.onsuccess = () => resolve(req.result != null)
      req.onerror = () => resolve(false)
    })
  } catch {
    return false
  }
}

export async function deleteImage(ns: string, file: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key(ns, file))
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

export interface StoredFile {
  key: string // `${ns}/${file}`
  blob: Blob
}

/** 저장된 이미지 전체 (백업 내보내기용) */
export async function allImageFiles(): Promise<StoredFile[]> {
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
export async function putImageRaw(key: string, blob: Blob): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function imageKeys(): Promise<Set<string>> {
  const files = await allImageFiles()
  return new Set(files.map((f) => f.key))
}

export async function imageUsageMb(): Promise<number> {
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
