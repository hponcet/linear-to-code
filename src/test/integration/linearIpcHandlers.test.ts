import * as assert from "assert"

import { Issue } from "@linear/sdk"

import { LinearService } from "../../linear/LinearService"
import { handleLinearIpcMessage } from "../../panels/linearIpcHandlers"
import { IssueSyncPayload } from "../../types/IssueSync"
import { SerializedIssue } from "../../types/SerializedLinear"
import { MyIssuesView } from "../../views/myIssues"

function createIssueActions() {
  const syncCalls: IssueSyncPayload[] = []
  let refreshIssuesCalls = 0

  const issueActions = {
    syncIssue: async (payload: IssueSyncPayload) => {
      syncCalls.push(payload)
    },
    refreshIssues: async () => {
      refreshIssuesCalls += 1
    },
  } as Pick<MyIssuesView["issuesActions"], "syncIssue" | "refreshIssues">

  return {
    issueActions: issueActions as MyIssuesView["issuesActions"],
    syncCalls,
    getRefreshIssuesCalls: () => refreshIssuesCalls,
  }
}

function createMockSdkIssue(overrides: Record<string, unknown> = {}): Issue {
  const stateId = (overrides._state as { id: string } | undefined)?.id ?? "state-1"
  const data = {
    id: "issue-1",
    title: "Test issue",
    identifier: "ENG-1",
    url: "https://linear.app/issue/ENG-1",
    number: 1,
    priority: 2,
    priorityLabel: "High",
    labelIds: [],
    branchName: "eng/test-issue",
    createdAt: new Date("2024-06-01T12:00:00.000Z"),
    updatedAt: new Date("2024-06-01T12:00:00.000Z"),
    reactions: [],
    _state: { id: stateId },
    _team: { id: "team-1" },
    ...overrides,
  }

  return Object.defineProperties(data, {
    stateId: { get: () => stateId, enumerable: false },
    teamId: { get: () => "team-1", enumerable: false },
    cycleId: { get: () => undefined, enumerable: false },
    projectId: { get: () => undefined, enumerable: false },
    assigneeId: {
      get: () => (data as { _assignee?: { id?: string } })._assignee?.id,
      enumerable: false,
    },
    parentId: { get: () => undefined, enumerable: false },
    creatorId: { get: () => undefined, enumerable: false },
  }) as unknown as Issue
}

