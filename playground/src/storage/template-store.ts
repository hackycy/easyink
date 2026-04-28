import type { DocumentSchema } from '@easyink/designer'

export interface StoredTemplate {
  id: string
  name: string
  category: string
  schema: DocumentSchema
  /** Per-template preview data; persisted alongside schema. */
  data?: Record<string, unknown>
  createdAt: number
  updatedAt: number
  fromSample?: string
}

const DB_NAME = 'easyink-playground'
const DB_VERSION = 1
const STORE_NAME = 'templates'
const LAST_TEMPLATE_KEY = 'easyink:lastTemplateId'

let dbInstance: IDBDatabase | undefined

function openDB(): Promise<IDBDatabase> {
  if (dbInstance)
    return Promise.resolve(dbInstance)

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt', { unique: false })
      }
    }
    request.onsuccess = () => {
      dbInstance = request.result
      resolve(dbInstance)
    }
    request.onerror = () => reject(request.error)
  })
}

function tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return openDB().then(db => db.transaction(STORE_NAME, mode).objectStore(STORE_NAME))
}

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function listTemplates(): Promise<StoredTemplate[]> {
  const store = await tx('readonly')
  const all = await wrap<StoredTemplate[]>(store.index('updatedAt').getAll())
  return all.reverse()
}

export async function getTemplate(id: string): Promise<StoredTemplate | undefined> {
  const store = await tx('readonly')
  return wrap<StoredTemplate | undefined>(store.get(id))
}

export async function saveTemplate(template: StoredTemplate): Promise<void> {
  const store = await tx('readwrite')
  // JSON round-trip strips Vue reactive proxies and other non-cloneable references
  const plain = JSON.parse(JSON.stringify(template))
  await wrap(store.put(plain))
}

export async function deleteTemplate(id: string): Promise<void> {
  const store = await tx('readwrite')
  await wrap(store.delete(id))
}

export function getLastTemplateId(): string | null {
  try {
    return localStorage.getItem(LAST_TEMPLATE_KEY)
  }
  catch {
    return null
  }
}

export function setLastTemplateId(id: string): void {
  try {
    localStorage.setItem(LAST_TEMPLATE_KEY, id)
  }
  catch { /* quota exceeded */ }
}
