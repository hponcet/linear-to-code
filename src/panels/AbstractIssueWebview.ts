import { Issue } from "@linear/sdk"
import { Controller } from "src/controller"
import { launchCursorAgentForIssueId } from "src/cursor/launchCursorAgentForIssue"
import { linearWorkspaces, linearConnect } from "src/linear/auth"
import { formatLinearError } from "src/linear/formatLinearError"
import { handleGitProviderIpcMessage } from "src/panels/gitProviderIpcHandlers"
import { handleLinearIpcMessage } from "src/panels/linearIpcHandlers"
import { Ipc, Props } from "src/types/ActionMessage"
import { Stores } from "src/utils/Stores"
import { MyIssuesView } from "src/views/myIssues"
import { ExtensionContext, ViewColumn, WebviewPanel, window } from "vscode"

import { AbstractWebview, ReactWebview } from "./AbstractWebview"

import type { LinearWorkspace } from "src/linear/LinearWorkspaces"

export interface ReactIssueWebview<T extends keyof Props> extends ReactWebview<T> {
  open(issue: Partial<Issue>, column: ViewColumn, ...params: any[]): Promise<WebviewPanel>
}

export abstract class AbstractIssueWebview<T extends keyof Props>
  extends AbstractWebview<T>
  implements ReactIssueWebview<T>
{
  issue: Partial<Issue> | null = null
  protected issueActions: MyIssuesView["issuesActions"]
  protected issuesStore: ReturnType<Stores["issuesStore"]>

  isLoading: boolean = false

  abstract override open(
    issue: Partial<Issue>,
    column: ViewColumn,
    ...params: any[]
  ): Promise<WebviewPanel>

  constructor(
    context: ExtensionContext,
    issueActions: MyIssuesView["issuesActions"],
    protected connection: LinearWorkspace,
  ) {
    super(context)
    this.issueActions = issueActions
    this.issuesStore = new Stores(context).issuesStore()
  }

  override async onMessageReceived<T extends Ipc<"req">["type"]>(
    msg: Ipc<"req", T>,
  ): Promise<boolean> {
    if (await super.onMessageReceived(msg)) {
      return Promise.resolve(true)
    }

    try {
      const linearResult = await handleLinearIpcMessage(
        msg,
        this.issueActions,
        linearWorkspaces.service(this.connection.id),
      )
      if (linearResult.handled) {
        return this.postMessage(msg.type, linearResult.payload, msg)
      }

      const gitProviderResult = await handleGitProviderIpcMessage(
        msg,
        linearWorkspaces.service(this.connection.id),
      )
      if (gitProviderResult.handled) {
        return this.postMessage(msg.type, gitProviderResult.payload, msg)
      }

      switch (msg.type) {
        case "updateIssue": {
          await this.issueActions.updateIssue(msg.issueId)
          return this.postMessage(msg.type, void 0, msg)
        }
        case "syncIssue": {
          await this.issueActions.syncIssue(msg.payload)
          return this.postMessage(msg.type, void 0, msg)
        }
        case "openIssue": {
          await this.issueActions.openIssue(msg.issueId)
          return this.postMessage(msg.type, void 0, msg)
        }
        case "openExternal": {
          if (!this.issue?.identifier) {
            throw new Error("Issue identifier is not available")
          }
          await this.issueActions.openIssueExternal(msg.issueIdentifier || this.issue.identifier)
          return this.postMessage(msg.type, void 0, msg)
        }
        case "startWork": {
          await this.issueActions.startWork(msg.issueId)
          return this.postMessage(msg.type, void 0, msg)
        }
        case "launchCursorAgent": {
          await launchCursorAgentForIssueId(msg.issueId, this._context, this.connection)
          return this.postMessage(msg.type, void 0, msg)
        }
        case "openSettings": {
          if (!this.issue?.id) {
            throw new Error("Issue is not available")
          }
          await this.issueActions.openSettings(this.issue.id, { tab: msg.tab })
          return this.postMessage(msg.type, void 0, msg)
        }
        case "getGitStatus": {
          const gitStatus = Controller.git.getGitStatus()
          return this.postMessage(msg.type, gitStatus, msg)
        }
        case "getAllBranches": {
          const branches = await Controller.git.getBranches({ remote: true })
          return this.postMessage(msg.type, branches, msg)
        }
        case "getCurrentBranch": {
          const branch = Controller.git.getCurrentBranch()
          return this.postMessage(msg.type, branch, msg)
        }
        case "createBranch": {
          const branch = await Controller.git.createBranch(msg.branchName, msg.from, {
            stashChanges: msg.stashChanges,
          })
          return this.postMessage(msg.type, branch, msg)
        }
        case "checkout": {
          await Controller.git.checkout(msg.branch, { stashChanges: msg.stashChanges })
          return this.postMessage(msg.type, void 0, msg)
        }
        case "hasUncommittedChanges": {
          const hasChanges = await Controller.git.hasUncommittedChanges()
          return this.postMessage(msg.type, hasChanges, msg)
        }
      }
    } catch (error) {
      const message = formatLinearError(error)
      if (/authenticat|unauthorized|Linear client is not available|expired/i.test(message)) {
        void window
          .showErrorMessage(`Reconnect ${this.connection.name} to continue.`, "Reconnect")
          .then((choice) => {
            if (choice) void linearConnect(this._context, this.connection.id)
          })
      }
      return this.postMessage(msg.type, message, msg, true)
    }

    return Promise.resolve(false)
  }

  public override updateWebview(issue: Partial<Issue>) {
    if (issue) {
      this.issue = issue
      this._setTitle()
    }

    if (this._propsSent) {
      this.postListenerMessage("updateIssue", issue.updatedAt?.getTime())
    }
  }

  override onVisibilityChange(visible: boolean): void {
    if (visible) {
      this.postListenerMessage("updateIssue", this.issue?.updatedAt?.getTime())
    }
  }
}
