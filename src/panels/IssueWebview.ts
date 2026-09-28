import { Issue } from "@linear/sdk"
import { Webviews } from "src/constants"
import { Controller } from "src/controller"
import { MyIssuesView } from "src/views/myIssues"
import { ExtensionContext, ViewColumn } from "vscode"

import { AbstractIssueWebview } from "./AbstractIssueWebview"

import type { LinearWorkspace } from "src/linear/LinearWorkspaces"

export class IssueWebview extends AbstractIssueWebview<"issue"> {
  constructor(
    context: ExtensionContext,
    issueActions: MyIssuesView["issuesActions"],
    connection: LinearWorkspace,
  ) {
    super(context, issueActions, connection)
  }

  async open(issue: Issue, column?: ViewColumn) {
    this.issue = issue
    const panel = await super.createOrShow(column)

    panel.iconPath = Controller.resources.icons.get("issue")

    return panel
  }

  public async getProps() {
    return {
      issueId: this.issue?.id || null,
      connection: this.connection,
    }
  }

  public get title(): string {
    return this.issue
      ? `${this.issue.identifier} - ${this.issue.title}` || "Untitled Issue"
      : "Create new issue"
  }
  public get viewId(): string {
    return Webviews.issueWebview
  }
}
