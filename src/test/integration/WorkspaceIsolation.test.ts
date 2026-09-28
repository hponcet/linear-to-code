import * as assert from "assert"

import { commands, ExtensionContext, QuickPickItem, QuickPickOptions, window } from "vscode"

import { Commands, UNASSIGNED_ASSIGNEE_ID } from "../../constants"
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
import { NavigationView } from "../../views/NavigationView"
import { memoryState, workspaceHarness } from "../support/linearWorkspaces"

const metadata: NavigationMetadata = {
  teams: [{ id: "team", name: "Team" }],
  projects: [],
  cycles: [],
  states: [
    {
      id: "todo",
      name: "Todo",
      color: "#888888",
      teamId: "team",
      type: "unstarted",
      position: 0,
      stateProgress: 0,
      stateTypeLength: 1,
    },
  ],
  users: [
    { id: "alice", name: "Alice", email: "alice@example.com" },
    { id: "bob", name: "Bob", email: "bob@example.com" },
  ],
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

  for (const refresh of ["manual", "automatic"]) {
    test(`${refresh} refresh keeps the existing tree until every page is ready`, async () => {
      const current = view(context(), "a")
      const issue = (id: string, title = id) =>
        ({ id, title, teamId: "team", stateId: "todo", __key: "issue" }) as Issue
      const previous = [issue("first", "Before"), issue("later"), issue("removed")]
      Object.assign(current.service, {
        getTeams: async () => ({ team: { id: "team", __key: "team" } }),
        getWorkflowStatesByTeam: async () => ({ team: { todo: state } }),
        getNavigationMetadata: async () => metadata,
        getNavigationIssues: async () => ({ issues: previous }),
      })
      await current.fetchDatas()
      let release!: (page: { issues: Issue[] }) => void
      const pending = new Promise<{ issues: Issue[] }>((resolve) => {
        release = resolve
      })
      let started!: () => void
      const startedPromise = new Promise<void>((resolve) => {
        started = resolve
      })
      Object.assign(current.service, {
        getNavigationIssues: async (_filters: unknown, after?: string) => {
          if (!after) return { issues: [issue("first", "After")], nextCursor: "second" }
          started()
          return pending
        },
      })
      const snapshots: string[][] = []
      const listener = current.onDidChangeTreeData(() => {
        snapshots.push((current.getChildren(state) as Issue[]).map(({ id }) => id))
      })
      try {
        const refreshing =
          refresh === "manual" ? current.refresh() : current.issuesActions.refreshIssues()
        assert.deepStrictEqual(current.getChildren(state), previous)
        await startedPromise
        assert.deepStrictEqual(current.getChildren(state), previous)
        assert.deepStrictEqual(snapshots, [])
        assert.deepStrictEqual(
          (current.getChildren() as WorkflowState[]).map(({ id }) => id),
          ["todo"],
        )
        release({ issues: [issue("later"), issue("new")] })
        await refreshing
        assert.strictEqual(current.error, undefined)
        assert.deepStrictEqual(snapshots, [["first", "later", "new"]])
        assert.strictEqual((current.getChildren(state) as Issue[])[0].title, "After")
      } finally {
        listener.dispose()
      }
    })
  }

  for (const failedPage of ["first", "second"]) {
    test(`preserves the previous list if refresh fails on the ${failedPage} page`, async () => {
      const current = view(context(), "a")
      const previous = [{ id: "existing", stateId: "todo" } as Issue]
      Object.assign(current.service, {
        getNavigationIssues: async () => ({ issues: previous }),
      })
      await current.setFilters(defaultNavigationFilters())
      Object.assign(current.service, {
        getNavigationIssues: async (_filters: unknown, after?: string) => {
          if (failedPage === "first" || after) throw new Error("Refresh unavailable")
          return { issues: [{ id: "new", stateId: "todo" } as Issue], nextCursor: "second" }
        },
      })
      const listener = current.onDidChangeTreeData(() => {
        assert.fail("A failed refresh must not replace the existing tree")
      })
      try {
        await current.issuesActions.refreshIssues()
        assert.deepStrictEqual(current.getChildren(state), previous)
        assert.strictEqual(current.error, "Refresh unavailable")
      } finally {
        listener.dispose()
      }
    })
  }

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
    await view(firstWindow, "b").setFilters({
      ...defaultNavigationFilters(),
      stateIds: ["todo"],
      assigneeIds: ["alice", "bob"],
    })
    await view(secondWindow, "a").setFilters(defaultNavigationFilters())
    assert.strictEqual(view(firstWindow, "a").filters.view, "myIssues")
    assert.deepStrictEqual(view(firstWindow, "b").filters.stateIds, ["todo"])
    assert.deepStrictEqual(view(firstWindow, "b").filters.assigneeIds, ["alice", "bob"])
    assert.deepStrictEqual(view(firstWindow, "a").filters.assigneeIds, [])
    assert.deepStrictEqual(view(secondWindow, "b").filters.assigneeIds, [])
    assert.strictEqual(view(secondWindow, "a").filters.view, "allIssues")
    assert.strictEqual(firstWindow.workspaceState.get(auth.ACTIVE_WORKSPACE_KEY), "a")
    assert.strictEqual(secondWindow.workspaceState.get(auth.ACTIVE_WORKSPACE_KEY), "b")
    assert.strictEqual(h.metadata.get(auth.ACTIVE_WORKSPACE_KEY), undefined)
  })

  test("selects assignees through the native picker without conflicting with My issues", async () => {
    const ctx = context()
    const current = view(ctx, "a")
    current.metadata = {
      ...metadata,
      users: [...metadata.users, { id: "user-a", name: "Me", email: "me@example.com" }],
    }
    current.filters.view = "myIssues"
    Object.assign(current.service, { getNavigationIssues: async () => ({ issues: [] }) })
    const originalViewer = Object.getOwnPropertyDescriptor(Controller, "issueViewer")!
    const originalActiveWorkspace = auth.getActiveWorkspaceId
    const originalQuickPick = window.showQuickPick
    let activeId = "a"
    let answer: string[] | undefined = ["alice", "bob"]
    let menuAnswer = "assignee"
    let items: (QuickPickItem & { value: string })[] = []
    Object.defineProperty(Controller, "issueViewer", { configurable: true, get: () => current })
    Object.assign(auth, { getActiveWorkspaceId: () => activeId })
    window.showQuickPick = (async (
      choices: (QuickPickItem & { value: string })[],
      options: QuickPickOptions,
    ) => {
      if (options.title === "Filter issues")
        return choices.find(({ value }) => value === menuAnswer)
      if (options.title === "Issue view") return choices.find(({ value }) => value === "myIssues")
      assert.strictEqual(options.title, "Issue assignees")
      assert.strictEqual(options.canPickMany, true)
      assert.strictEqual(options.matchOnDescription, true)
      items = choices
      return answer ? choices.filter(({ value }) => answer!.includes(value)) : undefined
    }) as unknown as typeof window.showQuickPick
    // Exercise picker behavior without registering a second native navigation view.
    const navigation: NavigationView = Object.assign(Object.create(NavigationView.prototype), {
      context: ctx,
      busy: false,
      disposables: [],
    })
    try {
      await navigation.select("filters")
      assert.deepStrictEqual(
        items.filter(({ picked }) => picked).map(({ value }) => value),
        ["user-a"],
      )
      assert.deepStrictEqual(current.filters.assigneeIds, ["alice", "bob"])
      assert.strictEqual(current.filters.view, "allIssues")
      assert.deepStrictEqual(navigation.snapshot().filters, [
        {
          id: "assignee:alice",
          kind: "assignee",
          label: "Alice",
          description: "Assignee: alice@example.com",
          user: metadata.users[0],
        },
        {
          id: "assignee:bob",
          kind: "assignee",
          label: "Bob",
          description: "Assignee: bob@example.com",
          user: metadata.users[1],
        },
      ])
      current.filters.cycle = "current"
      current.filters.stateIds = ["todo"]
      const categorized = navigation.snapshot().filters
      assert.deepStrictEqual(
        categorized.map(({ kind }) => kind),
        ["cycle", "status", "assignee", "assignee"],
      )
      assert.ok(categorized[0].kind === "cycle" && categorized[0].cycle?.isActive)
      assert.ok(
        categorized[1].kind === "status" && categorized[1].workflowState.type === "unstarted",
      )
      answer = undefined
      await navigation.select("assignee")
      assert.deepStrictEqual(
        items.filter(({ picked }) => picked).map(({ value }) => value),
        ["alice", "bob"],
      )
      assert.deepStrictEqual(current.filters.assigneeIds, ["alice", "bob"])
      await navigation.select("view")
      assert.strictEqual(current.filters.view, "myIssues")
      assert.deepStrictEqual(current.filters.assigneeIds, [])
      answer = []
      await navigation.select("assignee")
      assert.strictEqual(current.filters.view, "allIssues")
      assert.deepStrictEqual(current.filters.assigneeIds, [])
      answer = ["alice", UNASSIGNED_ASSIGNEE_ID]
      await navigation.select("assignee")
      assert.strictEqual(items[0].value, UNASSIGNED_ASSIGNEE_ID)
      assert.deepStrictEqual(current.filters.assigneeIds, [UNASSIGNED_ASSIGNEE_ID, "alice"])
      assert.deepStrictEqual(
        navigation.snapshot().filters.find(({ id }) => id === `assignee:${UNASSIGNED_ASSIGNEE_ID}`),
        {
          id: `assignee:${UNASSIGNED_ASSIGNEE_ID}`,
          kind: "assignee",
          label: "Unassigned",
          description: "Assignee",
          user: null,
        },
      )
      menuAnswer = "clear"
      await navigation.select("filters")
      assert.deepStrictEqual(current.filters.assigneeIds, [])
      window.showQuickPick = (async () => {
        activeId = "b"
        return [{ value: "alice" }]
      }) as unknown as typeof window.showQuickPick
      await navigation.select("assignee")
      assert.deepStrictEqual(current.filters.assigneeIds, [])
    } finally {
      navigation.dispose()
      window.showQuickPick = originalQuickPick
      Object.assign(auth, { getActiveWorkspaceId: originalActiveWorkspace })
      Object.defineProperty(Controller, "issueViewer", originalViewer)
    }
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
