import { Issue } from "@linear/sdk"
import { Webviews } from "src/constants"
import { Controller } from "src/controller"
import { Icons } from "src/resources"
import { MyIssuesView } from "src/views/myIssues"
import { ExtensionContext, ViewColumn } from "vscode"

import { AbstractIssueWebview } from "./AbstractIssueWebview"

import type { LinearWorkspace } from "src/linear/LinearWorkspaces"

export type SettingsTab = "git" | "workflow" | "agent"

export type OpenSettingsOptions = {
  tab?: SettingsTab
}

export class SettingsWebview extends AbstractIssueWebview<"settings"> {
  #initialTab: SettingsTab | undefined
  #tabRequestId = 0

  constructor(
    context: ExtensionContext,
    issueActions: MyIssuesView["issuesActions"],
    connection: LinearWorkspace,
  ) {
    super(context, issueActions, connection)
  }

  async open(issue: Partial<Issue>, column?: ViewColumn, options?: OpenSettingsOptions) {
    this.issue = issue
    if (options?.tab !== undefined) {
      this.#initialTab = options.tab
      this.#tabRequestId += 1
    }
    const panel = await super.createOrShow(column)

    panel.iconPath = Controller.resources.icons.get(Icons.linear)

    if (this._propsSent) {
      await this.refreshProps()
    }

    return panel
  }

  public async getProps() {
    return {
      issueId: this.issue?.id || null,
      connection: this.connection,
      initialTab: this.#initialTab,
      tabRequestId: this.#tabRequestId,
    }
  }

  public get title(): string {
    return "Settings"
  }

  public get viewId(): string {
    return Webviews.settingsWebview
  }

  public override updateWebview(issue: Partial<Issue>) {
    if (issue) {
      this.issue = issue
    }

    if (this._propsSent) {
      void this.refreshProps()
    }
  }

  private async refreshProps() {
    await this.postListenerMessage("settingsPropsUpdate", await this.getProps())
  }

  public override onVisibilityChange(visible: boolean): void {
    if (visible && this._propsSent) {
      void this.refreshProps()
    }
  }
}
