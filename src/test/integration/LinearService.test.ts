import * as assert from "assert"

import { Issue, LinearClient } from "@linear/sdk"

import { LinearCacheStore } from "../../linear/LinearCacheStore"
import { LinearService, MAX_LINEAR_FILE_SIZE } from "../../linear/LinearService"

function createMockIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue-1",
    title: "Test issue",
    identifier: "ENG-1",
    stateId: "state-1",
    updatedAt: new Date("2024-06-01T12:00:00.000Z"),
    ...overrides,
  } as Issue
}

function createMockClient(options?: {
  issue?: Issue
  onIssueFetch?: () => void
  onAssignedIssuesFetch?: () => void
  onSearchIssues?: (query: string) => void
}): LinearClient {
  const issue = options?.issue ?? createMockIssue()

  const mockMe = {
    teams: async () => ({ nodes: [] }),
    assignedIssues: async () => {
      options?.onAssignedIssuesFetch?.()
      return { nodes: [issue] }
    },
  }

  return {
    viewer: Promise.resolve(mockMe) as unknown as User,
    issue: async () => {
      options?.onIssueFetch?.()
      return issue
    },
    searchIssues: async (query: string) => {
      options?.onSearchIssues?.(query)
      return { nodes: [issue] }
    },
    updateIssue: async (_id: string, fields: Record<string, unknown>) => ({
      issue: Promise.resolve({ ...issue, ...fields } as Issue),
    }),
  } as unknown as LinearClient
}

// Minimal User typing for mock viewer
type User = Awaited<LinearClient["viewer"]>

