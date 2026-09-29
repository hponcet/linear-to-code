import { User } from "@linear/sdk"
import { Commands, Views } from "src/constants"
import { Controller } from "src/controller"
import { ensureCursorEnvironment } from "src/cursor/detectCursorEnvironment"
import { launchCursorAgentForIssue } from "src/cursor/launchCursorAgentForIssue"
import { linearWorkspaces, workspaceChanges } from "src/linear/auth"
import {
  restoreNavigationFilters,
  NavigationFilters,
  NavigationMetadata,
  newIssueDraft,
  normalizeNavigationFilters,
} from "src/linear/navigation"
import { filterWorkflowStatesByType } from "src/panels/commons/worflowStates"
import { CreateIssueWebview } from "src/panels/CreateIssueWebview"
import { IssueWebview } from "src/panels/IssueWebview"
import { SettingsWebview, SettingsTab } from "src/panels/SettingsWebview"
import { StartWorkWebview } from "src/panels/StartWorkWebview"
import { IssueSyncPayload } from "src/types/IssueSync"
import { WorkflowStateWithStateProgress } from "src/types/Linear"
import { Stores } from "src/utils/Stores"
import {
  buildUserAvatarIconCacheForContext,
  UNASSIGNED_ASSIGNEE_ID,
} from "src/utils/userAvatarIcon"
import { SettingsVscState, VscStateKeys } from "src/vscStates"
import {
  ProviderResult,
  TreeDataProvider,
  TreeItem,
  window,
  EventEmitter,
  TreeDragAndDropController,
  DataTransfer,
  ExtensionContext,
  ViewColumn,
  commands,
  Disposable,
  Uri,
  workspace,
  TreeItemCollapsibleState,
  QuickPickItem,
} from "vscode"

import {
  registerDropProvider,
  registerLinearIssueContentProvider,
  handleTreeDrag,
} from "./dragAndDrop"
import { createTeamTreeItem, createWorkflowStateTreeItem, createIssueTreeItem } from "./treeItems"
import {
  Team,
  WorkflowState,
  Issue,
  MIME_TYPE_ISSUE,
  DEFAULT_AUTO_REFRESH_INTERVAL_SECONDS,
} from "./types"

import { getDefaultWorkflowStateExpanded, TreeViewExpansionState } from "../treeViewExpansionState"

type TreeElement = Team | WorkflowState | Issue

type IssueQuickPickItem = QuickPickItem & { issueId: Issue["id"] }

