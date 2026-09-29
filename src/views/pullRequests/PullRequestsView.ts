import { Issue, User } from "@linear/sdk"
import { Commands, Views } from "src/constants"
import { Controller } from "src/controller"
import { ensureCursorEnvironment } from "src/cursor/detectCursorEnvironment"
import { launchCursorAgentForPullRequest } from "src/cursor/launchCursorAgentForPullRequest"
import { PullRequestInfo } from "src/gitProviders/types"
import { getActiveWorkspaceId } from "src/linear/auth"
import { RefType } from "src/types/GitAPI"
import { parseIssueIdentifierFromPullRequest } from "src/utils/parseIssueIdentifier"
import {
  buildUserAvatarIconCacheForContext,
  UNASSIGNED_ASSIGNEE_ID,
} from "src/utils/userAvatarIcon"
import {
  commands,
  Disposable,
  env,
  ExtensionContext,
  ProviderResult,
  TreeDataProvider,
  TreeItem,
  Uri,
  window,
  EventEmitter,
} from "vscode"

import { createMessageTreeItem, createPullRequestTreeItem, toPullRequestItem } from "./treeItems"
import { MessageItem, PullRequestItem, PullRequestTreeNode } from "./types"

import type { LinearService } from "src/linear/LinearService"

export class PullRequestsView implements TreeDataProvider<PullRequestTreeNode> {
  #onDidChangeTreeData = new EventEmitter<void>()
  onDidChangeTreeData = this.#onDidChangeTreeData.event

  #context: ExtensionContext | null = null
  #treeItems = new Map<string, TreeItem>()
  #nodes: PullRequestTreeNode[] = []
  #assigneeIconByUserId = new Map<string, Uri>()
  #loading = false
  #generation = 0
  #disposables: Disposable[] = []

  #treeView: ReturnType<typeof window.createTreeView<PullRequestTreeNode>> | null = null

