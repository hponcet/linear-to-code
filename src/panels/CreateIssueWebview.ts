import { Issue } from "@linear/sdk"
import { Webviews } from "src/constants"
import { Controller } from "src/controller"
import { Icons } from "src/resources"
import { Props } from "src/types/ActionMessage"
import { ViewColumn } from "vscode"

import { AbstractIssueWebview } from "./AbstractIssueWebview"

type CreateIssueOptions = Omit<Props["createIssue"], "connection">

export class CreateIssueWebview extends AbstractIssueWebview<"createIssue"> {
  #options: CreateIssueOptions = { teams: [], draft: {} }

  /** Revealing an open form keeps what the user typed; new options only apply to a new panel. */
  async open(_issue: Partial<Issue>, column?: ViewColumn, options?: CreateIssueOptions) {
    if (options) this.#options = options
    const panel = await super.createOrShow(column)

    panel.iconPath = Controller.resources.icons.get(Icons.issue)

    return panel
  }

  public async getProps() {
    return { connection: this.connection, ...this.#options }
  }

  public get title(): string {
    return "New issue"
  }

  public get viewId(): string {
    return Webviews.createIssueWebview
  }
}
