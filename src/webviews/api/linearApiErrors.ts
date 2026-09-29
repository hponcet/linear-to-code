import { formatLinearError } from "src/linear/formatLinearError"
import { IpcType } from "src/types/ActionMessage"

export type LinearApiErrorContext = {
  operation: IpcType<"req">
}

export type LinearApiErrorHandler = (error: unknown, context: LinearApiErrorContext) => void

const OPERATION_LABELS: Partial<Record<IpcType<"req">, string>> = {
  getIssue: "Failed to load issue",
  openIssue: "Failed to open issue",
  getViewer: "Failed to load user profile",
  getTeam: "Failed to load team",
  getTeamMetadata: "Failed to load team data",
  getProjectLabels: "Failed to load project labels",
  getWorkspaceLabels: "Failed to load workspace labels",
  getWorkspaceUsers: "Failed to load workspace users",
  getPriorities: "Failed to load priorities",
  getComments: "Failed to load comments",
  getSubIssues: "Failed to load sub-issues",
  getAttachments: "Failed to load attachments",
  getIssueHistory: "Failed to load activity",
  linearUpdateIssue: "Failed to update issue",
  createComment: "Failed to create comment",
  updateComment: "Failed to update comment",
  deleteComment: "Failed to delete comment",
  commentResolve: "Failed to resolve comment thread",
  commentUnresolve: "Failed to reopen comment thread",
  createReaction: "Failed to add reaction",
  deleteReaction: "Failed to remove reaction",
  createAttachment: "Failed to add attachment",
  deleteAttachment: "Failed to delete attachment",
  createIssue: "Failed to create issue",
  createSubIssue: "Failed to create sub-issue",
  deleteSubIssue: "Failed to delete issue",
}

let errorHandler: LinearApiErrorHandler | null = null
let lastToastMessage: string | null = null
let lastToastAt = 0

const TOAST_DEDUPE_MS = 3000

export function registerLinearApiErrorHandler(handler: LinearApiErrorHandler | null): void {
  errorHandler = handler
  lastToastMessage = null
  lastToastAt = 0
}

export function getLinearApiErrorMessage(error: unknown, context: LinearApiErrorContext): string {
  const label = OPERATION_LABELS[context.operation] ?? "Request failed"
  const details = formatLinearError(error)

  if (!details || details === label) {
    return label
  }

  return `${label}: ${details}`
}

export function notifyLinearApiError(
  error: unknown,
  context: LinearApiErrorContext,
  options?: { silent?: boolean },
): void {
  if (options?.silent || !errorHandler) {
    return
  }

  const message = getLinearApiErrorMessage(error, context)
  const now = Date.now()

  if (message === lastToastMessage && now - lastToastAt < TOAST_DEDUPE_MS) {
    return
  }

  lastToastMessage = message
  lastToastAt = now
  errorHandler(error, context)
}
