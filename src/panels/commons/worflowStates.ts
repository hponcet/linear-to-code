import { WorkflowState } from "@linear/sdk"
import { WorkflowStateWithStateProgress } from "src/types/Linear"
import { SerializedWorkflowState } from "src/types/SerializedLinear"

const workflowStateTypes = [
  "backlog",
  "unstarted",
  "started",
  "completed",
  "canceled",
  "duplicate",
  "triage",
] as const

export function filterWorkflowStatesByType(
  workflowStates: WorkflowState[],
): WorkflowStateWithStateProgress[] {
  let stateProgress = 0
  let lastType = ""
  return workflowStates
    .sort((a, b) => a.position - b.position)
    .sort(
      (a, b) =>
        workflowStateTypes.indexOf(a.type as (typeof workflowStateTypes)[number]) -
        workflowStateTypes.indexOf(b.type as (typeof workflowStateTypes)[number]),
    )
    .map((state, index, array) => {
      const sameTypeStates = array.filter((s) => s.type === state.type)
      if (state.type !== lastType) {
        lastType = state.type
        stateProgress = 0
      } else {
        stateProgress += 1
      }
      return {
        ...state,
        stateProgress,
        stateTypeLength: sameTypeStates.length,
        type: state.type as (typeof workflowStateTypes)[number],
      }
    })
}

export function getFirstStateOfType(
  workflowStates: Array<WorkflowStateWithStateProgress | SerializedWorkflowState>,
  type: (typeof workflowStateTypes)[number],
): WorkflowStateWithStateProgress | SerializedWorkflowState | null {
  const filteredStates = workflowStates
    .filter((state) => state.type === type)
    .sort((a, b) => a.position - b.position)
  if (filteredStates.length === 0) {
    return null
  }
  return filteredStates[0]
}
