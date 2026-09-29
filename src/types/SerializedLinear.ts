import { IssuePriorityValue } from "@linear/sdk"

import { WorkflowStateWithStateProgress } from "./Linear"

export type SerializedUser = {
  id: string
  displayName: string
  name: string
  email: string
  avatarUrl?: string
  avatarBackgroundColor?: string
  initials?: string
  active: boolean
  isMe?: boolean
  isMentionable?: boolean
  profileUrl?: string
}

export type SerializedTeam = {
  id: string
  name: string
  key: string
  issueEstimationType?: string
  issueEstimationAllowZero?: boolean
  defaultIssueStateId?: string
}

export type SerializedIssueLabel = {
  id: string
  name: string
  color: string
  parentId?: string
}

export type SerializedCycle = {
  id: string
  name?: string
  number: number
  startsAt?: Date
  endsAt?: Date
  isActive?: boolean
  isNext?: boolean
}

export type SerializedProject = {
  id: string
  name: string
  color?: string
  icon?: string
  state?: string
}

export type SerializedWorkflowState = Pick<
  WorkflowStateWithStateProgress,
  "id" | "name" | "color" | "type" | "position" | "stateProgress" | "stateTypeLength"
>

export type SerializedTeamMetadata = {
  labels: SerializedIssueLabel[]
  cycles: SerializedCycle[]
  workflowStates: SerializedWorkflowState[]
  projects: SerializedProject[]
}

export type SerializedReaction = {
  id: string
  emoji: string
  userId?: string
  createdAt: Date
  updatedAt: Date
}

export type SerializedIssue = {
  id: string
  identifier: string
  title: string
  description?: string
  url: string
  number: number
  priority: number
  priorityLabel: string
  labelIds: string[]
  estimate?: number
  branchName: string
  dueDate?: string
  trashed?: boolean
  stateId: string
  teamId: string
  cycleId?: string
  projectId?: string
  assigneeId?: string
  parentId?: string
  creatorId?: string
  createdAt: Date
  updatedAt: Date
  reactions: SerializedReaction[]
}

export type SerializedComment = {
  id: string
  body: string
  issueId?: string
  parentId?: string | null
  userId?: string
  resolvingCommentId?: string | null
  resolvingUserId?: string | null
  resolvedAt?: Date
  createdAt: Date
  updatedAt: Date
  reactions: SerializedReaction[]
}

export type SerializedAttachment = {
  id: string
  title: string
  url: string
  subtitle?: string
  metadata?: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export type SerializedIssueHistory = {
  id: string
  actorId?: string
  createdAt: Date
  updatedAt: Date
  addedLabelIds?: string[]
  addedLabels?: SerializedIssueLabel[]
  attachmentId?: string
  autoArchived?: boolean
  autoClosed?: boolean
  customerNeedId?: string
  descriptionUpdatedBy?: string
  fromAssigneeId?: string
  fromCycleId?: string
  fromDueDate?: string
  fromEstimate?: number
  fromParentId?: string
  fromPriority?: number
  fromProjectId?: string
  fromStateId?: string
  fromTeamId?: string
  fromTitle?: string
  issueImport?: unknown
  relationChanges?: unknown
  removedLabelIds?: string[]
  removedLabels?: SerializedIssueLabel[]
  toAssigneeId?: string
  toConvertedProjectId?: string
  toCycleId?: string
  toDueDate?: string
  toEstimate?: number
  toParentId?: string
  toPriority?: number
  toProjectId?: string
  toStateId?: string
  toTeamId?: string
  toTitle?: string
  trashed?: boolean
  triageResponsibilityAutoAssigned?: boolean
  triageResponsibilityNotifiedUsers?: unknown
  updatedDescription?: boolean
  resolved?: {
    fromState?: SerializedWorkflowState
    toState?: SerializedWorkflowState
    fromAssignee?: Pick<SerializedUser, "id" | "displayName" | "email" | "name" | "avatarUrl">
    toAssignee?: Pick<SerializedUser, "id" | "displayName" | "email" | "name" | "avatarUrl">
    fromProject?: Pick<SerializedProject, "id" | "name" | "color" | "icon">
    toProject?: Pick<SerializedProject, "id" | "name" | "color" | "icon">
    fromCycle?: Pick<SerializedCycle, "id" | "name" | "number">
    toCycle?: Pick<SerializedCycle, "id" | "name" | "number">
    fromPriority?: IssuePriorityValue
    toPriority?: IssuePriorityValue
  }
}
