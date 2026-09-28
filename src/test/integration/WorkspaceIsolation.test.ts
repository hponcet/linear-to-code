import * as assert from "assert"

import { commands, ExtensionContext } from "vscode"

import { Commands } from "../../constants"
import { Controller } from "../../controller"
import * as auth from "../../linear/auth"
import { defaultNavigationFilters, NavigationMetadata } from "../../linear/navigation"
import {
  buildLinearMcpServerEnv,
  createCursorMcpServerConfig,
  workspaceMcpName,
} from "../../mcp/mcpEnvBuilder"
import { IssueWebview } from "../../panels/IssueWebview"
import { StartWorkWebview } from "../../panels/StartWorkWebview"
import { MyIssuesView } from "../../views/myIssues/MyIssuesView"
import { Issue, WorkflowState } from "../../views/myIssues/types"
import { memoryState, workspaceHarness } from "../support/linearWorkspaces"

const metadata: NavigationMetadata = {
  teams: [{ id: "team", name: "Team" }],
  projects: [],
  cycles: [],
  states: [{ id: "todo", name: "Todo", color: "#888888", teamId: "team" }],
}
const state = { id: "todo", __key: "workflowState" } as WorkflowState

suite("Workspace isolation", () => {
  let h: ReturnType<typeof workspaceHarness>
  let previousRegistry: typeof auth.linearWorkspaces
  const views: MyIssuesView[] = []
  function context(): ExtensionContext {
    return {
      globalState: h.metadata,
      workspaceState: memoryState(),
      secrets: h.secrets,
      asAbsolutePath: (path: string) => `/extension/${path}`,
    } as unknown as ExtensionContext
  }
  function view(ctx: ExtensionContext, id: string) {
    const view = new MyIssuesView(ctx, id)
    view.metadata = metadata
    // Exercise data races without registering a second native tree in the test host.
    Object.assign(view, { active: true, _refreshAssigneeIcons: async () => undefined })
    views.push(view)
    return view
  }
  setup(async () => {
    h = workspaceHarness()
    await h.registry.connect("a:original")
    await h.registry.connect("b:original")
    previousRegistry = auth.linearWorkspaces
    Object.assign(auth, { linearWorkspaces: h.registry })
  })
  teardown(() => {
    views.splice(0).forEach((view) => view.dispose())
    Object.assign(auth, { linearWorkspaces: previousRegistry })
  })

  test("automatically displays every issue across three pages with the same filters", async () => {
    const current = view(context(), "a")
    const cursors: (string | undefined)[] = []
    const counts: number[] = []
    const filters = { ...defaultNavigationFilters(), view: "myIssues" as const, stateIds: ["todo"] }
    Object.assign(current.service, {
      getNavigationIssues: async (selected: typeof filters, after?: string) => {
        assert.deepStrictEqual(selected, current.filters)
        assert.strictEqual(selected.view, filters.view)
        assert.deepStrictEqual(selected.stateIds, filters.stateIds)
        cursors.push(after)
        const start = Number(after ?? 0)
        return {
          issues: Array.from(
            { length: Math.min(100, 250 - start) },
            (_, index) =>
              ({
                id: `issue-${start + index}`,
                stateId: "todo",
                __key: "issue",
              }) as Issue,
          ),
          nextCursor: start < 200 ? String(start + 100) : undefined,
        }
      },
    })
    const listener = current.onDidChangeTreeData(() => {
      counts.push((current.getChildren(state) as Issue[]).length)
    })
    try {
      await current.setFilters(filters)
      assert.deepStrictEqual(cursors, [undefined, "100", "200"])
      assert.deepStrictEqual(counts, [0, 100, 200, 250])
      assert.strictEqual((current.getChildren(state) as Issue[])[249].id, "issue-249")
      assert.ok(
        (current.getChildren(state) as Issue[]).every(({ workspaceId }) => workspaceId === "a"),
      )
    } finally {
      listener.dispose()
    }
  })

  test("keeps loaded tickets and reports an error if a later page fails", async () => {
    const current = view(context(), "a")
    Object.assign(current.service, {
      getNavigationIssues: async (_filters: unknown, after?: string) => {
        if (after) throw new Error("Second page unavailable")
        return { issues: [{ id: "first", stateId: "todo" } as Issue], nextCursor: "second" }
      },
    })
    await current.setFilters(defaultNavigationFilters())
    assert.deepStrictEqual(
      (current.getChildren(state) as Issue[]).map(({ id }) => id),
      ["first"],
    )
    assert.strictEqual(current.error, "Second page unavailable")
  })

  test("ignores late pages after filter changes and deactivation", async () => {
    const current = view(context(), "a")
    let release!: (page: { issues: Issue[]; nextCursor?: string }) => void
    const pending = new Promise<{ issues: Issue[]; nextCursor?: string }>((resolve) => {
      release = resolve
    })
    let started!: () => void
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve
    })
    Object.assign(current.service, {
      getNavigationIssues: async (filters: { view: string }, after?: string) => {
        if (filters.view === "allIssues") {
          if (!after)
            return { issues: [{ id: "first", stateId: "todo" } as Issue], nextCursor: "second" }
          assert.strictEqual(after, "second", "Must not fetch a third page for obsolete filters")
          started()
          return pending
        }
        return { issues: [{ id: "fresh", __key: "issue", stateId: "todo" } as Issue] }
      },
    })
    const old = current.setFilters(defaultNavigationFilters())
    await startedPromise
    await current.setFilters({ ...defaultNavigationFilters(), view: "myIssues" })
    release({ issues: [{ id: "stale", stateId: "todo" } as Issue], nextCursor: "third" })
    await old
    assert.deepStrictEqual(
      (current.getChildren(state) as Issue[]).map(({ id }) => id),
      ["fresh"],
    )
    let releaseAfterDeactivate!: (page: { issues: Issue[] }) => void
    Object.assign(current.service, {
      getNavigationIssues: () =>
        new Promise<{ issues: Issue[] }>((resolve) => {
          releaseAfterDeactivate = resolve
        }),
    })
    const inactivePage = current.issuesActions.refreshIssues()
    current.deactivate()
    releaseAfterDeactivate({ issues: [{ id: "inactive", stateId: "todo" } as Issue] })
    await inactivePage
    assert.deepStrictEqual(
      (current.getChildren(state) as Issue[]).map(({ id }) => id),
      ["fresh"],
    )
  })

  test("a ticket that no longer matches is removed after a panel mutation", async () => {
    const current = view(context(), "a")
    let visible = true
    Object.assign(current.service, {
      getNavigationIssues: async () => ({
        issues: visible ? [{ id: "issue-a", stateId: "todo" } as Issue] : [],
      }),
    })
    await current.setFilters(defaultNavigationFilters())
    assert.strictEqual((current.getChildren(state) as Issue[]).length, 1)
    visible = false
    await current.issuesActions.updateIssue("issue-a")
    assert.deepStrictEqual(current.getChildren(state), [])
  })

  test("a delayed native command on an A row still opens A after B becomes active", async () => {
    const ctx = context()
    const a = view(ctx, "a")
    const b = view(ctx, "b")
    Object.assign(b.service, {
      getTeams: async () => ({}),
      getWorkflowStatesByTeam: async () => ({}),
      getNavigationMetadata: async () => metadata,
      getNavigationIssues: async () => ({ issues: [] }),
    })
    const original = Controller.issueViewerFor
    let opened = false
    Controller.issueViewerFor = (id) => {
      assert.strictEqual(id, "a")
      return a
    }
    Object.assign(a, {
      openIssue: async (issue: Issue) => {
        assert.strictEqual(issue.id, "issue-a")
        opened = true
      },
    })
    try {
      a.deactivate()
      await b.initialize()
      await commands.executeCommand(Commands.openIssue, { id: "issue-a", workspaceId: "a" })
      assert.strictEqual(opened, true)
    } finally {
      Controller.issueViewerFor = original
    }
  })

  test("restores each organization's filters independently in two editor projects", async () => {
    const firstWindow = context()
    const secondWindow = context()
    Object.assign(h.registry.service("a"), { getNavigationIssues: async () => ({ issues: [] }) })
    Object.assign(h.registry.service("b"), { getNavigationIssues: async () => ({ issues: [] }) })
    await firstWindow.workspaceState.update(auth.ACTIVE_WORKSPACE_KEY, "a")
    await secondWindow.workspaceState.update(auth.ACTIVE_WORKSPACE_KEY, "b")
    await view(firstWindow, "a").setFilters({
      ...defaultNavigationFilters(),
      view: "myIssues",
      cycle: "none",
    })
    await view(firstWindow, "b").setFilters({ ...defaultNavigationFilters(), stateIds: ["todo"] })
    await view(secondWindow, "a").setFilters(defaultNavigationFilters())
    assert.strictEqual(view(firstWindow, "a").filters.view, "myIssues")
    assert.deepStrictEqual(view(firstWindow, "b").filters.stateIds, ["todo"])
    assert.strictEqual(view(secondWindow, "a").filters.view, "allIssues")
    assert.strictEqual(firstWindow.workspaceState.get(auth.ACTIVE_WORKSPACE_KEY), "a")
    assert.strictEqual(secondWindow.workspaceState.get(auth.ACTIVE_WORKSPACE_KEY), "b")
    assert.strictEqual(h.metadata.get(auth.ACTIVE_WORKSPACE_KEY), undefined)
  })

  test("open issue and Start Work operations stay in A while the active service is B", async () => {
    const ctx = context()
    const original = Object.getOwnPropertyDescriptor(Controller, "linearService")!
    const current = view(ctx, "a")
    const connection = h.registry.get("a")
    const issuePanel = new IssueWebview(ctx, current.issuesActions, connection)
    const startWork = new StartWorkWebview(ctx, current.issuesActions, connection)
    Object.assign(issuePanel, { postMessage: async () => true })
    Object.assign(startWork, { postMessage: async () => true })
    current.deactivate()
    Object.defineProperty(Controller, "linearService", {
      configurable: true,
      get: () => h.registry.service("b"),
    })
    try {
      await issuePanel.onMessageReceived({
        type: "linearUpdateIssue",
        issueId: "same-id",
        fields: { title: "Saved in A" },
      })
      await startWork.onMessageReceived({
        type: "createComment",
        issueId: "same-id",
        body: "Comment in A",
      })
      await issuePanel.onMessageReceived({
        type: "resolveEditorReference",
        kind: "issue",
        id: "11111111-1111-4111-8111-111111111111",
      })
      assert.ok(h.calls.some(({ operation }) => operation === "update"))
      assert.ok(h.calls.some(({ operation }) => operation === "comment"))
      assert.ok(h.calls.every(({ token }) => token === "a:original"))
      assert.strictEqual((await issuePanel.getProps()).connection.id, "a")
      assert.strictEqual((await startWork.getProps()).connection.id, "a")
      assert.ok(!("linearAccessToken" in (await issuePanel.getProps())))
      const envA = await buildLinearMcpServerEnv(ctx, "a")
      const envB = await buildLinearMcpServerEnv(ctx, "b")
      assert.strictEqual(envA?.LINEAR_ACCESS_TOKEN, "a:original")
      assert.strictEqual(envB?.LINEAR_ACCESS_TOKEN, "b:original")
      const config = createCursorMcpServerConfig(ctx, envA!, connection)
      assert.strictEqual(config.name, workspaceMcpName(connection))
      assert.notStrictEqual(config.name, workspaceMcpName(h.registry.get("b")))
      assert.strictEqual(config.server.env.LINEAR_WORKSPACE_ID, "a")
    } finally {
      Object.defineProperty(Controller, "linearService", original)
      issuePanel.dispose()
      startWork.dispose()
    }
  })

  test("deactivating the tree preserves its existing panel and local draft", async () => {
    const ctx = context()
    const current = view(ctx, "a")
    const originalOpen = IssueWebview.prototype.open
    const panels: IssueWebview[] = []
    IssueWebview.prototype.open = async function () {
      panels.push(this)
      return {} as never
    }
    try {
      const issue = current.service.toTreeIssue(await current.service.getIssue("issue-a"))
      await current.openIssue(issue)
      await panels[0].onMessageReceived({
        type: "setIssueDescriptionDraft",
        issueId: issue.id,
        value: "Unsaved draft",
      })
      current.deactivate()
      await current.openIssue(issue)
      assert.strictEqual(panels[0], panels[1])
      const stored = JSON.stringify(ctx.globalState.keys().map((key) => ctx.globalState.get(key)))
      assert.match(stored, /Unsaved draft/)
    } finally {
      IssueWebview.prototype.open = originalOpen
    }
  })
})