suite("linearIpcHandlers integration", () => {
  function createMockService(overrides: Partial<LinearService> = {}): LinearService {
    return {
      getIssue: async (issueId: string) =>
        createMockSdkIssue({
          id: issueId,
        }),
      getTeamMetadata: async () => ({
        labels: [],
        cycles: [],
        workflowStates: [],
        projects: [],
      }),
      getProjectLabels: async () => [
        {
          id: "project-label-1",
          name: "Backend",
          color: "#ff0000",
          parentId: undefined,
          isGroup: false,
        },
      ],
      getWorkspaceLabels: async () => [
        {
          id: "issue-label-1",
          name: "Bug",
          color: "#ff0000",
          parentId: undefined,
          isGroup: false,
        },
        {
          id: "project-label-1",
          name: "Backend",
          color: "#00ff00",
          parentId: undefined,
          isGroup: false,
        },
      ],
      getComments: async () => [],
      updateIssue: async (
        issueId: string,
        fields: { title?: string; stateId?: string; assigneeId?: string | null },
      ) => {
        const stateId = fields.stateId ?? "state-1"
        return createMockSdkIssue({
          id: issueId,
          title: fields.title ?? "Test issue",
          updatedAt: new Date("2024-06-02T12:00:00.000Z"),
          _state: { id: stateId },
          _assignee: fields.assigneeId ? { id: fields.assigneeId } : undefined,
        })
      },
      createComment: async () => undefined,
      ...overrides,
    } as unknown as LinearService
  }

  test("getIssue returns serialized issue with getter-backed IDs", async () => {
    const { issueActions } = createIssueActions()
    const service = createMockService()

    const result = await handleLinearIpcMessage(
      { type: "getIssue", issueId: "issue-1" },
      issueActions,
      service,
    )

    assert.strictEqual(result.handled, true)
    if (!result.handled) {
      return
    }

    const issue = result.payload as SerializedIssue
    assert.ok(issue.updatedAt instanceof Date)
    assert.strictEqual(issue.id, "issue-1")
    assert.strictEqual(issue.stateId, "state-1")
    assert.strictEqual(issue.teamId, "team-1")
  })

  test("linearUpdateIssue syncs the tree view via issueActions", async () => {
    const { issueActions, syncCalls } = createIssueActions()
    const service = createMockService()

    const result = await handleLinearIpcMessage(
      {
        type: "linearUpdateIssue",
        issueId: "issue-1",
        fields: { title: "Updated title", stateId: "state-2" },
      },
      issueActions,
      service,
    )

    assert.strictEqual(result.handled, true)
    assert.strictEqual(syncCalls.length, 1)
    assert.strictEqual(syncCalls[0]?.issueId, "issue-1")
    assert.strictEqual(syncCalls[0]?.title, "Updated title")
    assert.strictEqual(syncCalls[0]?.stateId, "state-2")
  })

  test("linearUpdateIssue sync payload includes assigneeId", async () => {
    const { issueActions, syncCalls } = createIssueActions()
    const service = createMockService()

    const result = await handleLinearIpcMessage(
      {
        type: "linearUpdateIssue",
        issueId: "issue-1",
        fields: { assigneeId: "user-2" },
      },
      issueActions,
      service,
    )

    assert.strictEqual(result.handled, true)
    assert.strictEqual(syncCalls.length, 1)
    assert.strictEqual(syncCalls[0]?.assigneeId, "user-2")
  })

  test("getTeamMetadata delegates to LinearService", async () => {
    const { issueActions } = createIssueActions()
    const service = createMockService()

    const result = await handleLinearIpcMessage(
      { type: "getTeamMetadata", teamId: "team-1" },
      issueActions,
      service,
    )

    assert.strictEqual(result.handled, true)
    if (!result.handled) {
      return
    }

    const metadata = result.payload as { workflowStates: unknown[] }
    assert.ok(Array.isArray(metadata.workflowStates))
  })

  test("getProjectLabels delegates to LinearService and serializes labels", async () => {
    const { issueActions } = createIssueActions()
    const service = createMockService()

    const result = await handleLinearIpcMessage(
      { type: "getProjectLabels", projectId: "project-1" },
      issueActions,
      service,
    )

    assert.strictEqual(result.handled, true)
    if (!result.handled) {
      return
    }

    const labels = result.payload as { id: string; name: string; color: string }[]
    assert.strictEqual(labels.length, 1)
    assert.strictEqual(labels[0]?.id, "project-label-1")
    assert.strictEqual(labels[0]?.name, "Backend")
  })

  test("getWorkspaceLabels delegates to LinearService and serializes labels", async () => {
    const { issueActions } = createIssueActions()
    const service = createMockService()

    const result = await handleLinearIpcMessage(
      { type: "getWorkspaceLabels" },
      issueActions,
      service,
    )

    assert.strictEqual(result.handled, true)
    if (!result.handled) {
      return
    }

    const labels = result.payload as { id: string; name: string; color: string }[]
    assert.strictEqual(labels.length, 2)
    assert.deepStrictEqual(labels.map((label) => label.id).sort(), [
      "issue-label-1",
      "project-label-1",
    ])
  })

  test("createSubIssue refreshes My Issues and returns the created issue", async () => {
    const { issueActions, getRefreshIssuesCalls } = createIssueActions()
    const service = createMockService({
      createSubIssue: async () =>
        createMockSdkIssue({
          id: "issue-2",
          identifier: "ENG-2",
          title: "New sub-issue",
          _state: { id: "state-1" },
        }),
    })

    const result = await handleLinearIpcMessage(
      {
        type: "createSubIssue",
        parentId: "issue-1",
        teamId: "team-1",
        fields: { title: "New sub-issue" },
      },
      issueActions,
      service,
    )

    assert.strictEqual(result.handled, true)
    assert.strictEqual(getRefreshIssuesCalls(), 1)
    if (!result.handled) {
      return
    }

    const issue = result.payload as SerializedIssue
    assert.strictEqual(issue.id, "issue-2")
    assert.strictEqual(issue.title, "New sub-issue")
  })

  test("createIssue creates in the requested team, refreshes My Issues and returns the issue", async () => {
    const { issueActions, getRefreshIssuesCalls } = createIssueActions()
    const calls: unknown[][] = []
    const service = createMockService({
      createIssue: async (...args: unknown[]) => {
        calls.push(args)
        return createMockSdkIssue({ id: "issue-3", identifier: "ENG-3", title: "New issue" })
      },
    })

    const result = await handleLinearIpcMessage(
      {
        type: "createIssue",
        teamId: "team-1",
        fields: { title: "New issue", description: "", priority: 0 },
      },
      issueActions,
      service,
    )

    assert.deepStrictEqual(calls, [
      ["team-1", { title: "New issue", description: "", priority: 0 }],
    ])
    assert.strictEqual(getRefreshIssuesCalls(), 1)
    assert.strictEqual(result.handled && (result.payload as SerializedIssue).identifier, "ENG-3")
  })

  test("createComment delegates to LinearService", async () => {
    let createCommentCalled = false
    const service = createMockService({
      createComment: async (input: { issueId: string; body: string }) => {
        createCommentCalled = true
        assert.strictEqual(input.issueId, "issue-1")
        assert.strictEqual(input.body, "New comment")
      },
    })

    const { issueActions } = createIssueActions()

    const result = await handleLinearIpcMessage(
      { type: "createComment", issueId: "issue-1", body: "New comment" },
      issueActions,
      service,
    )

    assert.strictEqual(result.handled, true)
    assert.strictEqual(createCommentCalled, true)
  })

  test("rejects unsupported Markdown before every content mutation", async () => {
    let mutationCalls = 0
    const service = createMockService({
      updateIssue: async () => {
        mutationCalls += 1
        return createMockSdkIssue()
      },
      createComment: async () => {
        mutationCalls += 1
      },
      updateComment: async () => {
        mutationCalls += 1
      },
      createSubIssue: async () => {
        mutationCalls += 1
        return createMockSdkIssue()
      },
      createIssue: async () => {
        mutationCalls += 1
        return createMockSdkIssue()
      },
    })
    const { issueActions } = createIssueActions()

    const messages = [
      {
        type: "linearUpdateIssue" as const,
        issueId: "issue-1",
        fields: { description: "<div>unsafe</div>" },
      },
      {
        type: "createComment" as const,
        issueId: "issue-1",
        body: "<div>unsafe</div>",
      },
      {
        type: "updateComment" as const,
        commentId: "comment-1",
        body: "<div>unsafe</div>",
      },
      {
        type: "createSubIssue" as const,
        parentId: "issue-1",
        teamId: "team-1",
        fields: { title: "Child", description: "<div>unsafe</div>" },
      },
      {
        type: "createIssue" as const,
        teamId: "team-1",
        fields: { title: "New issue", description: "<div>unsafe</div>" },
      },
    ]

    for (const message of messages) {
      await assert.rejects(
        handleLinearIpcMessage(message, issueActions, service),
        /unsupported Linear Markdown/,
      )
    }
    assert.strictEqual(mutationCalls, 0)
  })

  test("searchEditorMentions delegates to LinearService", async () => {
    const { issueActions } = createIssueActions()
    const service = createMockService({
      searchEditorMentions: async (query: string) => [
        {
          kind: "issue",
          id: "issue-1",
          label: query,
          resourceUrl: "https://linear.app/acme/issue/ENG-1",
        },
      ],
    })

    const result = await handleLinearIpcMessage(
      { type: "searchEditorMentions", query: "ENG-1" },
      issueActions,
      service,
    )

    assert.strictEqual(result.handled, true)
    if (result.handled) {
      assert.deepStrictEqual(result.payload, [
        {
          kind: "issue",
          id: "issue-1",
          label: "ENG-1",
          resourceUrl: "https://linear.app/acme/issue/ENG-1",
        },
      ])
    }
  })

  test("file IPC delegates authenticated downloads, uploads, and cancellation", async () => {
    const { issueActions } = createIssueActions()
    let uploadName = ""
    const service = createMockService({
      downloadLinearAsset: async () => ({ base64: "aGk=", mimeType: "text/plain" }),
      uploadLinearFile: async (input) => {
        uploadName = input.name
        return { assetUrl: "https://uploads.linear.app/asset.txt" }
      },
      cancelLinearFileUpload: (uploadId) => uploadId === "upload-1",
    })

    const downloaded = await handleLinearIpcMessage(
      { type: "downloadLinearAsset", url: "https://uploads.linear.app/asset.txt" },
      issueActions,
      service,
    )
    const uploaded = await handleLinearIpcMessage(
      {
        type: "uploadLinearFile",
        uploadId: "upload-1",
        name: "asset.txt",
        mimeType: "text/plain",
        size: 2,
        base64: "aGk=",
      },
      issueActions,
      service,
    )
    const cancelled = await handleLinearIpcMessage(
      { type: "cancelLinearFileUpload", uploadId: "upload-1" },
      issueActions,
      service,
    )

    assert.strictEqual(uploadName, "asset.txt")
    assert.deepStrictEqual(downloaded, {
      handled: true,
      payload: { base64: "aGk=", mimeType: "text/plain" },
    })
    assert.deepStrictEqual(uploaded, {
      handled: true,
      payload: { assetUrl: "https://uploads.linear.app/asset.txt" },
    })
    assert.deepStrictEqual(cancelled, { handled: true, payload: { cancelled: true } })
  })

  test("returns handled false for unknown IPC messages", async () => {
    const { issueActions } = createIssueActions()
    const service = createMockService()

    const result = await handleLinearIpcMessage(
      { type: "openIssue", issueId: "issue-1" },
      issueActions,
      service,
    )

    assert.strictEqual(result.handled, false)
  })
})
