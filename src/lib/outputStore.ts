/**
 * ไฟล์ที่แปลแล้ว (Blob) — เก็บใน IndexedDB ของเบราว์เซอร์นี้ เพื่อดาวน์โหลดซ้ำจากประวัติได้หลังรีเฟรช
 * เก็บล่าสุด KEEP ไฟล์ (ไฟล์เอกสารอาจใหญ่หลาย MB) · ถ้า IndexedDB ใช้ไม่ได้ (โหมดส่วนตัว) เก็บในหน่วยความจำแทน
 */

const DB_NAME = 'lingo'
const STORE = 'outputs'
const KEEP = 30

interface Stored {
  jobId: string
  blob: Blob
  createdAt: number
}

const memory = new Map<string, Blob>()
let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'jobId' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  dbPromise.catch(() => (dbPromise = null))
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = fn(tx.objectStore(STORE))
        tx.oncomplete = () => resolve(req ? req.result : undefined)
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      }),
  )
}

export async function saveOutput(jobId: string, blob: Blob): Promise<void> {
  memory.set(jobId, blob)
  for (const id of [...memory.keys()].slice(0, Math.max(0, memory.size - KEEP))) memory.delete(id)
  try {
    await run('readwrite', (s) => s.put({ jobId, blob, createdAt: Date.now() } satisfies Stored))
    const all = (await run('readonly', (s) => s.getAll() as IDBRequest<Stored[]>)) ?? []
    const old = all.sort((a, b) => b.createdAt - a.createdAt).slice(KEEP)
    if (old.length) await run('readwrite', (s) => old.forEach((o) => s.delete(o.jobId)))
  } catch {
    // ใช้ได้เฉพาะรอบนี้ (memory)
  }
}

export async function loadOutput(jobId: string): Promise<Blob | null> {
  const cached = memory.get(jobId)
  if (cached) return cached
  try {
    const stored = (await run('readonly', (s) => s.get(jobId) as IDBRequest<Stored | undefined>)) as Stored | undefined
    return stored?.blob ?? null
  } catch {
    return null
  }
}

export async function deleteOutputs(jobIds: string[]): Promise<void> {
  jobIds.forEach((id) => memory.delete(id))
  try {
    await run('readwrite', (s) => jobIds.forEach((id) => s.delete(id)))
  } catch {
    // ไม่มีอะไรให้ลบ
  }
}

export async function clearOutputs(): Promise<void> {
  memory.clear()
  try {
    await run('readwrite', (s) => s.clear())
  } catch {
    // ไม่มีอะไรให้ลบ
  }
}
