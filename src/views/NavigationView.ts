import { Commands, UNASSIGNED_ASSIGNEE_ID, Views } from "src/constants"
import { Controller } from "src/controller"
import {
  getActiveWorkspaceId,
  getConnectedWorkspaces,
  linearConnect,
  linearDisconnect,
  switchLinearWorkspace,
  workspaceChanges,
} from "src/linear/auth"
import { getWebviewAssetDirectory, getWebviewContent } from "src/panels/webviewContent"
import { NavigationSelector, NavigationSnapshot } from "src/types/Navigation"
import {
  ExtensionContext,
  commands,
  Disposable,
  QuickPickItem,
  Uri,
  WebviewView,
  WebviewViewProvider,
  window,
} from "vscode"

const SELECTORS: NavigationSelector[] = [
  "workspace",
  "menu",
  "team",
  "project",
  "view",
  "filters",
  "cycle",
  "status",
  "assignee",
  "connect",
  "reconnect",
]

export class NavigationView implements WebviewViewProvider, Disposable {
  private view?: WebviewView
  private busy = false
  private disposables: Disposable[] = []

  constructor(private context: ExtensionContext) {
    this.disposables.push(
      window.registerWebviewViewProvider(Views.navigation, this),
      workspaceChanges.event(() => this.publish()),
      commands.registerCommand(Commands.toggleViewMode, () => this.select("view")),
      commands.registerCommand(Commands.reconnectWorkspace, (id?: string) =>
        linearConnect(context, id ?? getActiveWorkspaceId()),
      ),
    )
  }

  snapshot(): NavigationSnapshot {
    const workspace = getConnectedWorkspaces().find(({ id }) => id === getActiveWorkspaceId())
    const result: NavigationSnapshot = {
      workspace,
      team: "All teams",
      project: "All projects",
      view: "All issues",
      filters: [],
      busy: this.busy,
    }
    if (!workspace) return result
    let viewer
    try {
      viewer = Controller.issueViewer
    } catch {
      return result
    }
    if (viewer.workspaceId !== workspace.id) return result
    const { filters, metadata } = viewer
    const team = metadata?.teams.find(({ id }) => id === filters.teamId)
    result.team = team?.name ?? "All teams"
    result.teamColor = team?.color
    result.teamIcon = team?.icon
    const project = metadata?.projects.find(({ id }) => id === filters.projectId)
    result.project = filters.projectId === null ? "No project" : (project?.name ?? "All projects")
    result.projectColor = project?.color
    result.projectIcon = project?.icon
    result.view = filters.view === "myIssues" ? "My issues" : "All issues"
    result.error = viewer.error
    if (filters.cycle !== "any") {
      const cycle = filters.cycle
      result.filters.push({
        id: "cycle",
        kind: "cycle",
        cycle:
          typeof cycle === "object"
            ? (metadata?.cycles.find(({ id }) => id === cycle.id) ?? null)
            : cycle === "current"
              ? { isActive: true }
              : null,
        label:
          typeof cycle === "object"
            ? (metadata?.cycles.find(({ id }) => id === cycle.id)?.name ?? "Cycle")
            : cycle === "current"
              ? "Current cycle"
              : "No cycle",
      })
    }
    for (const id of filters.stateIds) {
      const state = metadata?.states.find((item) => item.id === id)
      if (state)
        result.filters.push({
          id,
          kind: "status",
          label: state.name,
          workflowState: state,
          description: metadata?.teams.find((team) => team.id === state.teamId)?.name,
        })
    }
    for (const id of filters.assigneeIds) {
      if (id === UNASSIGNED_ASSIGNEE_ID) {
        result.filters.push({
          id: `assignee:${id}`,
          kind: "assignee",
          label: "Unassigned",
          description: "Assignee",
          user: null,
        })
        continue
      }
      const user = metadata?.users.find((item) => item.id === id)
      if (user)
        result.filters.push({
          id: `assignee:${id}`,
          kind: "assignee",
          label: user.name,
          description: `Assignee: ${user.email}`,
          user,
        })
    }
    return result
  }

