import * as assert from "assert"

import { LinearCacheStore, resolveTtlMs } from "../../linear/LinearCacheStore"

suite("LinearCacheStore", () => {
  test("resolveTtlMs returns prefix-specific TTL", () => {
    assert.strictEqual(resolveTtlMs("issue:abc"), 60 * 1000)
    assert.strictEqual(resolveTtlMs("viewer"), 15 * 60 * 1000)
    assert.strictEqual(resolveTtlMs("unknown-key"), 10 * 60 * 1000)
  })

  test("getOrFetch deduplicates concurrent requests", async () => {
    let fetchCount = 0
    const now = { value: 0 }
    const cache = new LinearCacheStore({
      now: () => now.value,
      defaultTtlMs: 1000,
    })

    const [first, second] = await Promise.all([
      cache.getOrFetch("viewer", async () => {
        fetchCount += 1
        return "viewer-data"
      }),
      cache.getOrFetch("viewer", async () => {
        fetchCount += 1
        return "viewer-data"
      }),
    ])

    assert.strictEqual(first, "viewer-data")
    assert.strictEqual(second, "viewer-data")
    assert.strictEqual(fetchCount, 1)
  })

  test("getOrFetch serves cached value until TTL expires", async () => {
    let fetchCount = 0
    const now = { value: 0 }
    const cache = new LinearCacheStore({
      now: () => now.value,
      ttlByPrefix: { viewer: 1000 },
      defaultTtlMs: 1000,
    })

    const first = await cache.getOrFetch("viewer", async () => {
      fetchCount += 1
      return "viewer-data"
    })
    now.value = 500
    const cached = await cache.getOrFetch("viewer", async () => {
      fetchCount += 1
      return "viewer-data-2"
    })
    now.value = 1500
    const refreshed = await cache.getOrFetch("viewer", async () => {
      fetchCount += 1
      return "viewer-data-3"
    })

    assert.strictEqual(first, "viewer-data")
    assert.strictEqual(cached, "viewer-data")
    assert.strictEqual(refreshed, "viewer-data-3")
    assert.strictEqual(fetchCount, 2)
  })

  test("deleteByPrefix removes matching cache entries", async () => {
    const cache = new LinearCacheStore()
    await cache.getOrFetch("cycleIssues:team-a", async () => ["issue-1"])
    await cache.getOrFetch("assignedIssues", async () => ["issue-2"])

    cache.deleteByPrefix("cycleIssues:")

    let assignedFetchCount = 0
    let cycleFetchCount = 0

    await cache.getOrFetch("assignedIssues", async () => {
      assignedFetchCount += 1
      return ["issue-2"]
    })
    await cache.getOrFetch("cycleIssues:team-a", async () => {
      cycleFetchCount += 1
      return ["issue-3"]
    })

    assert.strictEqual(assignedFetchCount, 0)
    assert.strictEqual(cycleFetchCount, 1)
  })

  test("delete removes pending in-flight fetch", async () => {
    let fetchCount = 0
    let resolveFirstFetch: (() => void) | undefined
    const firstFetchGate = new Promise<void>((resolve) => {
      resolveFirstFetch = resolve
    })
    const cache = new LinearCacheStore()

    const firstFetch = cache.getOrFetch("issue:issue-1", async () => {
      fetchCount += 1
      if (fetchCount === 1) {
        await firstFetchGate
      }
      return `value-${fetchCount}`
    })

    cache.delete("issue:issue-1")
    resolveFirstFetch?.()
    await firstFetch

    const second = await cache.getOrFetch("issue:issue-1", async () => {
      fetchCount += 1
      return `value-${fetchCount}`
    })

    assert.strictEqual(second, "value-2")
    assert.strictEqual(fetchCount, 2)
  })

  test("prefix invalidation also discards pending pages and their late cache writes", async () => {
    const cache = new LinearCacheStore()
    let release!: (value: string) => void
    const old = cache.getOrFetch(
      "navigationIssues:page",
      () =>
        new Promise<string>((resolve) => {
          release = resolve
        }),
    )
    cache.deleteByPrefix("navigationIssues:")
    assert.strictEqual(
      await cache.getOrFetch("navigationIssues:page", async () => "fresh"),
      "fresh",
    )
    release("stale")
    await old
    assert.strictEqual(
      await cache.getOrFetch("navigationIssues:page", async () => "unexpected"),
      "fresh",
    )
  })

  test("clear removes all cached and pending entries", async () => {
    const cache = new LinearCacheStore()
    await cache.getOrFetch("viewer", async () => "viewer-data")
    cache.clear()

    let fetchCount = 0
    const value = await cache.getOrFetch("viewer", async () => {
      fetchCount += 1
      return "viewer-data-2"
    })

    assert.strictEqual(value, "viewer-data-2")
    assert.strictEqual(fetchCount, 1)
  })
})