  public async initialize(context: ExtensionContext): Promise<void> {
    this.#context = context
    this.#treeView = window.createTreeView(Views.pullRequests, {
      treeDataProvider: this,
      showCollapseAll: false,
    })
    this.#disposables.push(this.#treeView)

    const authDisposable = Controller.gitProviderService.onAuthContextChanged(() => {
      void this.refresh()
    })
    this.#disposables.push(authDisposable)

    const visibilityDisposable = this.#treeView.onDidChangeVisibility((event) => {
      if (event.visible) {
        void this.refresh()
      }
    })
    this.#disposables.push(visibilityDisposable)

    const commandDisposables = [
      commands.registerCommand(Commands.refreshPullRequests, () => this.refresh()),
      commands.registerCommand(Commands.openPullRequestDiff, (pullRequest: PullRequestInfo) =>
        this.openPullRequestDiff(pullRequest),
      ),
      commands.registerCommand(
        Commands.openPullRequestLinkedIssue,
        (pullRequest: PullRequestInfo) => this.openPullRequestLinkedIssue(pullRequest),
      ),
      commands.registerCommand(Commands.openPullRequestUrl, (pullRequest: PullRequestInfo) =>
        this.openPullRequestOnWeb(pullRequest),
      ),
      commands.registerCommand(Commands.checkoutPullRequestBranch, (pullRequest: PullRequestInfo) =>
        this.checkoutPullRequestBranch(pullRequest),
      ),
      commands.registerCommand(
        Commands.reviewPullRequestWithAgent,
        (pullRequest: PullRequestInfo) => this.reviewPullRequestWithAgent(pullRequest),
      ),
    ]

    this.#disposables.push(...commandDisposables)
  }

  public refresh(): Promise<void> {
    return this.#fetchPullRequests()
  }

  public changeGitStatus(): void {
    void this.refresh()
  }

  public dispose(): void {
    this.#generation += 1
    this.#disposables.forEach((disposable) => disposable.dispose())
    this.#disposables = []
    this.#treeView = null
    this.#context = null
    this.#treeItems.clear()
    this.#assigneeIconByUserId.clear()
    this.#nodes = []
  }

  getTreeItem(element: PullRequestTreeNode): TreeItem {
    const cached = this.#treeItems.get(
      element.__key === "message" ? element.id : `pull-request:${element.id}`,
    )
    if (cached) {
      return cached
    }

    const item =
      element.__key === "message"
        ? createMessageTreeItem(element)
        : createPullRequestTreeItem(
            element,
            element.linkedAssigneeUserId
              ? (this.#assigneeIconByUserId.get(element.linkedAssigneeUserId) ??
                  this.#assigneeIconByUserId.get(UNASSIGNED_ASSIGNEE_ID))
              : undefined,
          )

    this.#treeItems.set(item.id ?? String(element.id), item)
    return item
  }

  getChildren(element?: PullRequestTreeNode): ProviderResult<PullRequestTreeNode[]> {
    if (element) {
      return []
    }

    if (this.#loading) {
      return [this.#messageNode("Loading pull requests…")]
    }

    return this.#nodes
  }

  async #fetchPullRequests(): Promise<void> {
    const generation = ++this.#generation
    const workspaceId = getActiveWorkspaceId()
    if (!workspaceId) return
    const linearService = Controller.linearService
    this.#loading = true
    this.#treeItems.clear()
    this.#onDidChangeTreeData.fire()

    const result = await Controller.gitProviderService.listOpenPullRequests()

    if (generation !== this.#generation || workspaceId !== getActiveWorkspaceId()) return
    this.#loading = false
    this.#treeItems.clear()

    if (result.error) {
      this.#nodes = [this.#messageNode(result.error)]
      this.#assigneeIconByUserId.clear()
    } else if (result.pullRequests.length === 0) {
      this.#nodes = [this.#messageNode("No open pull requests for this repository.")]
      this.#assigneeIconByUserId.clear()
    } else {
      const nodes = await this.#enrichPullRequestsWithAssigneeIcons(
        result.pullRequests,
        linearService,
        generation,
      )
      if (generation !== this.#generation || workspaceId !== getActiveWorkspaceId()) return
      this.#nodes = nodes
    }

    this.#onDidChangeTreeData.fire()
  }

  async #enrichPullRequestsWithAssigneeIcons(
    pullRequests: PullRequestInfo[],
    linearService: LinearService,
    generation: number,
  ): Promise<PullRequestItem[]> {
    const assigneeIdByIdentifier = new Map<string, string>()
    const linkedIssues: Issue[] = []

    const identifiers = [
      ...new Set(
        pullRequests
          .map((pullRequest) => parseIssueIdentifierFromPullRequest(pullRequest))
          .filter((identifier): identifier is string => !!identifier),
      ),
    ]

    await Promise.all(
      identifiers.map(async (identifier) => {
        try {
          const issue = await linearService.getIssueByIdentifier(identifier)
          if (!issue) {
            return
          }

          linkedIssues.push(issue)
          assigneeIdByIdentifier.set(identifier, issue.assigneeId ?? UNASSIGNED_ASSIGNEE_ID)
        } catch {
          // Keep the default pull request icon when the linked issue cannot be resolved.
        }
      }),
    )

    if (this.#context && linkedIssues.length > 0) {
      const assigneeUsers = await this.#resolveAssigneeUsers(linkedIssues, linearService)
      const icons = await buildUserAvatarIconCacheForContext(this.#context, assigneeUsers)
      if (generation === this.#generation) this.#assigneeIconByUserId = icons
    } else if (generation === this.#generation) {
      this.#assigneeIconByUserId.clear()
    }

    return pullRequests.map((pullRequest) => {
      const item = toPullRequestItem(pullRequest)
      const identifier = parseIssueIdentifierFromPullRequest(pullRequest)
      const linkedAssigneeUserId = identifier ? assigneeIdByIdentifier.get(identifier) : undefined

      return identifier
        ? {
            ...item,
            linkedIssueIdentifier: identifier,
            ...(linkedAssigneeUserId ? { linkedAssigneeUserId } : {}),
          }
        : item
    })
  }

  async #resolveAssigneeUsers(issues: Issue[], linearService: LinearService): Promise<User[]> {
    const workspaceUsers = await linearService.getWorkspaceUsers()
    const usersById = new Map(workspaceUsers.map((user) => [user.id, user]))

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

  #messageNode(message: string): MessageItem {
    return {
      __key: "message",
      id: `message:${message}`,
      message,
    }
  }

  private async reviewPullRequestWithAgent(pullRequest: PullRequestInfo): Promise<void> {
    const connection = Controller.issueViewer.connection
    if (!(await ensureCursorEnvironment())) {
      void window.showInformationMessage("Review with agent is available in Cursor only.")
      return
    }

    if (!this.#context) {
      window.showErrorMessage("Linear to Code is not initialized.")
      return
    }

    try {
      await launchCursorAgentForPullRequest(pullRequest, this.#context, connection)
    } catch (error) {
      window.showErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to open Cursor agent for pull request review.",
      )
    }
  }

  private async openPullRequestDiff(pullRequest: PullRequestInfo): Promise<void> {
    const sourceBranch = pullRequest.sourceBranch?.trim()
    const targetBranch = pullRequest.targetBranch?.trim()

    if (!sourceBranch || !targetBranch) {
      window.showErrorMessage("This pull request is missing source or target branch information.")
      return
    }

    try {
      await Controller.git.openPullRequestMultiDiff({
        sourceBranch,
        targetBranch,
        title: pullRequest.title?.trim() || `#${pullRequest.id}`,
      })
    } catch (error) {
      window.showErrorMessage(
        error instanceof Error ? error.message : "Failed to open pull request diff.",
      )
    }
  }

  private async openPullRequestLinkedIssue(pullRequest: PullRequestInfo): Promise<void> {
    const issueIdentifier = parseIssueIdentifierFromPullRequest(pullRequest)
    if (!issueIdentifier) {
      window.showInformationMessage("No Linear issue identifier was found for this pull request.")
      return
    }

    try {
      const viewer = Controller.issueViewer
      const issue = await viewer.service.getIssueByIdentifier(issueIdentifier)
      if (!issue) {
        window.showInformationMessage(`Linear issue ${issueIdentifier} was not found.`)
        return
      }

      await viewer.openIssue(viewer.service.toTreeIssue(issue))
    } catch (error) {
      window.showErrorMessage(
        error instanceof Error ? error.message : `Failed to open Linear issue ${issueIdentifier}.`,
      )
    }
  }

  private async openPullRequestOnWeb(pullRequest: PullRequestInfo): Promise<void> {
    if (!pullRequest.url) {
      window.showErrorMessage("This pull request does not include a web URL.")
      return
    }

    await env.openExternal(Uri.parse(pullRequest.url))
  }

  private async checkoutPullRequestBranch(pullRequest: PullRequestInfo): Promise<void> {
    const branchName = pullRequest.sourceBranch?.trim()
    if (!branchName) {
      window.showErrorMessage("This pull request does not include a source branch.")
      return
    }

    try {
      await Controller.git.checkout({ type: RefType.Head, name: branchName })
    } catch (error) {
      window.showErrorMessage(
        error instanceof Error ? error.message : "Failed to switch to pull request branch.",
      )
    }
  }
}