  resolveWebviewView(view: WebviewView): void {
    this.view = view
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        Uri.joinPath(
          this.context.extensionUri,
          getWebviewAssetDirectory(this.context.extensionMode),
        ),
        Uri.joinPath(this.context.extensionUri, "resources"),
      ],
    }
    view.webview.html = getWebviewContent(this.context, view.webview, "navigation")
    const listener = view.webview.onDidReceiveMessage(async (message) => {
      if (!message || typeof message !== "object") return
      try {
        if (message.type === "getNavigation") {
          await view.webview.postMessage({
            type: "getNavigation_response",
            _ipcReqId: message._ipcReqId,
            payload: this.snapshot(),
          })
        } else if (message.type === "selectNavigation" && SELECTORS.includes(message.selector)) {
          await this.select(message.selector)
          await view.webview.postMessage({
            type: "selectNavigation_response",
            _ipcReqId: message._ipcReqId,
          })
        } else if (
          message.type === "clearNavigationFilter" &&
          typeof message.id === "string" &&
          getActiveWorkspaceId()
        ) {
          const viewer = Controller.issueViewer
          const filters = {
            ...viewer.filters,
            stateIds: viewer.filters.stateIds.filter((id) => id !== message.id),
            assigneeIds: viewer.filters.assigneeIds.filter((id) => `assignee:${id}` !== message.id),
          }
          if (message.id === "cycle") filters.cycle = "any"
          await viewer.setFilters(filters)
          await view.webview.postMessage({
            type: "clearNavigationFilter_response",
            _ipcReqId: message._ipcReqId,
          })
        }
      } catch (error) {
        await view.webview.postMessage({
          type: `${message.type}_error`,
          _ipcReqId: message._ipcReqId,
          error: String(error),
        })
      }
    })
    view.onDidDispose(() => {
      listener.dispose()
      if (this.view === view) this.view = undefined
    })
  }

  private publish() {
    void this.view?.webview.postMessage({ action: "navigationChanged", payload: this.snapshot() })
  }

  async select(selector: NavigationSelector) {
    if (this.busy) return
    this.busy = true
    this.publish()
    try {
      await this.choose(selector)
    } catch (error) {
      void window.showErrorMessage(`Unable to update Linear navigation: ${String(error)}`)
    } finally {
      this.busy = false
      this.publish()
    }
  }

  private async pick<T extends string>(title: string, options: (QuickPickItem & { value: T })[]) {
    return window.showQuickPick(options, {
      title,
      matchOnDescription: true,
      placeHolder: "Type to search",
    })
  }

  private async choose(selector: NavigationSelector): Promise<void> {
    const activeId = getActiveWorkspaceId()
    if (selector === "connect" || selector === "reconnect") {
      await linearConnect(this.context, selector === "reconnect" ? activeId : undefined)
      return
    }
    if (selector === "workspace") {
      const choice = await this.pick("Linear workspace", [
        ...getConnectedWorkspaces().map((item) => ({
          label: item.name,
          description: `${item.urlKey} · ${item.userName}`,
          value: item.id,
          picked: item.id === activeId,
        })),
        { label: "$(add) Connect workspace...", value: "connect" },
      ])
      if (choice?.value === "connect") await linearConnect(this.context)
      else if (choice) await switchLinearWorkspace(choice.value)
      return
    }
    if (selector === "menu") {
      const item = await this.pick("Linear workspace", [
        { label: "Connect workspace...", value: "connect" },
        ...(activeId
          ? [
              { label: "Reconnect", value: "reconnect" },
              { label: "Disconnect workspace", value: "disconnect" },
            ]
          : []),
      ])
      if (item?.value === "disconnect") await linearDisconnect(this.context, activeId)
      else if (item) await this.choose(item.value as NavigationSelector)
      return
    }
    if (!activeId) return this.choose("connect")
    const viewer = Controller.issueViewer
    if (!viewer.metadata) await viewer.fetchDatas()
    const metadata = viewer.metadata
    if (!metadata || activeId !== getActiveWorkspaceId()) return
    const filters = { ...viewer.filters, stateIds: [...viewer.filters.stateIds] }
    const project = metadata.projects.find(({ id }) => id === filters.projectId)
    const teamIds = filters.teamId ? [filters.teamId] : project?.teamIds
    const teamName = (id: string) => metadata.teams.find((t) => t.id === id)?.name ?? id
    const inScope = (teamId: string) => !teamIds || teamIds.includes(teamId)
    if (selector === "filters") {
      const choice = await this.pick("Filter issues", [
        { label: "Cycle", value: "cycle" },
        { label: "Status", value: "status" },
        { label: "Assignees", value: "assignee" },
        { label: "Clear filters", value: "clear" },
      ])
      if (choice?.value === "clear") {
        filters.cycle = "any"
        filters.stateIds = []
        filters.assigneeIds = []
      } else if (choice) return this.choose(choice.value as NavigationSelector)
      else return
    } else if (selector === "team") {
      const choice = await this.pick("Team", [
        { label: "All teams", value: "all" },
        ...metadata.teams.map((item) => ({ label: item.name, value: item.id })),
      ])
      if (!choice) return
      filters.teamId = choice.value === "all" ? undefined : choice.value
    } else if (selector === "project") {
      const choice = await this.pick("Project", [
        { label: "All projects", value: "all" },
        { label: "No project", value: "none" },
        ...metadata.projects
          .filter((item) => !filters.teamId || item.teamIds.includes(filters.teamId))
          .map((item) => ({
            label: item.name,
            value: item.id,
            description: item.teamIds.map(teamName).join(", "),
          })),
      ])
      if (!choice) return
      filters.projectId =
        choice.value === "all" ? undefined : choice.value === "none" ? null : choice.value
    } else if (selector === "view") {
      const choice = await this.pick("Issue view", [
        { label: "All issues", value: "allIssues" },
        { label: "My issues", value: "myIssues" },
      ])
      if (!choice) return
      filters.view = choice.value
      if (filters.view === "myIssues") filters.assigneeIds = []
    } else if (selector === "cycle") {
      const choice = await this.pick("Cycle", [
        { label: "Any cycle", value: "any" },
        { label: "Current cycle", value: "current" },
        { label: "No cycle", value: "none" },
        ...metadata.cycles
          .filter((item) => inScope(item.teamId))
          .map((item) => ({
            label: item.name,
            value: item.id,
            description: teamName(item.teamId),
          })),
      ])
      if (!choice) return
      filters.cycle =
        choice.value === "any" || choice.value === "current" || choice.value === "none"
          ? choice.value
          : { id: choice.value }
    } else if (selector === "status") {
      const choices = await window.showQuickPick(
        metadata.states
          .filter((state) => inScope(state.teamId))
          .map((state) => ({
            label: state.name,
            description: teamName(state.teamId),
            value: state.id,
            picked: filters.stateIds.includes(state.id),
          })),
        {
          title: "Issue statuses",
          canPickMany: true,
          placeHolder: "Select statuses; leave empty for all statuses",
          matchOnDescription: true,
        },
      )
      if (!choices) return
      filters.stateIds = choices.map(({ value }) => value)
    } else if (selector === "assignee") {
      const choices = await window.showQuickPick(
        [
          {
            label: "Unassigned",
            description: "Issues without an assignee",
            value: UNASSIGNED_ASSIGNEE_ID,
            picked: filters.assigneeIds.includes(UNASSIGNED_ASSIGNEE_ID),
          },
          ...metadata.users
            .map((user) => ({
              label: user.name,
              description: user.email,
              value: user.id,
              picked:
                filters.view === "myIssues"
                  ? user.id === viewer.connection?.userId
                  : filters.assigneeIds.includes(user.id),
            }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        ],
        {
          title: "Issue assignees",
          canPickMany: true,
          placeHolder: "Select assignees; leave empty for all assignees (All issues)",
          matchOnDescription: true,
        },
      )
      if (!choices) return
      filters.assigneeIds = choices.map(({ value }) => value)
      filters.view = "allIssues"
    }
    if (activeId === getActiveWorkspaceId()) await viewer.setFilters(filters)
  }

  dispose() {
    this.disposables.forEach((item) => item.dispose())
  }
}
