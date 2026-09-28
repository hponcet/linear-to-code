import { Issue as LIssue, Team as LTeam, WorkflowState as LWorkflowState } from "@linear/sdk"

export const MIME_TYPE_ISSUE = "application/vnd.code.issueViewer.issue"
export const LINEAR_ISSUE_SCHEME = "linear-issue"
/** Default auto-refresh interval: 3 minutes */
export const DEFAULT_AUTO_REFRESH_INTERVAL_SECONDS = 180

/**
 * Adds a discriminant key to an item to identify its type
 */
export function addKeyOnItem<I extends object, K extends "issue" | "team" | "workflowState">(
  item: I,
  key: K,
): I & { __key: K } {
  return Object.assign(item, { __key: key })
}

export type Team = ReturnType<typeof addKeyOnItem<LTeam, "team">>
export type WorkflowState = ReturnType<typeof addKeyOnItem<LWorkflowState, "workflowState">>
export type Issue = ReturnType<typeof addKeyOnItem<LIssue, "issue">> & { workspaceId?: string }
