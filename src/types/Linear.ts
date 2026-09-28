import { WorkflowState } from "@linear/sdk"

export type WorkflowStateWithStateProgress = Omit<
  WorkflowState,
  | "_team"
  | "inheritedFrom"
  | "inheritedFromId"
  | "team"
  | "teamId"
  | "issues"
  | "archive"
  | "create"
  | "update"
  | "paginate"
> & {
  stateProgress: number
  stateTypeLength: number
  type: "triage" | "backlog" | "unstarted" | "started" | "completed" | "canceled" | "duplicate"
}
