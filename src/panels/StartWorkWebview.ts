import { Issue } from "@linear/sdk"
import { Webviews } from "src/constants"
import { Controller } from "src/controller"
import { isCursorEnvironmentReady } from "src/cursor/detectCursorEnvironment"
import { MyIssuesView } from "src/views/myIssues"
import { ExtensionContext, ViewColumn } from "vscode"

import { AbstractIssueWebview } from "./AbstractIssueWebview"

import type { LinearWorkspace } from "src/linear/LinearWorkspaces"

export class StartWorkWebview extends AbstractIssueWebview<"startWork"> {
  #fromCheckout: boolean = false

  constructor(
    context: ExtensionContext,
    issueActions: MyIssuesView["issuesActions"],
    connection: LinearWorkspace,
    fromCheckout?: true,
  ) {
    super(context, issueActions, connection)
    this.#fromCheckout = fromCheckout ?? false
  }

  async open(issue: Issue, column?: ViewColumn) {
    this.issue = issue
    const panel = await super.createOrShow(column)

    panel.iconPath = Controller.resources.icons.get("startWork")

    return panel
  }

  public async getProps() {
    const props = {
      issueId: this.issue?.id || null,
      connection: this.connection,
      fromCheckout: this.#fromCheckout,
      repoInitialized: Controller.git.repositoryActive,
      gitInitialized: Controller.git.apiActive,
      isCursor: isCursorEnvironmentReady(),
    }

    this.#fromCheckout = false

    return props
  }

  public get title(): string {
    return this.issue
      ? `${this.issue.identifier} - ${this.issue.title}` || "Untitled Issue"
      : "Start working on issue..."
  }

  public get viewId(): string {
    return Webviews.startWorkWebview
  }
}
