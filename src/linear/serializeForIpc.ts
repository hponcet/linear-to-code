import {
  Attachment,
  Comment,
  Cycle,
  Issue,
  IssueHistory,
  IssueLabel,
  Project,
  ProjectLabel,
  Reaction,
  Team,
  User,
} from "@linear/sdk"
import { WorkflowStateWithStateProgress } from "src/types/Linear"
import {
  SerializedAttachment,
  SerializedComment,
  SerializedCycle,
  SerializedIssue,
  SerializedIssueHistory,
  SerializedIssueLabel,
  SerializedProject,
  SerializedReaction,
  SerializedTeam,
  SerializedTeamMetadata,
  SerializedUser,
  SerializedWorkflowState,
} from "src/types/SerializedLinear"

import { TeamMetadata } from "./teamMetadata"

type DateLike = Date | string

function undefinedIfNull<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined
}

export function toDate(value: DateLike | undefined): Date | undefined {
  if (!value) {
    return undefined
  }
  return value instanceof Date ? value : new Date(value)
}

export function serializeUser(user: User): SerializedUser {
  return {
    id: user.id,
    displayName: user.displayName,
    name: user.name,
    email: user.email,
    avatarUrl: undefinedIfNull(user.avatarUrl),
    avatarBackgroundColor: undefinedIfNull(user.avatarBackgroundColor),
    initials: user.initials,
    active: user.active,
    isMe: user.isMe,
    isMentionable: user.isMentionable,
    profileUrl: user.url,
  }
}

export function serializeTeam(team: Team): SerializedTeam {
  return {
    id: team.id,
    name: team.name,
    key: team.key,
    issueEstimationType: team.issueEstimationType,
    issueEstimationAllowZero: team.issueEstimationAllowZero,
    defaultIssueStateId: team.defaultIssueStateId,
  }
}

function serializePickerLabel(label: {
  id: string
  name: string
  color: string
  parentId?: string | null
}): SerializedIssueLabel {
  const serialized: SerializedIssueLabel = {
    id: label.id,
    name: label.name,
    color: label.color,
  }

  const parentId = undefinedIfNull(label.parentId)
  if (parentId !== undefined) {
    serialized.parentId = parentId
  }

  return serialized
}

export function serializeIssueLabel(label: IssueLabel): SerializedIssueLabel {
  return serializePickerLabel(label)
}

export function serializeProjectLabel(label: ProjectLabel): SerializedIssueLabel {
  return serializePickerLabel(label)
}

export function serializeAssignableLabel(label: {
  id: string
  name: string
  color: string
  parentId?: string | null
}): SerializedIssueLabel {
  return serializePickerLabel(label)
}

export function serializeCycle(cycle: Cycle): SerializedCycle {
  return {
    id: cycle.id,
    name: undefinedIfNull(cycle.name),
    number: cycle.number,
    startsAt: toDate(cycle.startsAt),
    endsAt: toDate(cycle.endsAt),
    isActive: cycle.isActive,
    isNext: cycle.isNext,
  }
}

export function serializeProject(project: Project): SerializedProject {
  return {
    id: project.id,
    name: project.name,
    color: undefinedIfNull(project.color),
    icon: undefinedIfNull(project.icon),
    state: undefinedIfNull(project.state),
  }
}

export function serializeWorkflowState(
  state: WorkflowStateWithStateProgress,
): SerializedWorkflowState {
  return {
    id: state.id,
    name: state.name,
    color: state.color,
    type: state.type,
    position: state.position,
    stateProgress: state.stateProgress,
    stateTypeLength: state.stateTypeLength,
  }
}

export function serializeTeamMetadata(metadata: TeamMetadata): SerializedTeamMetadata {
  return {
    labels: metadata.labels.map(serializeIssueLabel),
    cycles: metadata.cycles.map(serializeCycle),
    workflowStates: metadata.workflowStates.map(serializeWorkflowState),
    projects: metadata.projects.map(serializeProject),
  }
}

export function serializeReaction(reaction: Reaction): SerializedReaction {
  return {
    id: reaction.id,
    emoji: reaction.emoji,
    userId: reaction.userId,
    createdAt: toDate(reaction.createdAt) ?? reaction.createdAt,
    updatedAt: toDate(reaction.updatedAt) ?? reaction.updatedAt,
  }
}