export class MyIssuesView
  implements TreeDataProvider<TreeElement>, TreeDragAndDropController<TreeElement>
{
  dropMimeTypes = [MIME_TYPE_ISSUE]
  dragMimeTypes = [MIME_TYPE_ISSUE, "text/uri-list"]

  #onDidChangeTreeData = new EventEmitter<void>()
  onDidChangeTreeData = this.#onDidChangeTreeData.event

  #treeItems = new Map<string, TreeItem>()

  #context: ExtensionContext
  protected issuesStore: ReturnType<Stores["issuesStore"]>

  #me: User | null = null
  #teams: Record<string, Team> = {}
  #workflowStatesByTeam: Record<string, Record<string, WorkflowState>> = {}
  #myIssues: Map<string, Issue> = new Map()
  #assigneeIconByUserId: Map<string, Uri> = new Map()
  #assigneeByUserId: Map<string, User> = new Map()
  filters: NavigationFilters
  metadata: NavigationMetadata | undefined
  error: string | undefined
  private active = false
  private generation = 0
  private metadataGeneration = 0

  get service() {
    return linearWorkspaces.service(this.workspaceId)
  }
  get connection() {
    return this.workspaceInfo
  }
  private workspaceInfo: ReturnType<typeof linearWorkspaces.get>

  #issuesWebviews: Map<string, IssueWebview> = new Map()
  #startWorkWebviews: Map<string, StartWorkWebview> = new Map()
  #settingsWebview: SettingsWebview | undefined
  #createIssueWebview: CreateIssueWebview | undefined

  #autoRefreshInterval: NodeJS.Timeout | null = null
  #windowFocused = true

  #disposables: Disposable[] = []

  #treeView: ReturnType<typeof window.createTreeView<TreeElement>> | null = null

  // One tree view for every workspace: disposing and recreating it on workspace switches races
  // the workbench, which then calls into an unregistered tree (NoTreeViewError).
  static #sharedTreeView: ReturnType<typeof window.createTreeView<TreeElement>> | undefined
  static #activeView: MyIssuesView | undefined
  static #treeChanges = new EventEmitter<void>()

  static #showInTree(view: MyIssuesView) {
    MyIssuesView.#activeView = view
    MyIssuesView.#treeChanges.fire()
    MyIssuesView.#sharedTreeView ??= window.createTreeView<TreeElement>(Views.myIssues, {
      treeDataProvider: {
        onDidChangeTreeData: MyIssuesView.#treeChanges.event,
        getChildren: (element) => MyIssuesView.#activeView?.getChildren(element) ?? [],
        getTreeItem: (element) =>
          MyIssuesView.#activeView?.getTreeItem(element) ?? new TreeItem(""),
      },
      dragAndDropController: {
        dropMimeTypes: view.dropMimeTypes,
        dragMimeTypes: view.dragMimeTypes,
        handleDrag: async (source, dataTransfer) =>
          await MyIssuesView.#activeView?.handleDrag([...source], dataTransfer),
        handleDrop: async (target, sources) =>
          await MyIssuesView.#activeView?.handleDrop(target, sources),
      },
      showCollapseAll: true,
      canSelectMany: true,
    })
    return MyIssuesView.#sharedTreeView
  }

  static disposeTreeView() {
    MyIssuesView.#sharedTreeView?.dispose()
    MyIssuesView.#sharedTreeView = undefined
    MyIssuesView.#activeView = undefined
  }

  constructor(
    context: ExtensionContext,
    public readonly workspaceId: string,
  ) {
    this.#context = context
    this.workspaceInfo = linearWorkspaces.get(workspaceId)
    this.filters = restoreNavigationFilters(
      context.workspaceState.get(`linearToCode.navigation.${workspaceId}`),
    )
    this.issuesStore = new Stores(context).issuesStore()
  }

  // ============================================================
  // Initialization
  // ============================================================

  private viewForIssue(issue: Issue): MyIssuesView {
    return issue.workspaceId && issue.workspaceId !== this.workspaceId
      ? Controller.issueViewerFor(issue.workspaceId)
      : this
  }

  public async initialize(): Promise<void> {
    this.active = true
    this._startAutoRefresh()

    const focusDisposable = window.onDidChangeWindowState((state) => {
      this.#windowFocused = state.focused
      if (state.focused) {
        this._refreshIssues()
      }
    })
    this.#disposables.push(focusDisposable)

    const configDisposable = workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("linearToCode.autoRefreshIntervalSeconds")) {
        this._restartAutoRefresh()
      }
    })
    this.#disposables.push(configDisposable)

    this.#treeView = MyIssuesView.#showInTree(this)
    this.#disposables.push(this.#onDidChangeTreeData.event(() => MyIssuesView.#treeChanges.fire()))
    this.#bindTreeExpansionState()

    // Register drag & drop providers
    const dragDropHandlers = {
      openIssue: this.openIssue.bind(this),
      getIssue: (issueId: string) => this.#myIssues.get(issueId),
    }

    const dropProvider = registerDropProvider(dragDropHandlers)
    const contentProvider = registerLinearIssueContentProvider(dragDropHandlers)

    // Register commands
    const disposableCommands = [
      commands.registerCommand(Commands.openIssue, (issue: Issue) =>
        this.viewForIssue(issue).openIssue(issue),
      ),
      commands.registerCommand(
        Commands.openIssueExternal,
        async (issueIdentifier: Issue["identifier"] | Issue) =>
          await (
            typeof issueIdentifier === "string" ? this : this.viewForIssue(issueIdentifier)
          ).openIssueExternal(issueIdentifier),
      ),
      commands.registerCommand(Commands.openCurrentBranchIssue, () =>
        this.openCurrentBranchIssue(),
      ),
      commands.registerCommand(Commands.startWork, (issue: Issue) =>
        this.viewForIssue(issue).startWork(issue),
      ),
      commands.registerCommand(Commands.startWorkWithAgent, (issue: Issue) =>
        this.viewForIssue(issue).startWorkWithAgent(issue),
      ),
      commands.registerCommand(Commands.configureBranch, (issue: Issue) =>
        this.viewForIssue(issue).startWork(issue),
      ),
      commands.registerCommand(Commands.checkoutIssue, (issue: Issue) =>
        this.viewForIssue(issue).checkoutToIssueBranch(issue.id),
      ),
      commands.registerCommand(Commands.refresh, () => this.refresh()),
      commands.registerCommand(Commands.searchIssues, () => this.searchIssues()),
      commands.registerCommand(Commands.createIssue, () => this.createIssue()),
      commands.registerCommand(Commands.openPullRequest, (issue: Issue) =>
        this.viewForIssue(issue).openPullRequestForIssue(issue),
      ),
      commands.registerCommand(Commands.openSettings, (issue: Issue) =>
        this.viewForIssue(issue).openSettings(issue),
      ),
      commands.registerCommand(Commands.openSettingsTab, (tab: SettingsTab) =>
        this.openSettingsTab(tab),
      ),
      dropProvider,
      contentProvider,
    ]

    this.#disposables.push(...disposableCommands)

    await this.fetchDatas()
  }

  // ============================================================
  // Data Fetching
  // ============================================================

  public async fetchDatas() {
    const generation = ++this.metadataGeneration
    await window.withProgress({ location: { viewId: Views.myIssues } }, async () => {
      try {
        const [me, teams, states, metadata] = await Promise.all([
          this.service.getViewer(),
          this.service.getTeams(),
          this.service.getWorkflowStatesByTeam(),
          this.service.getNavigationMetadata(),
        ])
        if (!this.active || generation !== this.metadataGeneration) return
        this.#me = me
        this.#teams = teams
        this.#workflowStatesByTeam = states
        this.metadata = metadata
        await this.setFilters(this.filters)
      } catch (error) {
        if (this.active && generation === this.metadataGeneration) this.showFetchError(error)
      }
    })
  }

  public async setFilters(filters: NavigationFilters) {
    this.generation += 1
    const next = this.metadata ? normalizeNavigationFilters(filters, this.metadata) : filters
    if (JSON.stringify(next) !== JSON.stringify(this.filters)) {
      this.#myIssues.clear()
      this.#treeItems.clear()
      this.#onDidChangeTreeData.fire()
    }
    this.filters = next
    await this.#context.workspaceState.update(
      `linearToCode.navigation.${this.workspaceId}`,
      this.filters,
    )
    this.service.invalidateIssueLists()
    await this._refreshIssues()
    workspaceChanges.fire()
  }

  private showFetchError(error: unknown) {
    this.error = error instanceof Error ? error.message : String(error)
    if (this.#treeView) this.#treeView.message = `Unable to load Linear issues. ${this.error}`
    workspaceChanges.fire()
  }

  private async _resolveAssigneeUsers(issues: Issue[]): Promise<User[]> {
    const workspaceUsers = await this.service.getWorkspaceUsers()
    const usersById = new Map(workspaceUsers.map((user) => [user.id, user]))

    if (this.#me?.id) {
      usersById.set(this.#me.id, this.#me)
    }

    const missingAssigneeIds = [
      ...new Set(
        issues
          .map((issue) => issue.assigneeId)
          .filter((assigneeId): assigneeId is string => !!assigneeId && !usersById.has(assigneeId)),
      ),
    ]

    const issueByAssigneeId = new Map<string, Issue>()
    for (const issue of issues) {
      if (issue.assigneeId && !issueByAssigneeId.has(issue.assigneeId)) {
        issueByAssigneeId.set(issue.assigneeId, issue)
      }
    }

    await Promise.all(
      missingAssigneeIds.map(async (assigneeId) => {
        const issue = issueByAssigneeId.get(assigneeId)
        if (!issue) {
          return
        }

        try {
          const assignee = await issue.assignee
          if (assignee) {
            usersById.set(assigneeId, assignee)
          }
        } catch {
          // Fall back to the unassigned icon when assignee details cannot be loaded.
        }
      }),
    )

    return [...usersById.values()]
  }

  private async _refreshAssigneeIcons(issues: Issue[], generation = this.generation) {
    const users = await this._resolveAssigneeUsers(issues)
    const icons = await buildUserAvatarIconCacheForContext(this.#context, users)
    if (generation !== this.generation) return
    this.#assigneeByUserId = new Map(users.map((user) => [user.id, user]))
    this.#assigneeIconByUserId = icons
  }

  private async _refetchIssue(issueId: Issue["id"]): Promise<Issue | null> {
    try {
      const issue = this.service.toTreeIssue(
        await this.service.getIssue(issueId, { bypassCache: true }),
      )
      this._updateWebviewsIfNeeded(issue)
      this.service.invalidateIssueLists()
      if (this.active) await this._refreshIssues()
      return issue
    } catch (error) {
      window.showErrorMessage(
        `Failed to fetch issue details: ${error instanceof Error ? error.message : String(error)}`,
      )
      return null
    }
  }

  private async _refreshIssues() {
    if (!this.active || !this.metadata) return
    const generation = ++this.generation
    const filters = this.filters
    const preserveIssues = this.#myIssues.size > 0
    const nextIssues = new Map<string, Issue>()
    let after: string | undefined
    await window.withProgress({ location: { viewId: Views.myIssues } }, async () => {
      try {
        do {
          const page = await this.service.getNavigationIssues(filters, after)
          if (!this.active || generation !== this.generation) return
          page.issues.forEach((issue) => {
            Object.assign(issue, { workspaceId: this.workspaceId })
            nextIssues.set(issue.id, issue)
          })
          after = page.nextCursor ?? undefined
          // Keep the current tree intact until its complete replacement is available.
          if (preserveIssues && after) continue
          await this._refreshAssigneeIcons([...nextIssues.values()], generation)
          if (!this.active || generation !== this.generation) return
          this.error = undefined
          this.#myIssues = new Map(nextIssues)
          const updatedIssues = preserveIssues ? nextIssues.values() : page.issues
          for (const issue of updatedIssues) this._updateWebviewsIfNeeded(issue)
          this.#treeItems.clear()
          if (this.#treeView) {
            this.#treeView.title = "Issues"
            this.#treeView.description = `${this.#myIssues.size} ${after ? "loaded · partial list" : "issues"}`
            this.#treeView.message = this.#myIssues.size
              ? undefined
              : "No issues match these filters."
          }
          this.#onDidChangeTreeData.fire()
          workspaceChanges.fire()
        } while (after && this.active && generation === this.generation)
      } catch (error) {
        if (generation === this.generation) this.showFetchError(error)
      }
    })
  }

  public async searchIssues(): Promise<void> {
    const quickPick = window.createQuickPick<IssueQuickPickItem>()
    quickPick.title = "Search Linear issues"
    quickPick.placeholder = "Type at least two characters to search all Linear issues"
    quickPick.matchOnDescription = true

    let requestId = 0
    let timeout: NodeJS.Timeout | undefined
    const disposables: Disposable[] = []

    const search = async (value: string, currentRequestId: number) => {
      quickPick.busy = true

      try {
        const issues = await this.service.searchIssues(value)
        if (currentRequestId === requestId) {
          quickPick.items = issues.map((issue) => ({
            label: issue.identifier,
            description: issue.title,
            issueId: issue.id,
          }))
        }
      } catch (error) {
        if (currentRequestId === requestId) {
          window.showErrorMessage(
            `Failed to search Linear issues: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      } finally {
        if (currentRequestId === requestId) {
          quickPick.busy = false
        }
      }
    }

    disposables.push(
      quickPick.onDidChangeValue((value) => {
        requestId += 1
        clearTimeout(timeout)

        if (value.trim().length < 2) {
          quickPick.items = []
          quickPick.busy = false
          return
        }

        const currentRequestId = requestId
        timeout = setTimeout(() => void search(value, currentRequestId), 200)
      }),
      quickPick.onDidAccept(() => {
        const issueId = quickPick.selectedItems[0]?.issueId
        if (!issueId) {
          return
        }

        quickPick.hide()
        void this.issuesActions.openIssue(issueId)
      }),
      quickPick.onDidHide(() => {
        clearTimeout(timeout)
        disposables.forEach((disposable) => disposable.dispose())
        quickPick.dispose()
      }),
    )

    quickPick.show()
  }

  #getExpansionStorageKey(): string {
    return `linearToCode.myIssuesTreeExpansion.${this.workspaceId}`
  }

  #getExpansionState(): TreeViewExpansionState {
    return new TreeViewExpansionState(this.#context.workspaceState, this.#getExpansionStorageKey())
  }

  #bindTreeExpansionState(): void {
    if (!this.#treeView) {
      return
    }

    this.#disposables.push(
      this.#getExpansionState().bindTreeView(this.#treeView, {
        getElementId: (element) => {
          if (element.__key === "team" || element.__key === "workflowState") {
            return element.id
          }

          return undefined
        },
        getDefaultExpanded: (element) => {
          if (element.__key === "team") {
            return true
          }

          if (element.__key === "workflowState") {
            return getDefaultWorkflowStateExpanded(element.type)
          }

          return false
        },
      }),
    )
  }

  private _updateWebviewsIfNeeded(issue: Issue) {
    const issuePanel = this.#issuesWebviews.get(issue.id)
    const webviewPanel = this.#startWorkWebviews.get(issue.id)

    if (
      issuePanel?.visible &&
      issuePanel?.issue?.updatedAt &&
      issuePanel.issue.updatedAt.getTime() !== issue.updatedAt.getTime()
    ) {
      issuePanel?.updateWebview(issue)
    }

    if (
      webviewPanel?.visible &&
      webviewPanel?.issue?.updatedAt &&
      webviewPanel.issue.updatedAt.getTime() !== issue.updatedAt.getTime()
    ) {
      webviewPanel?.updateWebview(issue)
    }
  }

  private _getAutoRefreshIntervalMs(): number | null {
    const seconds = workspace
      .getConfiguration("linearToCode")
      .get<number>("autoRefreshIntervalSeconds", DEFAULT_AUTO_REFRESH_INTERVAL_SECONDS)

    if (seconds <= 0) {
      return null
    }

    return seconds * 1000
  }

  private _restartAutoRefresh() {
    if (this.#autoRefreshInterval) {
      clearInterval(this.#autoRefreshInterval)
      this.#autoRefreshInterval = null
    }
    this._startAutoRefresh()
  }

  private _startAutoRefresh() {
    if (this.#autoRefreshInterval) {
      return
    }

    const intervalMs = this._getAutoRefreshIntervalMs()
    if (!intervalMs) {
      return
    }

    this.#autoRefreshInterval = setInterval(() => {
      if (this.#windowFocused) {
        this._refreshIssues()
      }
    }, intervalMs)
  }

  // ============================================================
  // Issue Actions
  // ============================================================

  public async openIssue(issue: Issue, viewColumn?: ViewColumn) {
    let webview = this.#issuesWebviews.get(issue.id)
    if (!webview) {
      webview = new IssueWebview(this.#context, this.issuesActions, this.connection)
      this.#issuesWebviews.set(issue.id, webview)
    }
    await webview.open(issue, viewColumn ?? ViewColumn.Active)
  }

  public async openIssueExternal(issueIdentifier: Issue["identifier"] | Issue) {
    const identifier =
      typeof issueIdentifier === "string" ? issueIdentifier : issueIdentifier.identifier

    const organisation = this.connection
    if (organisation?.urlKey) {
      const url = `https://linear.app/${organisation.urlKey}/issue/${identifier}`
      await commands.executeCommand("vscode.open", Uri.parse(url))
    }
  }

  public async openCurrentBranchIssue() {
    const currentBranch = Controller.git.getCurrentBranch()

    if (!currentBranch?.name) {
      window.showWarningMessage("No current branch found")
      return
    }

    // Find the issue that matches the current branch
    const allIssueStates = this.issuesStore.getAll()

    for (const [issueId, issueState] of Object.entries(allIssueStates)) {
      if (issueState.branchInitialized && issueState.branch?.name === currentBranch.name) {
        // Found the issue, try to get it from cache or fetch it
        let issue = this.#myIssues.get(issueId)

        if (!issue) {
          try {
            issue = this.service.toTreeIssue(await this.service.getIssue(issueId))
          } catch {
            window.showErrorMessage("Failed to fetch issue from Linear")
            return
          }
        }

        await this.openIssue(issue)
        return
      }
    }

    window.showInformationMessage(`No Linear issue found for branch "${currentBranch.name}"`)
  }

  public async startWork(issue: Issue, fromCheckout?: true) {
    let webview = this.#startWorkWebviews.get(issue.id)
    if (!webview) {
      webview = new StartWorkWebview(
        this.#context,
        this.issuesActions,
        this.connection,
        fromCheckout,
      )
      this.#startWorkWebviews.set(issue.id, webview)
    }
    await webview.open(issue, ViewColumn.Active)
  }

  public async startWorkWithAgent(issue: Issue) {
    if (!(await ensureCursorEnvironment())) {
      void window.showInformationMessage("Start work with agent is available in Cursor only.")
      return
    }

    await launchCursorAgentForIssue(issue, this.#context, this.connection)
  }

  public async createIssue(): Promise<void> {
    const metadata = this.metadata ?? (await this.service.getNavigationMetadata())
    this.#createIssueWebview ??= new CreateIssueWebview(
      this.#context,
      this.issuesActions,
      this.connection,
    )
    await this.#createIssueWebview.open({}, ViewColumn.Active, {
      teams: metadata.teams,
      draft: newIssueDraft(this.filters, metadata, this.connection.userId),
    })
  }

  public async openSettingsTab(tab: SettingsTab): Promise<void> {
    const issue = this.#myIssues.values().next().value
    if (!this.#settingsWebview) {
      this.#settingsWebview = new SettingsWebview(
        this.#context,
        this.issuesActions,
        this.connection,
      )
    }
    await this.#settingsWebview.open(issue ?? {}, ViewColumn.Active, { tab })
  }

  public async openSettings(
    issue: Issue,
    options?: { tab?: "git" | "workflow" | "agent" },
  ): Promise<void> {
    if (!this.#settingsWebview) {
      this.#settingsWebview = new SettingsWebview(
        this.#context,
        this.issuesActions,
        this.connection,
      )
    }
    await this.#settingsWebview.open(issue, ViewColumn.Active, options)
  }

  public async openPullRequestForIssue(issue: Issue) {
    const issueState = this.issuesStore.get(issue.id)
    if (!issueState?.branchInitialized || !issueState.branch?.name) {
      window.showWarningMessage(`No branch configured for issue ${issue.identifier}.`)
      return
    }

    await Controller.gitProviderService.openPullRequestForIssue(
      {
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
      },
      issueState.branch.name,
    )
  }

  public async checkoutToIssueBranch(issueId: Issue["id"]) {
    await this.#notifyUncommittedChangesIfAny()

    const issueState = this.issuesStore.get(issueId)

    if (issueState.branchInitialized && issueState.branch) {
      if (!this.#isStashBeforeCreateEnabled()) {
        const issue = await this.#getIssueById(issueId)
        if (!issue) return
        await this.startWork(issue)
        return
      }

      try {
        await Controller.git.checkout(issueState.branch)
        return
      } catch (error) {
        await this.issuesStore.set(issueId, {
          branchInitialized: false,
          branch: undefined,
        })
        await this.issuesActions.refetchIssue(issueId)
      }
    }

    const issue = await this.#getIssueById(issueId)

    if (!issue) return

    this.startWork(issue, true)
  }

  #isStashBeforeCreateEnabled(): boolean {
    const branchesSettings =
      this.#context.globalState.get<SettingsVscState>(VscStateKeys.branchesSettings) || {}

    return !!branchesSettings.stashBeforeCreate
  }

  async #notifyUncommittedChangesIfAny(): Promise<void> {
    if (!Controller.git.repositoryActive) {
      return
    }

    try {
      const hasUncommittedChanges = await Controller.git.hasUncommittedChanges()
      if (!hasUncommittedChanges) {
        return
      }

      window.showInformationMessage(
        "You have uncommitted changes in your working directory. Stash them before changing branches, then reapply them after the branch changes.",
      )
    } catch {
      // Ignore git status errors and continue with the checkout flow.
    }
  }

  async #getIssueById(issueId: Issue["id"]): Promise<Issue | undefined> {
    const cachedIssue = this.#myIssues.get(issueId)
    if (cachedIssue) {
      return cachedIssue
    }

    try {
      const issue = this.service.toTreeIssue(await this.service.getIssue(issueId))
      return issue
    } catch {
      window.showErrorMessage("Failed to fetch issue from Linear")
      return undefined
    }
  }

  public changeGitStatus(gitStatus: { repoActive: boolean; apiActive: boolean }) {
    this.#issuesWebviews
      .values()
      .forEach((webview) => webview.postListenerMessage("gitActive", gitStatus))
    this.#startWorkWebviews
      .values()
      .forEach((webview) => webview.postListenerMessage("gitActive", gitStatus))
  }

  public refresh(): Promise<void> {
    this.service.invalidateAll()
    return this.fetchDatas()
  }

  issuesActions = {
    openIssue: async (issueId: Issue["id"]) => {
      if (!issueId) return

      const issue = this.#myIssues.get(issueId)
      if (issue) {
        await this.openIssue(issue)
      } else {
        const issueWithKey = this.service.toTreeIssue(await this.service.getIssue(issueId))
        await this.openIssue(issueWithKey)
      }
    },
    openIssueExternal: this.openIssueExternal.bind(this) as typeof this.openIssueExternal,
    updateIssue: async (issueId: Issue["id"]) => {
      await this._refetchIssue(issueId)
    },
    syncIssue: async (payload: IssueSyncPayload) => {
      await this._refetchIssue(payload.issueId)
    },
    startWork: async (issueId: Issue["id"]) => {
      if (!issueId) return

      const issue = this.#myIssues.get(issueId)
      if (issue) {
        await this.startWork(issue)
      } else {
        const issueWithKey = this.service.toTreeIssue(await this.service.getIssue(issueId))
        await this.startWork(issueWithKey)
      }
    },
    launchCursorAgent: async (issueId: Issue["id"]) => {
      if (!issueId) {
        return
      }

      const issue = this.#myIssues.get(issueId)
      if (issue) {
        await this.startWorkWithAgent(issue)
        return
      }

      const issueWithKey = this.service.toTreeIssue(await this.service.getIssue(issueId))
      await this.startWorkWithAgent(issueWithKey)
    },
    refetchIssue: this._refetchIssue.bind(this) as typeof this._refetchIssue,
    refreshIssues: this._refreshIssues.bind(this) as typeof this._refreshIssues,
    checkoutToIssueBranch: this.checkoutToIssueBranch.bind(
      this,
    ) as typeof this.checkoutToIssueBranch,
    openSettings: async (
      issueId: Issue["id"],
      options?: { tab?: "git" | "workflow" | "agent" },
    ) => {
      if (!issueId) return

      const issue = this.#myIssues.get(issueId)
      if (issue) {
        await this.openSettings(issue, options)
      } else {
        const issueWithKey = this.service.toTreeIssue(await this.service.getIssue(issueId))
        await this.openSettings(issueWithKey, options)
      }
    },
  }

  // ============================================================
  // TreeDataProvider Implementation
  // ============================================================

  public getChildren(element?: TreeElement): ProviderResult<TreeElement[]> {
    if (element?.__key === "team") {
      return this._getWorkflowStatesForTeam(element.id)
    }

    if (element?.__key === "workflowState") {
      return this._getIssuesForState(element.id)
    }

    if (!element) {
      return this._getRootElements() ?? []
    }

    return []
  }

  public getTreeItem(element: TreeElement): TreeItem {
    let item: TreeItem
    const expansionState = this.#getExpansionState()

    if (element.__key === "team") {
      const defaultExpanded = true
      const expanded =
        expansionState.getCollapsibleState(element.id, defaultExpanded) ===
        TreeItemCollapsibleState.Expanded
      item = createTeamTreeItem(element, expanded)
    } else if (element.__key === "workflowState") {
      const issuesCount = this._getIssuesCountForState(element.id)
      const defaultExpanded = getDefaultWorkflowStateExpanded(element.type)
      const expanded =
        expansionState.getCollapsibleState(element.id, defaultExpanded) ===
        TreeItemCollapsibleState.Expanded
      item = createWorkflowStateTreeItem(
        element as unknown as WorkflowStateWithStateProgress,
        issuesCount,
        expanded,
      )
    } else {
      const issueState = this.issuesStore.get(element.id)
      const branchName = issueState?.branchInitialized ? issueState.branch?.name : undefined
      const assigneeUserId = element.assigneeId ?? UNASSIGNED_ASSIGNEE_ID
      const assigneeIconUri =
        this.#assigneeIconByUserId.get(assigneeUserId) ??
        this.#assigneeIconByUserId.get(UNASSIGNED_ASSIGNEE_ID)
      const assigneeEmail = element.assigneeId
        ? this.#assigneeByUserId.get(element.assigneeId)?.email
        : undefined
      item = createIssueTreeItem(element, branchName, assigneeIconUri, assigneeEmail)
    }

    this.#treeItems.set(item.id!, item)
    return item
  }

  private _getRootElements(): Team[] | WorkflowState[] | null {
    const teams = Object.values(this.#teams).filter((team) =>
      Array.from(this.#myIssues.values()).some((issue) => issue.teamId === team.id),
    )

    if (teams.length === 0) {
      return null
    }
    if (teams.length === 1) {
      return this._getWorkflowStatesForTeam(teams[0].id)
    }

    return teams
  }

  private _getWorkflowStatesForTeam(teamId: Team["id"]): WorkflowState[] {
    return filterWorkflowStatesByType(
      Object.values(this.#workflowStatesByTeam[teamId] ?? {}).filter(
        (state) => !this.filters.stateIds.length || this.filters.stateIds.includes(state.id),
      ),
    ) as unknown as WorkflowState[]
  }

  private _getIssuesForState(stateId: WorkflowState["id"]): Issue[] {
    return Array.from(this.#myIssues.values()).filter((issue) => issue.stateId === stateId)
  }

  private _getIssuesCountForState(stateId: WorkflowState["id"]): number {
    return this._getIssuesForState(stateId).length
  }

  // ============================================================
  // TreeDragAndDropController Implementation
  // ============================================================

  public async handleDrag(source: TreeElement[], treeDataTransfer: DataTransfer): Promise<void> {
    handleTreeDrag(source, treeDataTransfer)
  }

  public async handleDrop(target: TreeElement | undefined, sources: DataTransfer): Promise<void> {
    const issues: Issue[] = []

    sources.forEach((value, key) => {
      if (key.toLocaleLowerCase().startsWith(MIME_TYPE_ISSUE.toLowerCase())) {
        issues.push(value.value as Issue)
      }
    })

    await Promise.all(
      issues.map(async (issue) => {
        if (
          !issue ||
          issue.__key !== "issue" ||
          (issue.workspaceId && issue.workspaceId !== this.workspaceId)
        ) {
          return
        }

        if (!target || !["workflowState", "issue"].includes(target.__key)) {
          return
        }

        const targetStateId =
          target.__key === "workflowState"
            ? target.id
            : target.__key === "issue"
              ? target.stateId
              : undefined
        if (!targetStateId) return

        await this.service.updateIssue(issue.id, {
          stateId: targetStateId,
        })

        await this._refetchIssue(issue.id)
      }),
    )
  }

  // ============================================================
  // Dispose
  // ============================================================

  public deactivate() {
    this.active = false
    this.metadataGeneration += 1
    this.generation += 1
    if (this.#autoRefreshInterval) {
      clearInterval(this.#autoRefreshInterval)
      this.#autoRefreshInterval = null
    }

    this.#disposables.forEach((d) => d.dispose())
    this.#disposables = []
    if (this.#treeView && MyIssuesView.#activeView === this) {
      MyIssuesView.#activeView = undefined
      this.#treeView.description = undefined
      this.#treeView.message = undefined
      MyIssuesView.#treeChanges.fire()
    }
    this.#treeView = null
  }

  public dispose() {
    this.deactivate()
    this.#issuesWebviews.forEach((webview) => webview.dispose())
    this.#issuesWebviews.clear()
    this.#startWorkWebviews.forEach((webview) => webview.dispose())
    this.#startWorkWebviews.clear()
    this.#settingsWebview?.dispose()
    this.#settingsWebview = undefined
    this.#createIssueWebview?.dispose()
    this.#createIssueWebview = undefined

    this.#treeItems.clear()
    this.#myIssues.clear()
    this.#assigneeIconByUserId.clear()
    this.#assigneeByUserId.clear()
    this.#workflowStatesByTeam = {}
    this.#teams = {}
    this.#me = null
  }
}
