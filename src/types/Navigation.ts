import type { SerializedCycle, SerializedWorkflowState } from "./SerializedLinear"
import type { LinearWorkspace } from "src/linear/LinearWorkspaces"
import type { NavigationMetadata } from "src/linear/navigation"

export type NavigationFilter = {
  id: string
  label: string
  description?: string
} & (
  | { kind: "cycle"; cycle: Pick<SerializedCycle, "isActive" | "isNext"> | null }
  | { kind: "status"; workflowState: SerializedWorkflowState }
  | { kind: "assignee"; user: NavigationMetadata["users"][number] | null }
)

export type NavigationSelector =
  | "workspace"
  | "menu"
  | "team"
  | "project"
  | "view"
  | "filters"
  | "cycle"
  | "status"
  | "assignee"
  | "connect"
  | "reconnect"

export type NavigationSnapshot = {
  workspace?: LinearWorkspace
  team: string
  teamColor?: string
  teamIcon?: string
  project: string
  projectColor?: string
  projectIcon?: string
  view: string
  filters: NavigationFilter[]
  busy: boolean
  error?: string
}
