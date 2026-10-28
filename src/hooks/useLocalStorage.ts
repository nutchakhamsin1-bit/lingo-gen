import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { readStorage, writeStorage } from '../lib/storage'

/** useState ที่ sync กับ localStorage (อ่านครั้งแรกแบบ lazy, เขียนทุกครั้งที่เปลี่ยน) */
export function useLocalStorage<T>(key: string, fallback: T): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [value, setValue] = useState<T>(() => readStorage(key, fallback))
  const [persisted, setPersisted] = useState(true)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setPersisted(writeStorage(key, value))
  }, [key, value])

  const set = useCallback<Dispatch<SetStateAction<T>>>((next) => setValue(next), [])
  return [value, set, persisted]
}
