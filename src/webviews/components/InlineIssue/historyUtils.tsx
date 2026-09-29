/* eslint-disable react/jsx-key */
import { ReactNode } from "react"
import { WorkflowStateWithStateProgress } from "src/types/Linear"
import {
  SerializedCycle,
  SerializedIssueHistory,
  SerializedIssueLabel,
  SerializedProject,
  SerializedUser,
} from "src/types/SerializedLinear"
import { IssueContextValueData } from "src/webviews/contexts/IssueContext"
import { History } from "src/webviews/utils/history"
import moment from "src/webviews/utils/moment"

import { Assignee } from "../Assignee/Assignee"
import { Estimate } from "../EstimatePicker/Estimate"
import { EstimateIcon } from "../EstimatePicker/EstimateIcon"
import { LinkIcon } from "../Icons/LinkIcon"
import { Label } from "../LabelsPicker/Label"
import { LabelIcon } from "../LabelsPicker/LabelIcon"
import { Priority } from "../PriorityPicker/Priority"
import { PriorityIcon } from "../PriorityPicker/PriorityIcon"
import { ProjectCycle } from "../ProjectCyclePicker/ProjectCycle"
import { ProjectCycleIcon } from "../ProjectCyclePicker/ProjectCycleIcon"
import { Project } from "../ProjectPicker/Project"
import { ProjectIcon } from "../ProjectPicker/ProjectIcon"
import { WorkflowState } from "../WorklfowStatePicker/WorkflowState"
import { WorkflowStateIcon } from "../WorklfowStatePicker/WorkflowStateIcon"

const historyFieldsOfInterest = [
  "addedLabels",
  "attachmentId",
  "autoArchived",
  "autoClosed",
  "customerNeedId",
  "descriptionUpdatedBy",
  "updatedDescription",
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
] as const

type PossibleHistoryType = (typeof historyFieldsOfInterest)[number]

export function getHistoryType(key: (typeof historyFieldsOfInterest)[number]): string {
  return key.replace(/^(from|to)/, "")
}

export function getFirstHistoryType(history: History | SerializedIssueHistory): string | null {
  const entry = history as SerializedIssueHistory
  for (const field of historyFieldsOfInterest) {
    if (entry[field as keyof SerializedIssueHistory]) {
      return getHistoryType(field) as PossibleHistoryType
    }
  }
  return null
}

export function getAllHistoryTypes(
  history: History | SerializedIssueHistory,
): PossibleHistoryType[] {
  const entry = history as SerializedIssueHistory
  return historyFieldsOfInterest.filter((field) => {
    if (!!entry[field as keyof SerializedIssueHistory]) {
      return true
    }
    if (field.startsWith("from") || field.startsWith("to")) {
      const correspondingKey = `${
        field.startsWith("from") ? "to" : "from"
      }${field.replace(/^(from|to)/, "")}`
      if (entry[correspondingKey as keyof SerializedIssueHistory] !== undefined) {
        return true
      }
    }
    return false
  })
}

function getResolved(
  activity: History | SerializedIssueHistory,
): SerializedIssueHistory["resolved"] {
  return activity.resolved ?? (activity as SerializedIssueHistory).resolved
}

