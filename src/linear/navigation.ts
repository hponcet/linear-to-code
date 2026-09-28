import { UNASSIGNED_ASSIGNEE_ID } from "src/constants"

import type { LinearClient } from "@linear/sdk"
import type { SerializedUser, SerializedWorkflowState } from "src/types/SerializedLinear"

type IssueFilter = NonNullable<NonNullable<Parameters<LinearClient["issues"]>[0]>["filter"]>

export type NavigationFilters = {
  teamId?: string
  projectId?: string | null
  view: "allIssues" | "myIssues"
  cycle: "any" | "current" | "none" | { id: string }
  stateIds: string[]
  assigneeIds: string[]
}

export function defaultNavigationFilters(): NavigationFilters {
  return { view: "allIssues", cycle: "any", stateIds: [], assigneeIds: [] }
}

/** Restore only recognized values from editor storage, then check access against metadata. */
export function restoreNavigationFilters(value: unknown): NavigationFilters {
  const filters = defaultNavigationFilters()
  if (!value || typeof value !== "object") return filters
  const stored = value as Partial<NavigationFilters>
  if (typeof stored.teamId === "string") filters.teamId = stored.teamId
  if (stored.projectId === null || typeof stored.projectId === "string")
    filters.projectId = stored.projectId
  if (stored.view === "myIssues") filters.view = stored.view
  if (stored.cycle === "current" || stored.cycle === "none") filters.cycle = stored.cycle
  else if (stored.cycle && typeof stored.cycle === "object" && typeof stored.cycle.id === "string")
    filters.cycle = { id: stored.cycle.id }
  if (Array.isArray(stored.stateIds))
    filters.stateIds = [...new Set(stored.stateIds.filter((id) => typeof id === "string"))]
  if (Array.isArray(stored.assigneeIds))
    filters.assigneeIds = [
      ...new Set(stored.assigneeIds.filter((id) => typeof id === "string" && id.length > 0)),
    ]
  return filters
}

export function buildNavigationIssueFilter(
  filters: NavigationFilters,
  userId: string,
): IssueFilter {
  const filter: IssueFilter = {}
  if (filters.teamId) filter.team = { id: { eq: filters.teamId } }
  if (filters.projectId === null) filter.project = { null: true }
  else if (filters.projectId) filter.project = { id: { eq: filters.projectId } }
  if (filters.view === "myIssues") filter.assignee = { id: { eq: userId } }
  else if (filters.assigneeIds.length) {
    const ids = filters.assigneeIds.filter((id) => id !== UNASSIGNED_ASSIGNEE_ID)
    const assigned = { id: { in: ids } }
    filter.assignee = filters.assigneeIds.includes(UNASSIGNED_ASSIGNEE_ID)
      ? ids.length
        ? { or: [{ null: true }, assigned] }
        : { null: true }
      : assigned
  }
  if (filters.stateIds.length) filter.state = { id: { in: filters.stateIds } }
  if (filters.cycle === "current") filter.cycle = { isActive: { eq: true } }
  else if (filters.cycle === "none") filter.cycle = { null: true }
  else if (typeof filters.cycle === "object") filter.cycle = { id: { eq: filters.cycle.id } }
  return filter
}

export type NavigationMetadata = {
  teams: { id: string; name: string; color?: string; icon?: string }[]
  projects: { id: string; name: string; color?: string; icon?: string; teamIds: string[] }[]
  cycles: { id: string; name: string; teamId: string; isActive?: boolean; isNext?: boolean }[]
  states: (SerializedWorkflowState & { teamId: string })[]
  users: Pick<
    SerializedUser,
    "id" | "name" | "email" | "avatarUrl" | "avatarBackgroundColor" | "initials"
  >[]
}

export function normalizeNavigationFilters(
  filters: NavigationFilters,
  metadata: NavigationMetadata,
): NavigationFilters {
  const next = { ...filters }
  if (!metadata.teams.some(({ id }) => id === next.teamId)) next.teamId = undefined
  const project = metadata.projects.find(({ id }) => id === next.projectId)
  if (next.projectId && (!project || (next.teamId && !project.teamIds.includes(next.teamId)))) {
    next.projectId = undefined
  }
  const teamIds = next.teamId ? [next.teamId] : project?.teamIds
  const inScope = (teamId: string) => !teamIds || teamIds.includes(teamId)
  next.stateIds = filters.stateIds.filter((id) =>
    metadata.states.some((s) => s.id === id && inScope(s.teamId)),
  )
  next.assigneeIds =
    filters.view === "myIssues"
      ? []
      : filters.assigneeIds.filter(
          (id) => id === UNASSIGNED_ASSIGNEE_ID || metadata.users.some((user) => user.id === id),
        )
  if (typeof next.cycle === "object") {
    const cycleId = next.cycle.id
    if (!metadata.cycles.some((c) => c.id === cycleId && inScope(c.teamId))) next.cycle = "any"
  }
  return next
}
