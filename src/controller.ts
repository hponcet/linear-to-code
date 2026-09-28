import { ExtensionContext } from "vscode"

import { CommandContext, setCommandContext } from "./commandsContext"
import { isExtensionSession } from "./extensionSession"
import { GitClient } from "./git/GitClient"
import { GitProviderService } from "./gitProviders/GitProviderService"
import { getActiveWorkspaceId, linearWorkspaces } from "./linear/auth"
import { LinearService } from "./linear/LinearService"
import { notifyLinearMcpDefinitionsChanged } from "./mcp/registerLinearMcpServer"
import { Resources } from "./resources"
import { MyIssuesView } from "./views/myIssues"
import { PullRequestsView } from "./views/pullRequests"

export class Controller {
  static resources: Resources
  static git = new GitClient(this.onGitStatusChange.bind(this))
  static get linearService(): LinearService {
    const id = getActiveWorkspaceId()
    if (!id) throw new Error("Connect a Linear workspace first.")
    return linearWorkspaces.service(id)
  }

  private static workspaceViews = new Map<string, MyIssuesView>()
  private static initialized = false
  static gitProviderService: GitProviderService

  static async initialize(context: ExtensionContext, sessionId?: number) {
    if (sessionId !== undefined && !isExtensionSession(sessionId)) {
      return
    }

    const id = getActiveWorkspaceId()
    if (!id) return
    if (!this.initialized) {
      await this.git.init()
      if (sessionId !== undefined && !isExtensionSession(sessionId)) return
      this.gitProviderService = new GitProviderService(context, this.git)
      await this.gitProviderService.initialize()
      if (sessionId !== undefined && !isExtensionSession(sessionId)) return
      this.resources = new Resources(context)
      this._pullRequestsView = new PullRequestsView()
      await this._pullRequestsView.initialize(context)
      if (sessionId !== undefined && !isExtensionSession(sessionId)) return
      this.initialized = true
    }
    this.deactivateWorkspace()
    let view = this.workspaceViews.get(id)
    if (!view) {
      view = new MyIssuesView(context, id)
      this.workspaceViews.set(id, view)
    }
    this._issueViewer = view
    void this._pullRequestsView?.refresh()
    await view.initialize()
  }

  static issueViewerFor(workspaceId: string): MyIssuesView {
    const view = this.workspaceViews.get(workspaceId)
    if (!view)
      throw new Error(
        "The original Linear workspace is no longer available. Reconnect it to continue.",
      )
    return view
  }

  static deactivateWorkspace() {
    this._issueViewer?.deactivate()
    this._issueViewer = undefined
  }

  static onGitStatusChange(gitStatus: { repoActive: boolean; apiActive: boolean }) {
    setCommandContext(CommandContext.gitExtensionLoaded, gitStatus.apiActive)
    this.workspaceViews.forEach((view) => view.changeGitStatus(gitStatus))
    this._pullRequestsView?.changeGitStatus()
    notifyLinearMcpDefinitionsChanged()
  }

  private static _issueViewer: MyIssuesView | undefined
  private static _pullRequestsView: PullRequestsView | undefined

  public static get issueViewer(): MyIssuesView {
    if (!this._issueViewer) {
      throw new Error("Linear to Code is not initialized.")
    }

    return this._issueViewer
  }

  public static dispose() {
    this.workspaceViews.forEach((view) => view.dispose())
    this.workspaceViews.clear()
    this.initialized = false
    this._pullRequestsView?.dispose()
    this._issueViewer = undefined
    this._pullRequestsView = undefined

    this.git.dispose()
  }
}
