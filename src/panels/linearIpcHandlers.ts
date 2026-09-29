import { validateLinearFileUploadRequest } from "src/linear/LinearService"
import {
  serializeAssignableLabel,
  serializeAttachment,
  serializeComment,
  serializeIssue,
  serializeProjectLabel,
  serializeTeam,
  serializeTeamMetadata,
  serializeUser,
} from "src/linear/serializeForIpc"
import { getCanonicalLinearMarkdown } from "src/webviews/components/Editor/linearMarkdown"

import type { LinearService } from "src/linear/LinearService"
import type { Ipc } from "src/types/ActionMessage"
import type { IssueSyncPayload } from "src/types/IssueSync"
import type { MyIssuesView } from "src/views/myIssues"

function requireCanonicalLinearMarkdown(source: string): string {
  const markdown = getCanonicalLinearMarkdown(source)
  if (markdown === undefined) {
    throw new Error("Refusing to save unsupported Linear Markdown")
  }
  return markdown
}

function validateDescription<T extends { description?: unknown }>(fields: T): T {
  return typeof fields.description === "string"
    ? { ...fields, description: requireCanonicalLinearMarkdown(fields.description) }
    : fields
}

function toSyncPayload(issue: {
  id: string
  updatedAt: Date
  stateId?: string
  assigneeId?: string | null
  title?: string
  identifier?: string
  priority?: number
}): IssueSyncPayload {
  return {
    issueId: issue.id,
    updatedAt: issue.updatedAt.getTime(),
    stateId: issue.stateId,
    assigneeId: issue.assigneeId ?? null,
    title: issue.title,
    identifier: issue.identifier,
    priority: issue.priority,
  }
}

export async function handleLinearIpcMessage(
  msg: Ipc<"req">,
  issueActions: MyIssuesView["issuesActions"],
  service: LinearService,
): Promise<{ handled: true; payload: unknown } | { handled: false }> {
  switch (msg.type) {
    case "getIssue": {
      const issue = await service.getIssue(msg.issueId, { bypassCache: msg.bypassCache })
      return { handled: true, payload: serializeIssue(issue) }
    }
    case "getViewer": {
      const viewer = await service.getViewer()
      return { handled: true, payload: serializeUser(viewer) }
    }
    case "getTeam": {
      const team = await service.getTeam(msg.teamId)
      return { handled: true, payload: serializeTeam(team) }
    }
    case "getTeamMetadata": {
      const metadata = await service.getTeamMetadata(msg.teamId)
      return { handled: true, payload: serializeTeamMetadata(metadata) }
    }
    case "getProjectLabels": {
      const labels = await service.getProjectLabels(msg.projectId)
      return { handled: true, payload: labels.map(serializeProjectLabel) }
    }
    case "getWorkspaceLabels": {
      const labels = await service.getWorkspaceLabels()
      return { handled: true, payload: labels.map(serializeAssignableLabel) }
    }
    case "getWorkspaceUsers": {
      const users = await service.getWorkspaceUsers()
      return { handled: true, payload: users.map(serializeUser) }
    }
    case "searchEditorMentions": {
      return { handled: true, payload: await service.searchEditorMentions(msg.query) }
    }
    case "resolveEditorReference": {
      return {
        handled: true,
        payload: await service.resolveEditorReference({ kind: msg.kind, id: msg.id }),
      }
    }
    case "getPriorities": {
      return { handled: true, payload: await service.getPriorities() }
    }
    case "getComments": {
      const comments = await service.getComments(msg.issueId)
      return { handled: true, payload: comments.map(serializeComment) }
    }
    case "getSubIssues": {
      const subIssues = await service.getSubIssues(msg.issueId)
      return { handled: true, payload: subIssues.map(serializeIssue) }
    }
    case "getAttachments": {
      const attachments = await service.getAttachments(msg.issueId, {
        bypassCache: msg.bypassCache,
      })
      return { handled: true, payload: attachments.map(serializeAttachment) }
    }
    case "getIssueHistory": {
      return { handled: true, payload: await service.getIssueHistory(msg) }
    }
    case "linearUpdateIssue": {
      const updatedIssue = await service.updateIssue(msg.issueId, validateDescription(msg.fields))
      await issueActions.syncIssue(toSyncPayload(updatedIssue))
      return { handled: true, payload: serializeIssue(updatedIssue) }
    }
    case "createComment": {
      const { type: _type, _ipcReqId, ...input } = msg
      await service.createComment({ ...input, body: requireCanonicalLinearMarkdown(input.body) })
      return { handled: true, payload: undefined }
    }
    case "updateComment": {
      await service.updateComment(msg.commentId, requireCanonicalLinearMarkdown(msg.body))
      return { handled: true, payload: undefined }
    }
    case "deleteComment": {
      await service.deleteComment(msg.commentId)
      return { handled: true, payload: undefined }
    }
    case "commentResolve": {
      await service.commentResolve(msg.commentId, msg.resolvingCommentId)
      return { handled: true, payload: undefined }
    }
    case "commentUnresolve": {
      await service.commentUnresolve(msg.commentId)
      return { handled: true, payload: undefined }
    }
    case "createReaction": {
      const { type: _type, _ipcReqId, ...input } = msg
      await service.createReaction(input)
      return { handled: true, payload: undefined }
    }
    case "deleteReaction": {
      await service.deleteReaction(msg.reactionId, msg.issueId)
      return { handled: true, payload: undefined }
    }
    case "deleteAttachment": {
      await service.deleteAttachment(msg.attachmentId, msg.issueId)
      return { handled: true, payload: undefined }
    }
    case "createAttachment": {
      const { type: _type, _ipcReqId, ...input } = msg
      await service.createAttachment(input)
      return { handled: true, payload: undefined }
    }
    case "downloadLinearAsset": {
      return { handled: true, payload: await service.downloadLinearAsset(msg.url) }
    }
    case "uploadLinearFile": {
      const { type: _type, _ipcReqId, ...input } = msg
      validateLinearFileUploadRequest(input)
      return { handled: true, payload: await service.uploadLinearFile(input) }
    }
    case "cancelLinearFileUpload": {
      return {
        handled: true,
        payload: { cancelled: service.cancelLinearFileUpload(msg.uploadId) },
      }
    }
    case "createIssue": {
      const createdIssue = await service.createIssue(msg.teamId, validateDescription(msg.fields))
      // Answer before the paginated reload: a slow refresh must not look like a failed create.
      void issueActions.refreshIssues()
      return { handled: true, payload: serializeIssue(createdIssue) }
    }
    case "createSubIssue": {
      const createdIssue = await service.createSubIssue(
        msg.parentId,
        msg.teamId,
        validateDescription(msg.fields),
      )
      await issueActions.refreshIssues()
      return { handled: true, payload: serializeIssue(createdIssue) }
    }
    case "deleteSubIssue": {
      await service.deleteSubIssue(msg.issueId)
      await issueActions.refreshIssues()
      return { handled: true, payload: undefined }
    }
    default:
      return { handled: false }
  }
}
