import * as path from "path"

import { ExtensionContext, Uri } from "vscode"

export enum Icons {
  issue = "issue",
  issueDark = "issue-dark",
  startWork = "startWork",
  startWorkDark = "startWork-dark",
  treeIssue = "treeIssue",
  treeIssueDark = "treeIssue-dark",
  linear = "linear",
  linearDark = "linear-dark",
  backlog = "backlog",
  canceled = "canceled",
  duplicate = "duplicate",
  completed = "completed",
  unstarted = "unstarted",
  started0 = "started0",
  started1 = "started1",
  started2 = "started2",
  started3 = "started3",
  started4 = "started4",
  started5 = "started5",
  started6 = "started6",
  started7 = "started7",
  started8 = "started8",
  started9 = "started9",
  triage = "triage",
}

export class Resources {
  public icons = new Map<string, Uri>()

  constructor(context: ExtensionContext) {
    const imagesPath = path.join("resources", "images")
    const statuesPath = path.join(imagesPath, "statues")

    this.icons.set(
      Icons.issue,
      Uri.file(context.asAbsolutePath(path.join(imagesPath, "issue.png"))),
    )
    this.icons.set(
      Icons.issue,
      Uri.file(context.asAbsolutePath(path.join(imagesPath, "issue_dark.png"))),
    )
    this.icons.set(
      Icons.startWork,
      Uri.file(context.asAbsolutePath(path.join(imagesPath, "start-work_dark.png"))),
    )
    this.icons.set(
      Icons.treeIssue,
      Uri.file(context.asAbsolutePath(path.join(imagesPath, "tree-issue_dark.png"))),
    )
    this.icons.set(
      Icons.linear,
      Uri.file(context.asAbsolutePath(path.join(imagesPath, "linear_dark.png"))),
    )

    this.icons.set(
      Icons.backlog,
      Uri.file(context.asAbsolutePath(path.join(statuesPath, "backlog.png"))),
    )
    this.icons.set(
      Icons.canceled,
      Uri.file(context.asAbsolutePath(path.join(statuesPath, "canceled.png"))),
    )
    this.icons.set(
      Icons.duplicate,
      Uri.file(context.asAbsolutePath(path.join(statuesPath, "duplicate.svg"))),
    )
    this.icons.set(
      Icons.completed,
      Uri.file(context.asAbsolutePath(path.join(statuesPath, "completed.png"))),
    )
    this.icons.set(
      Icons.unstarted,
      Uri.file(context.asAbsolutePath(path.join(statuesPath, "unstarted.png"))),
    )

    this.icons.set(
      Icons.started0,
      Uri.file(context.asAbsolutePath(path.join(statuesPath, "started0.png"))),
    )
    this.icons.set(
      Icons.started1,
      Uri.file(context.asAbsolutePath(path.join(statuesPath, "started1.png"))),
    )
    this.icons.set(
      Icons.started2,
      Uri.file(context.asAbsolutePath(path.join(statuesPath, "started2.png"))),
    )
    this.icons.set(
      Icons.started3,
      Uri.file(context.asAbsolutePath(path.join(statuesPath, "started3.png"))),
    )
    this.icons.set(
      Icons.started4,
      Uri.file(context.asAbsolutePath(path.join(statuesPath, "started4.png"))),
    )
    this.icons.set(
      Icons.started5,
      Uri.file(context.asAbsolutePath(path.join(statuesPath, "started5.png"))),
    )
    this.icons.set(
      Icons.started6,
      Uri.file(context.asAbsolutePath(path.join(statuesPath, "started6.png"))),
    )
    this.icons.set(
      Icons.started7,
      Uri.file(context.asAbsolutePath(path.join(statuesPath, "started7.png"))),
    )
    this.icons.set(
      Icons.started8,
      Uri.file(context.asAbsolutePath(path.join(statuesPath, "started8.png"))),
    )
    this.icons.set(
      Icons.started9,
      Uri.file(context.asAbsolutePath(path.join(statuesPath, "started9.png"))),
    )

    this.icons.set(
      Icons.triage,
      Uri.file(context.asAbsolutePath(path.join(statuesPath, "triage.png"))),
    )

    // Light theme icons
    // this.icons.set(
    //   Icons.startWork,
    //   Uri.file(context.asAbsolutePath(path.join(imagesPath, "start-work.png"))),
    // );
    // this.icons.set(
    //   Icons.treeIssue,
    //   Uri.file(context.asAbsolutePath(path.join(imagesPath, "tree-issue.png"))),
    // );
    // this.icons.set(
    //   Icons.linear,
    //   Uri.file(context.asAbsolutePath(path.join(imagesPath, "linear.png"))),
    // );
  }
}
