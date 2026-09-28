export type CacheEntry<T> = {
  value: T
  expiresAt: number
}

export const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000
export const LONG_CACHE_TTL_MS = 15 * 60 * 1000
export const SHORT_CACHE_TTL_MS = 60 * 1000

export const CACHE_TTL_BY_PREFIX: Record<string, number> = {
  "issue:": SHORT_CACHE_TTL_MS,
  "issueIdentifier:": SHORT_CACHE_TTL_MS,
  assignedIssues: SHORT_CACHE_TTL_MS,
  "cycleIssues:": SHORT_CACHE_TTL_MS,
  "navigationIssues:": SHORT_CACHE_TTL_MS,
  "teamMetadata:": DEFAULT_CACHE_TTL_MS,
  "projectLabels:": DEFAULT_CACHE_TTL_MS,
  workspaceUsers: DEFAULT_CACHE_TTL_MS,
  "team:": DEFAULT_CACHE_TTL_MS,
  viewer: LONG_CACHE_TTL_MS,
  teams: LONG_CACHE_TTL_MS,
  workflowStatesByTeam: LONG_CACHE_TTL_MS,
  priorities: LONG_CACHE_TTL_MS,
}

export function resolveTtlMs(
  key: string,
  ttlByPrefix: Record<string, number> = CACHE_TTL_BY_PREFIX,
  defaultTtlMs: number = DEFAULT_CACHE_TTL_MS,
): number {
  for (const [prefix, ttl] of Object.entries(ttlByPrefix)) {
    if (key.startsWith(prefix) || key === prefix) {
      return ttl
    }
  }
  return defaultTtlMs
}

export class LinearCacheStore {
  #cache = new Map<string, CacheEntry<unknown>>()
  #pending = new Map<string, Promise<unknown>>()
  #generation = new Map<string, number>()
  #now: () => number
  #ttlByPrefix: Record<string, number>
  #defaultTtlMs: number
  #onCacheHit?: (key: string) => void

  constructor(options?: {
    ttlByPrefix?: Record<string, number>
    defaultTtlMs?: number
    now?: () => number
    onCacheHit?: (key: string) => void
  }) {
    this.#ttlByPrefix = options?.ttlByPrefix ?? CACHE_TTL_BY_PREFIX
    this.#defaultTtlMs = options?.defaultTtlMs ?? DEFAULT_CACHE_TTL_MS
    this.#now = options?.now ?? (() => Date.now())
    this.#onCacheHit = options?.onCacheHit
  }

  #bumpGeneration(key: string): void {
    this.#generation.set(key, (this.#generation.get(key) ?? 0) + 1)
  }

  getOrFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.#cache.get(key)
    if (cached && cached.expiresAt > this.#now()) {
      this.#onCacheHit?.(key)
      return Promise.resolve(cached.value as T)
    }

    const pending = this.#pending.get(key)
    if (pending) {
      return pending as Promise<T>
    }

    const generationAtStart = this.#generation.get(key) ?? 0
    const promise = fetcher()
      .then((value) => {
        if ((this.#generation.get(key) ?? 0) === generationAtStart) {
          this.#cache.set(key, {
            value,
            expiresAt: this.#now() + resolveTtlMs(key, this.#ttlByPrefix, this.#defaultTtlMs),
          })
        }
        return value
      })
      .finally(() => {
        if (this.#pending.get(key) === promise) {
          this.#pending.delete(key)
        }
      })

    this.#pending.set(key, promise)
    return promise
  }

  delete(key: string): void {
    this.#cache.delete(key)
    this.#pending.delete(key)
    this.#bumpGeneration(key)
  }

  deleteByPrefix(prefix: string): void {
    for (const key of new Set([...this.#cache.keys(), ...this.#pending.keys()])) {
      if (key.startsWith(prefix)) {
        this.#cache.delete(key)
        this.#pending.delete(key)
        this.#bumpGeneration(key)
      }
    }
  }

  clear(): void {
    for (const key of new Set([...this.#cache.keys(), ...this.#pending.keys()])) {
      this.#bumpGeneration(key)
    }
    this.#cache.clear()
    this.#pending.clear()
  }
}
