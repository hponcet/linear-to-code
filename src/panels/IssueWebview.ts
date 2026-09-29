import { Issue } from "@linear/sdk"
import { Webviews } from "src/constants"
import { Controller } from "src/controller"
import { linearWorkspaces } from "src/linear/auth"
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
    if (!this._panel) this.prefetch(issue)
    const panel = await super.createOrShow(column)

    panel.iconPath = Controller.resources.icons.get("issue")

    return panel
  }

  /**
   * Starts the page's first Linear requests while the webview boots. The page asks for the same
   * data and gets it from the service cache, or joins the request in flight.
   */
  private prefetch(issue: Issue) {
    const service = linearWorkspaces.service(this.connection.id)
    const requests: Promise<unknown>[] = [service.getIssue(issue.id)]
    if (issue.teamId) {
      requests.push(service.getTeam(issue.teamId), service.getTeamMetadata(issue.teamId))
    }
    if (issue.projectId) requests.push(service.getProjectLabels(issue.projectId))
    // The page reports the errors of its own requests.
    for (const request of requests) request.catch(() => undefined)
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