export function serializeIssue(issue: Issue): SerializedIssue {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: undefinedIfNull(issue.description),
    url: issue.url,
    number: issue.number,
    priority: issue.priority,
    priorityLabel: issue.priorityLabel,
    labelIds: issue.labelIds ?? [],
    estimate: undefinedIfNull(issue.estimate),
    branchName: issue.branchName,
    dueDate: undefinedIfNull(issue.dueDate),
    trashed: undefinedIfNull(issue.trashed),
    stateId: issue.stateId ?? "",
    teamId: issue.teamId ?? "",
    cycleId: undefinedIfNull(issue.cycleId),
    projectId: undefinedIfNull(issue.projectId),
    assigneeId: undefinedIfNull(issue.assigneeId),
    parentId: undefinedIfNull(issue.parentId),
    creatorId: undefinedIfNull(issue.creatorId),
    createdAt: toDate(issue.createdAt) ?? issue.createdAt,
    updatedAt: toDate(issue.updatedAt) ?? issue.updatedAt,
    reactions: issue.reactions?.map(serializeReaction) ?? [],
  }
}

function readResolvingCommentId(comment: Comment): string | null {
  if (comment.resolvingCommentId) {
    return comment.resolvingCommentId
  }

  const linkedComment = (comment as unknown as { _resolvingComment?: { id?: string } })
    ._resolvingComment
  return linkedComment?.id ?? null
}

function readResolvingUserId(comment: Comment): string | null {
  if (comment.resolvingUserId) {
    return comment.resolvingUserId
  }

  const linkedUser = (comment as unknown as { _resolvingUser?: { id?: string } })._resolvingUser
  return linkedUser?.id ?? null
}

export function serializeComment(comment: Comment): SerializedComment {
  return {
    id: comment.id,
    body: comment.body,
    issueId: undefinedIfNull(comment.issueId),
    parentId: comment.parentId ?? null,
    userId: undefinedIfNull(comment.userId),
    resolvingCommentId: readResolvingCommentId(comment),
    resolvingUserId: readResolvingUserId(comment),
    resolvedAt: toDate(undefinedIfNull(comment.resolvedAt)),
    createdAt: toDate(comment.createdAt) ?? comment.createdAt,
    updatedAt: toDate(comment.updatedAt) ?? comment.updatedAt,
    reactions: comment.reactions?.map(serializeReaction) ?? [],
  }
}

export function serializeAttachment(attachment: Attachment): SerializedAttachment {
  return {
    id: attachment.id,
    title: attachment.title,
    url: attachment.url,
    subtitle: undefinedIfNull(attachment.subtitle),
    metadata: attachment.metadata as Record<string, unknown> | undefined,
    createdAt: toDate(attachment.createdAt) ?? attachment.createdAt,
    updatedAt: toDate(attachment.updatedAt) ?? attachment.updatedAt,
  }
}

const ISSUE_HISTORY_FIELDS = [
  "addedLabelIds",
  "addedLabels",
  "attachmentId",
  "autoArchived",
  "autoClosed",
  "customerNeedId",
  "descriptionUpdatedBy",
  "fromAssigneeId",
  "fromCycleId",
  "fromDueDate",
  "fromEstimate",
  "fromParentId",
  "fromPriority",
  "fromProjectId",
  "fromStateId",
  "fromTeamId",
  "fromTitle",
  "issueImport",
  "relationChanges",
  "removedLabelIds",
  "removedLabels",
  "toAssigneeId",
  "toConvertedProjectId",
  "toCycleId",
  "toDueDate",
  "toEstimate",
  "toParentId",
  "toPriority",
  "toProjectId",
  "toStateId",
  "toTeamId",
  "toTitle",
  "trashed",
  "triageResponsibilityAutoAssigned",
  "triageResponsibilityNotifiedUsers",
  "updatedDescription",
] as const satisfies readonly (keyof IssueHistory)[]

export function serializeIssueHistoryEntry(entry: IssueHistory): SerializedIssueHistory {
  const serialized: Record<string, unknown> = {
    id: entry.id,
    actorId: entry.actorId,
    createdAt: toDate(entry.createdAt) ?? entry.createdAt,
    updatedAt: toDate(entry.updatedAt) ?? entry.updatedAt,
  }

  for (const field of ISSUE_HISTORY_FIELDS) {
    const value = entry[field]
    if (value !== undefined) {
      serialized[field] = value
    }
  }

  if (entry.addedLabels) {
    serialized.addedLabels = entry.addedLabels.map(serializeIssueLabel)
  }

  if (entry.removedLabels) {
    serialized.removedLabels = entry.removedLabels.map(serializeIssueLabel)
  }

  return serialized as SerializedIssueHistory
}

export function serializeIssueHistoryEntries(entries: IssueHistory[]): SerializedIssueHistory[] {
  return entries.map(serializeIssueHistoryEntry)
}
