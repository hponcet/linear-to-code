import type { LinearWorkspace } from "src/linear/LinearWorkspaces"

export type NavigationSelector =
  | "workspace"
  | "menu"
  | "team"
  | "project"
  | "view"
  | "filters"
  | "cycle"
  | "status"
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
  filters: { id: string; label: string; color?: string; description?: string }[]
  busy: boolean
  error?: string
}