function getHistoryContent(
  contextValues: IssueContextValueData,
  type: string,
  from: any,
  to: any,
  activity: History | SerializedIssueHistory,
): [ReactNode, ReactNode | null] | null {
  const { users, projects, cycles, priorities, workflowStates, issueEstimations } = contextValues
  const resolved = getResolved(activity)

  switch (type) {
    // 1 value
    case "addedLabels": {
      return [
        <>
          <span>added label(s) </span>
          {(from as SerializedIssueLabel[]).map((label) => (
            <Label inline key={label.id} issueLabel={label} />
          ))}
        </>,
        <LabelIcon size={13} />,
      ]
    }
    case "removedLabels": {
      return [
        <>
          <span>removed label(s) </span>
          {(from as SerializedIssueLabel[]).map((label) => (
            <Label inline key={label.id} issueLabel={label} />
          ))}
        </>,
        <LabelIcon size={13} />,
      ]
    }
    case "attachmentId": {
      return [<span>updated an attachment</span>, <LinkIcon size={13} />]
    }
    case "autoArchived": {
      return [<span>Issue was automatically archived</span>, null]
    }
    case "autoClosed": {
      return [<span>Issue was automatically closed</span>, null]
    }
    case "customerNeedId": {
      return [<span>changed the customer needs</span>, null]
    }
    case "descriptionUpdatedBy":
    case "updatedDescription": {
      return [<span>updated the description</span>, null]
    }
    case "issueImport": {
      return [<span>Issue was imported</span>, null]
    }
    case "relationChanges": {
      return [<span>updated relations</span>, null]
    }

    case "trashed": {
      return [<span>Issue was moved to trash</span>, null]
    }
    case "triageResponsibilityAutoAssigned": {
      return [<span>was automatically assigned as triage responsible</span>, null]
    }
    case "triageResponsibilityNotifiedUsers": {
      return [<span>notified users for triage responsibility</span>, null]
    }

    // 2 values to compare
    case "AssigneeId": {
      const fromUser = resolved?.fromAssignee ?? users.find((user) => user.id === from)
      const toUser = resolved?.toAssignee ?? users.find((user) => user.id === to)

      if (from && !to) {
        return [<span>removed assignee</span>, null]
      } else if (!from && to && toUser) {
        return [
          <span>
            assigned to <Assignee inline="text" user={toUser as SerializedUser} />
          </span>,
          null,
        ]
      } else if (fromUser && toUser) {
        return [
          <span>
            changed assignee from <Assignee inline="text" user={fromUser as SerializedUser} /> to{" "}
            <Assignee inline="text" user={toUser as SerializedUser} />
          </span>,
          null,
        ]
      }
      return null
    }
    case "CycleId": {
      const fromCycle = resolved?.fromCycle ?? cycles.find((c) => c.id === from)
      const toCycle = resolved?.toCycle ?? cycles.find((c) => c.id === to)

      if (fromCycle && !toCycle) {
        return [<span>removed cycle</span>, <ProjectCycleIcon size={13} cycle={null} />]
      } else if (!fromCycle && toCycle) {
        return [
          <span>
            added cycle <ProjectCycle projectCycle={toCycle as SerializedCycle} inline="text" />
          </span>,
          <ProjectCycleIcon size={13} cycle={toCycle as SerializedCycle} />,
        ]
      } else if (fromCycle && toCycle) {
        return [
          <span>
            changed cycle from{" "}
            <ProjectCycle projectCycle={fromCycle as SerializedCycle} inline="text" /> to{" "}
            <ProjectCycle projectCycle={toCycle as SerializedCycle} inline="text" />
          </span>,
          <ProjectCycleIcon size={13} cycle={toCycle as SerializedCycle} />,
        ]
      }
      return null
    }
    case "DueDate": {
      if (from && !to) {
        return [<span>removed due date</span>, null]
      } else if (!from && to) {
        return [<span>added due date {moment(to).format("L")}</span>, null]
      } else {
        return [
          <span>
            changed due date from {moment(from).format("L")} to {moment(to).format("L")}
          </span>,
          null,
        ]
      }
    }
    case "Estimate": {
      const fromEstimate = issueEstimations ? issueEstimations.find((e) => e.value === from) : null
      const toEstimate = issueEstimations ? issueEstimations.find((e) => e.value === to) : null

      if (fromEstimate && !toEstimate) {
        return [<span>removed estimate</span>, <EstimateIcon size={13} estimate={null} />]
      } else if (!fromEstimate && toEstimate) {
        return [
          <span>
            estimated complexity to <Estimate estimate={toEstimate} inline="text" />
          </span>,
          <EstimateIcon size={13} estimate={toEstimate} />,
        ]
      } else if (fromEstimate && toEstimate) {
        return [
          <span>
            {from > to ? "decreased" : "increased"} estimate from{" "}
            <Estimate estimate={fromEstimate} inline="text" /> to{" "}
            <Estimate estimate={toEstimate} inline="text" />
          </span>,
          <EstimateIcon size={13} estimate={toEstimate} />,
        ]
      }
      return null
    }
    case "ParentId": {
      if (from && !to) {
        return [<span>removed parent issue</span>, null]
      } else if (!from && to) {
        return [<span>added parent issue</span>, null]
      } else {
        return [<span>changed parent issue</span>, null]
      }
    }
    case "Priority": {
      const fromPriority =
        resolved?.fromPriority ?? priorities.find((p) => p.priority === (from ?? 0))
      const toPriority = resolved?.toPriority ?? priorities.find((p) => p.priority === (to ?? 0))

      if (fromPriority && !toPriority) {
        return [<span>removed priority</span>, <PriorityIcon size={13} />]
      } else if (!fromPriority && toPriority) {
        return [
          <span>
            added priority <Priority priority={toPriority} inline="text" />
          </span>,
          <PriorityIcon size={13} priority={toPriority} />,
        ]
      } else if (fromPriority && toPriority) {
        return [
          <span>
            changed priority from <Priority priority={fromPriority} inline="text" /> to{" "}
            <Priority priority={toPriority} inline="text" />
          </span>,
          <PriorityIcon size={13} priority={toPriority} />,
        ]
      }
      return null
    }
    case "ProjectId": {
      const fromProject = resolved?.fromProject ?? projects.find((p) => p.id === from)
      const toProject = resolved?.toProject ?? projects.find((p) => p.id === to)

      if (fromProject && !toProject) {
        return [<span>removed project</span>, <ProjectIcon size={13} />]
      } else if (!fromProject && toProject) {
        return [
          <span>
            added project <Project inline="text" project={toProject as SerializedProject} />
          </span>,
          <ProjectIcon size={13} />,
        ]
      } else if (fromProject && toProject) {
        return [
          <span>
            changed project from{" "}
            <Project inline="text" project={fromProject as SerializedProject} /> to{" "}
            <Project inline="text" project={toProject as SerializedProject} />
          </span>,
          <ProjectIcon size={13} />,
        ]
      }
      return null
    }
    case "StateId": {
      const fromState = resolved?.fromState ?? workflowStates.find((s) => s.id === from)
      const toState = resolved?.toState ?? workflowStates.find((s) => s.id === to)

      if (fromState && !toState) {
        return [<span>removed state</span>, null]
      } else if (!fromState && toState) {
        return [
          <span>
            added state{" "}
            <WorkflowState
              workflowState={toState as WorkflowStateWithStateProgress}
              inline="text"
            />
          </span>,
          <WorkflowStateIcon size={13} workflowState={toState as WorkflowStateWithStateProgress} />,
        ]
      } else if (fromState && toState) {
        return [
          <span>
            changed state from{" "}
            <WorkflowState
              workflowState={fromState as WorkflowStateWithStateProgress}
              inline="text"
            />{" "}
            to{" "}
            <WorkflowState
              workflowState={toState as WorkflowStateWithStateProgress}
              inline="text"
            />
          </span>,
          <WorkflowStateIcon size={13} workflowState={toState as WorkflowStateWithStateProgress} />,
        ]
      }
      return null
    }
    case "TeamId": {
      if (from && !to) {
        return [<span>removed team</span>, null]
      } else if (!from && to) {
        return [<span>added team</span>, null]
      } else {
        return [<span>changed team</span>, null]
      }
    }
    case "Title": {
      return [
        <span>
          changed title from &quot;{from}&quot; to &quot;{to}&quot;
        </span>,
        null,
      ]
    }
    case "ConvertedProjectId": {
      const toProject = resolved?.toProject ?? projects.find((p) => p.id === to)

      if (!toProject) {
        return null
      }

      return [
        <span>
          has converted the project to{" "}
          <Project inline="text" project={toProject as SerializedProject} />
        </span>,
        null,
      ]
    }
    default:
      return null
  }
}

export function getActivity(
  contextValues: IssueContextValueData,
  activity: History | SerializedIssueHistory,
): [ReactNode[], ReactNode | null] {
  const activityTypes = getAllHistoryTypes(activity).sort((a, b) =>
    getHistoryType(a).localeCompare(getHistoryType(b)),
  )
  const activitiesCount = activityTypes.reduce(
    (activitiesCount, activityType) => {
      const type = getHistoryType(activityType)
      if (!activitiesCount[type]) {
        activitiesCount[type] = []
      }
      activitiesCount[type].push(activityType)
      return activitiesCount
    },
    {} as Record<string, (typeof historyFieldsOfInterest)[number][]>,
  )

  let icon = null
  const concatContent: ReactNode[] = []
  const entry = activity as SerializedIssueHistory

  Object.entries(activitiesCount).forEach(([type, [from, to]]) => {
    const content = getHistoryContent(
      contextValues,
      type,
      entry[from as keyof SerializedIssueHistory],
      entry[to as keyof SerializedIssueHistory],
      activity,
    )

    if (!content) {
      return
    }
    const [contentNode, iconNode] = content
    if (iconNode) {
      icon = iconNode
    }
    concatContent.push(contentNode)
  })

  return [concatContent, icon]
}