suite("LinearService integration", () => {
  test("searchIssues returns workspace matches", async () => {
    let searchedQuery: string | undefined
    const service = new LinearService(
      () =>
        createMockClient({
          onSearchIssues: (query) => {
            searchedQuery = query
          },
        }),
      new LinearCacheStore(),
    )

    const issues = await service.searchIssues("  test issue  ")

    assert.strictEqual(searchedQuery, "test issue")
    assert.strictEqual(issues[0]?.identifier, "ENG-1")
    assert.strictEqual(issues[0]?.title, "Test issue")
  })

  test("resolveEditorReference builds an issue card once and rejects a bad request", async () => {
    const issueId = "99999999-9999-4999-8999-999999999999"
    let issueFetchCount = 0
    const service = new LinearService(
      () =>
        createMockClient({
          issue: createMockIssue({
            id: issueId,
            priorityLabel: "Urgent",
            state: Promise.resolve({ name: "In Progress", type: "started", color: "#f2c94c" }),
          } as Partial<Issue>),
          onIssueFetch: () => {
            issueFetchCount += 1
          },
        }),
      new LinearCacheStore(),
    )

    const card = await service.resolveEditorReference({ kind: "issue", id: issueId })
    await service.resolveEditorReference({ kind: "issue", id: issueId })

    assert.strictEqual(issueFetchCount, 1)
    assert.strictEqual(card?.id, issueId)
    assert.strictEqual(card?.workflowState?.type, "started")
    assert.strictEqual(card?.title, "ENG-1")
    assert.strictEqual(card?.subtitle, "Test issue")
    assert.deepStrictEqual(card?.rows, [
      { label: "Status", value: "In Progress" },
      { label: "Priority", value: "Urgent" },
    ])

    await assert.rejects(
      () => service.resolveEditorReference({ kind: "team" as "issue", id: "issue-1" }),
      /Invalid Linear reference request/,
    )
    await assert.rejects(
      () => service.resolveEditorReference({ kind: "issue", id: "../escape" }),
      /Invalid Linear reference request/,
    )
  })

  test("resolveEditorReference looks an issue up by identifier when the reference is a URL", async () => {
    let searchedQuery: string | undefined
    const service = new LinearService(
      () =>
        createMockClient({
          onSearchIssues: (query) => {
            searchedQuery = query
          },
        }),
      new LinearCacheStore(),
    )

    const card = await service.resolveEditorReference({ kind: "issue", id: "ENG-1" })

    assert.strictEqual(searchedQuery, "ENG-1")
    assert.strictEqual(card?.identifier, "ENG-1")
  })

  test("resolveEditorReference returns null when Linear cannot resolve the reference", async () => {
    const service = new LinearService(
      () =>
        ({
          customView: async () => {
            throw new Error("Not found")
          },
        }) as unknown as LinearClient,
      new LinearCacheStore(),
    )

    assert.strictEqual(await service.resolveEditorReference({ kind: "view", id: "slug" }), null)
  })

  test("searchIssues skips blank queries", async () => {
    let searchCount = 0
    const service = new LinearService(
      () =>
        createMockClient({
          onSearchIssues: () => {
            searchCount += 1
          },
        }),
      new LinearCacheStore(),
    )

    assert.deepStrictEqual(await service.searchIssues("  "), [])
    assert.strictEqual(searchCount, 0)
  })

  test("getIssue caches repeated reads for the same issue", async () => {
    let issueFetchCount = 0
    const service = new LinearService(
      () =>
        createMockClient({
          onIssueFetch: () => {
            issueFetchCount += 1
          },
        }),
      new LinearCacheStore(),
    )

    await service.getIssue("issue-1")
    await service.getIssue("issue-1")

    assert.strictEqual(issueFetchCount, 1)
  })

  test("getIssue bypassCache forces a fresh fetch", async () => {
    let issueFetchCount = 0
    const service = new LinearService(
      () =>
        createMockClient({
          onIssueFetch: () => {
            issueFetchCount += 1
          },
        }),
      new LinearCacheStore(),
    )

    await service.getIssue("issue-1")
    await service.getIssue("issue-1", { bypassCache: true })

    assert.strictEqual(issueFetchCount, 2)
  })

  test("invalidateIssue during an in-flight fetch still returns fresh data on bypass", async () => {
    let issueFetchCount = 0
    let resolveFirstFetch: (() => void) | undefined
    const firstFetchGate = new Promise<void>((resolve) => {
      resolveFirstFetch = resolve
    })

    const service = new LinearService(
      () =>
        ({
          issue: async () => {
            issueFetchCount += 1
            if (issueFetchCount === 1) {
              await firstFetchGate
            }
            return createMockIssue({ title: `Fetch ${issueFetchCount}` })
          },
        }) as unknown as LinearClient,
      new LinearCacheStore(),
    )

    const firstFetch = service.getIssue("issue-1")
    service.invalidateIssue("issue-1")
    resolveFirstFetch?.()

    await firstFetch
    const freshIssue = await service.getIssue("issue-1", { bypassCache: true })

    assert.strictEqual(issueFetchCount, 2)
    assert.strictEqual(freshIssue.title, "Fetch 2")
  })

  test("validates title edits before calling Linear and preserves other update fields", async () => {
    const calls: Record<string, unknown>[] = []
    const client = createMockClient()
    client.updateIssue = async (_id, fields) => {
      calls.push(fields)
      return {
        issue: Promise.resolve(createMockIssue({ title: fields.title ?? "Test issue" })),
      } as never
    }
    const service = new LinearService(() => client, new LinearCacheStore())
    const fields = { title: "  Fix\nlogin  ", priority: 2 }
    const issue = await service.updateIssue("issue-1", fields)
    assert.strictEqual(issue.title, "Fix login")
    assert.deepStrictEqual(calls, [{ title: "Fix login", priority: 2 }])
    assert.strictEqual(fields.title, "  Fix\nlogin  ")
    await assert.rejects(service.updateIssue("issue-1", { title: " \n " }), /cannot be empty/)
    await assert.rejects(service.updateIssue("issue-1", { title: null }), /must be text/)
    assert.strictEqual(calls.length, 1)
  })

  test("updateIssue invalidates the issue cache", async () => {
    let issueFetchCount = 0
    const service = new LinearService(
      () =>
        createMockClient({
          onIssueFetch: () => {
            issueFetchCount += 1
          },
        }),
      new LinearCacheStore(),
    )

    await service.getIssue("issue-1")
    await service.updateIssue("issue-1", { title: "Updated title" })
    await service.getIssue("issue-1")

    assert.strictEqual(issueFetchCount, 2)
  })

  test("updateIssue with stateId invalidates assigned issue lists", async () => {
    let assignedFetchCount = 0
    const service = new LinearService(
      () =>
        createMockClient({
          onAssignedIssuesFetch: () => {
            assignedFetchCount += 1
          },
        }),
      new LinearCacheStore(),
    )

    await service.getAssignedIssues()
    await service.updateIssue("issue-1", { stateId: "state-2" })
    await service.getAssignedIssues()

    assert.strictEqual(assignedFetchCount, 2)
  })

  test("updateIssue with assigneeId invalidates assigned issue lists", async () => {
    let assignedFetchCount = 0
    const service = new LinearService(
      () =>
        createMockClient({
          onAssignedIssuesFetch: () => {
            assignedFetchCount += 1
          },
        }),
      new LinearCacheStore(),
    )

    await service.getAssignedIssues()
    await service.updateIssue("issue-1", { assigneeId: "user-2" })
    await service.getAssignedIssues()

    assert.strictEqual(assignedFetchCount, 2)
  })

  test("invalidateAll clears cached data", async () => {
    let issueFetchCount = 0
    const service = new LinearService(
      () =>
        createMockClient({
          onIssueFetch: () => {
            issueFetchCount += 1
          },
        }),
      new LinearCacheStore(),
    )

    await service.getIssue("issue-1")
    service.invalidateAll()
    await service.getIssue("issue-1")

    assert.strictEqual(issueFetchCount, 2)
  })

  test("createComment invalidates the parent issue cache", async () => {
    let issueFetchCount = 0
    const service = new LinearService(
      () =>
        ({
          ...createMockClient({
            onIssueFetch: () => {
              issueFetchCount += 1
            },
          }),
          createComment: async () => undefined,
        }) as unknown as LinearClient,
      new LinearCacheStore(),
    )

    await service.getIssue("issue-1")
    await service.createComment({ issueId: "issue-1", body: "Hello" })
    await service.getIssue("issue-1")

    assert.strictEqual(issueFetchCount, 2)
  })

  test("getIssueHistory fetches all history pages", async () => {
    let historyFetchCount = 0
    const historyNodes = [
      { id: "history-1", createdAt: new Date(), updatedAt: new Date() },
      { id: "history-2", createdAt: new Date(), updatedAt: new Date() },
      { id: "history-3", createdAt: new Date(), updatedAt: new Date() },
    ]

    const emptyConnection = {
      nodes: [] as unknown[],
      pageInfo: { hasPreviousPage: false, endCursor: null },
      fetchPrevious: async () => emptyConnection,
    }

    const mockIssue = {
      teamId: "team-1",
      history: async (params: { first?: number; before?: string; last?: number }) => {
        historyFetchCount += 1

        if (params.first) {
          return {
            nodes: [historyNodes[0]],
            pageInfo: { endCursor: "cursor-1", hasPreviousPage: true },
          }
        }

        return {
          nodes: [historyNodes[1], historyNodes[2]],
          pageInfo: { endCursor: null, hasPreviousPage: false },
        }
      },
    }

    const service = new LinearService(
      () =>
        ({
          issue: async () => mockIssue,
          issueLabels: async () => emptyConnection,
          cycles: async () => emptyConnection,
          projects: async () => emptyConnection,
          workflowStates: async () => emptyConnection,
          users: async () => emptyConnection,
          get issuePriorityValues() {
            return Promise.resolve([])
          },
        }) as unknown as LinearClient,
      new LinearCacheStore(),
    )

    const page = await service.getIssueHistory({ issueId: "issue-1" })

    assert.strictEqual(historyFetchCount, 2)
    assert.strictEqual(page.nodes.length, 3)
    assert.deepStrictEqual(
      page.nodes.map((node) => node.id),
      ["history-1", "history-2", "history-3"],
    )
    assert.ok(page.nodes.every((node) => node.resolved !== undefined))
  })

  test("searchEditorMentions returns public URL-backed resources despite a partial failure", async () => {
    let issueSearchOptions: Record<string, unknown> | undefined
    let unsupportedCollectionCalls = 0
    const userConnection = {
      nodes: Array.from({ length: 10 }, (_, index) => ({
        id: `user-${index}`,
        displayName: `Ada ${index}`,
        name: `Ada Lovelace ${index}`,
        email: `ada-${index}@example.com`,
        active: true,
        isMentionable: true,
        url: `https://linear.app/acme/profiles/ada-${index}`,
      })),
      pageInfo: { hasPreviousPage: false, hasNextPage: false },
      fetchPrevious: async () => userConnection,
    }
    const service = new LinearService(
      () =>
        ({
          users: async () => userConnection,
          searchIssues: async (_query: string, options: Record<string, unknown>) => {
            issueSearchOptions = options
            return {
              nodes: Array.from({ length: 10 }, (_, index) => ({
                id: `issue-${index}`,
                identifier: `ENG-${index}`,
                title: `Ada support ${index}`,
                url: `https://linear.app/acme/issue/ENG-${index}/ada-support`,
              })),
            }
          },
          searchProjects: async () => {
            throw new Error("Projects unavailable")
          },
          searchDocuments: async () => ({
            nodes: Array.from({ length: 10 }, (_, index) => ({
              id: `document-${index}`,
              title: `Ada notes ${index}`,
              url: `https://linear.app/acme/document/ada-notes-document-${index}`,
            })),
          }),
          cycles: async () => {
            unsupportedCollectionCalls += 1
          },
          projectMilestones: async () => {
            unsupportedCollectionCalls += 1
          },
        }) as unknown as LinearClient,
      new LinearCacheStore(),
    )

    const mentions = await service.searchEditorMentions("Ada")

    assert.strictEqual(mentions.filter(({ kind }) => kind === "user").length, 8)
    assert.strictEqual(mentions.filter(({ kind }) => kind === "issue").length, 8)
    assert.strictEqual(mentions.filter(({ kind }) => kind === "document").length, 8)
    assert.strictEqual(
      mentions.some(({ kind }) => kind === "project"),
      false,
    )
    assert.strictEqual(unsupportedCollectionCalls, 2)
    assert.deepStrictEqual(issueSearchOptions, { first: 8, includeArchived: false })
    assert.ok(mentions.every((mention) => mention.resourceUrl.startsWith("https://linear.app/")))
  })

  test("searchEditorMentions returns cycles and project milestones with observed Linear URLs", async () => {
    let organizationReads = 0
    const emptyConnection = {
      nodes: [],
      pageInfo: { hasPreviousPage: false, hasNextPage: false },
      fetchPrevious: async () => emptyConnection,
    }
    const service = new LinearService(
      () =>
        ({
          users: async () => emptyConnection,
          searchIssues: async () => emptyConnection,
          searchProjects: async () => emptyConnection,
          searchDocuments: async () => emptyConnection,
          cycles: async () => ({
            ...emptyConnection,
            nodes: [{ id: "cycle-12", number: 12, name: null }],
          }),
          projectMilestones: async () => ({
            ...emptyConnection,
            nodes: [{ id: "milestone-1", name: "Public beta" }],
          }),
          get organization() {
            organizationReads += 1
            return Promise.resolve({ urlKey: "acme workspace" })
          },
        }) as unknown as LinearClient,
      new LinearCacheStore(),
    )

    const mentions = await service.searchEditorMentions("12")

    assert.deepStrictEqual(
      mentions.filter(({ kind }) => kind === "cycle" || kind === "milestone"),
      [
        {
          kind: "cycle",
          id: "cycle-12",
          label: "Cycle 12",
          resourceUrl: "https://linear.app/acme%20workspace/cycle/cycle-12",
        },
        {
          kind: "milestone",
          id: "milestone-1",
          label: "Public beta",
          resourceUrl: "https://linear.app/acme%20workspace/project-milestone/milestone-1",
        },
      ],
    )
    assert.strictEqual(organizationReads, 1)
  })

  test("uploadLinearFile supplies required headers omitted by Linear", async () => {
    const data = Buffer.from("hello")
    let sdkArguments: unknown[] = []
    let fetchedUrl = ""
    let fetchOptions: RequestInit | undefined
    const service = new LinearService(
      () =>
        ({
          fileUpload: async (...args: unknown[]) => {
            sdkArguments = args
            return {
              success: true,
              uploadFile: {
                uploadUrl: "https://storage.googleapis.com/upload-target",
                assetUrl: "https://uploads.linear.app/asset.txt",
                headers: [{ key: "x-goog-content-length-range", value: "5,5" }],
              },
            }
          },
        }) as unknown as LinearClient,
      new LinearCacheStore(),
    )
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url, options) => {
      fetchedUrl = String(url)
      fetchOptions = options
      const headers = new Headers(options?.headers)
      const valid =
        headers.get("Content-Type") === "text/plain" &&
        headers.get("Cache-Control") === "public, max-age=31536000"
      return new Response(null, { status: valid ? 200 : 400 })
    }

    try {
      const result = await service.uploadLinearFile({
        uploadId: "upload-1",
        name: "asset.txt",
        mimeType: "text/plain",
        size: data.length,
        base64: data.toString("base64"),
      })

      assert.deepStrictEqual(sdkArguments, ["text/plain", "asset.txt", 5])
      assert.strictEqual(fetchedUrl, "https://storage.googleapis.com/upload-target")
      assert.strictEqual(fetchOptions?.method, "PUT")
      const headers: Record<string, string> = {}
      new Headers(fetchOptions?.headers).forEach((value, key) => (headers[key] = value))
      assert.deepStrictEqual(headers, {
        "cache-control": "public, max-age=31536000",
        "content-type": "text/plain",
        "x-goog-content-length-range": "5,5",
      })
      assert.strictEqual(Buffer.from(fetchOptions?.body as ArrayBuffer).toString(), "hello")
      assert.strictEqual(fetchOptions?.redirect, "error")
      assert.deepStrictEqual(result, { assetUrl: "https://uploads.linear.app/asset.txt" })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("uploadLinearFile preserves signed headers over defaults regardless of casing", async () => {
    const service = new LinearService(
      () =>
        ({
          fileUpload: async () => ({
            success: true,
            uploadFile: {
              uploadUrl: "https://storage.googleapis.com/upload-target",
              assetUrl: "https://uploads.linear.app/asset.png",
              headers: [
                { key: "content-type", value: "application/octet-stream" },
                { key: "cache-control", value: "private, max-age=3600" },
                { key: "x-goog-content-length-range", value: "1,1" },
              ],
            },
          }),
        }) as unknown as LinearClient,
      new LinearCacheStore(),
    )
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (_url, options) => {
      const headers: Record<string, string> = {}
      new Headers(options?.headers).forEach((value, key) => (headers[key] = value))
      assert.deepStrictEqual(headers, {
        "cache-control": "private, max-age=3600",
        "content-type": "application/octet-stream",
        "x-goog-content-length-range": "1,1",
      })
      return new Response(null, { status: 200 })
    }
    try {
      await service.uploadLinearFile({
        uploadId: "upload-signed-headers",
        name: "asset.png",
        mimeType: "image/png",
        size: 1,
        base64: "YQ==",
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("downloadLinearAsset fetches the canonical URL with the SDK authorization", async () => {
    const service = new LinearService(
      () =>
        ({
          options: { headers: { Authorization: "Bearer linear-token" } },
        }) as unknown as LinearClient,
      new LinearCacheStore(),
    )
    const originalFetch = globalThis.fetch
    let fetchedUrl = ""
    let fetchOptions: RequestInit | undefined
    globalThis.fetch = async (url, options) => {
      fetchedUrl = String(url)
      fetchOptions = options
      return new Response("audio", {
        headers: {
          "content-length": "5",
          "content-type": "audio/mpeg; charset=binary",
        },
      })
    }

    try {
      const result = await service.downloadLinearAsset(
        "https://uploads.linear.app/workspace/audio?signature=expired&download=1",
      )

      assert.strictEqual(fetchedUrl, "https://uploads.linear.app/workspace/audio?download=1")
      assert.deepStrictEqual(fetchOptions?.headers, { Authorization: "Bearer linear-token" })
      assert.strictEqual(fetchOptions?.redirect, "error")
      assert.deepStrictEqual(result, {
        base64: Buffer.from("audio").toString("base64"),
        mimeType: "audio/mpeg",
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("uploadLinearFile validates size and supports cancellation", async () => {
    const serviceWithoutClient = new LinearService(() => null, new LinearCacheStore())
    await assert.rejects(
      serviceWithoutClient.uploadLinearFile({
        uploadId: "too-large",
        name: "asset.bin",
        mimeType: "application/octet-stream",
        size: MAX_LINEAR_FILE_SIZE + 1,
        base64: "",
      }),
      /between 1 byte/,
    )

    let markFetchStarted: (() => void) | undefined
    const fetchStarted = new Promise<void>((resolve) => {
      markFetchStarted = resolve
    })
    const service = new LinearService(
      () =>
        ({
          fileUpload: async () => ({
            success: true,
            uploadFile: {
              uploadUrl: "https://storage.googleapis.com/upload-target",
              assetUrl: "https://uploads.linear.app/asset.txt",
              headers: [],
            },
          }),
        }) as unknown as LinearClient,
      new LinearCacheStore(),
    )
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (_url, options) => {
      markFetchStarted?.()
      return new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => reject(options.signal?.reason))
      })
    }

    try {
      const upload = service.uploadLinearFile({
        uploadId: "upload-cancel",
        name: "asset.txt",
        mimeType: "text/plain",
        size: 1,
        base64: "YQ==",
      })
      await fetchStarted

      assert.strictEqual(service.cancelLinearFileUpload("upload-cancel"), true)
      await assert.rejects(upload, /abort/i)
      assert.strictEqual(service.cancelLinearFileUpload("upload-cancel"), false)
    } finally {
      service.cancelLinearFileUpload("upload-cancel")
      globalThis.fetch = originalFetch
    }
  })

  test("uploadLinearFile cancellation prevents the signed PUT while instructions are pending", async () => {
    let resolveInstructions: ((value: unknown) => void) | undefined
    let markInstructionsRequested: (() => void) | undefined
    const instructionsRequested = new Promise<void>((resolve) => {
      markInstructionsRequested = resolve
    })
    const instructions = new Promise((resolve) => {
      resolveInstructions = resolve
    })
    const service = new LinearService(
      () =>
        ({
          fileUpload: () => {
            markInstructionsRequested?.()
            return instructions
          },
        }) as unknown as LinearClient,
      new LinearCacheStore(),
    )
    const originalFetch = globalThis.fetch
    let fetchCalls = 0
    globalThis.fetch = async () => {
      fetchCalls += 1
      return { ok: true } as Response
    }

    try {
      const upload = service.uploadLinearFile({
        uploadId: "upload-before-put",
        name: "asset.txt",
        mimeType: "text/plain",
        size: 1,
        base64: "YQ==",
      })
      await instructionsRequested
      assert.strictEqual(service.cancelLinearFileUpload("upload-before-put"), true)
      resolveInstructions?.({
        success: true,
        uploadFile: {
          uploadUrl: "https://storage.googleapis.com/upload-target",
          assetUrl: "https://uploads.linear.app/asset.txt",
          headers: [],
        },
      })

      await assert.rejects(upload, /abort/i)
      assert.strictEqual(fetchCalls, 0)
    } finally {
      service.cancelLinearFileUpload("upload-before-put")
      globalThis.fetch = originalFetch
    }
  })
})
