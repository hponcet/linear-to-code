import { useMemo } from "react"
import {
  SerializedCycle,
  SerializedIssue,
  SerializedProject,
  SerializedWorkflowState,
} from "src/types/SerializedLinear"

import { IssueContextValueData } from "./IssueContext"

import { useAsyncMemo } from "../hooks/useAsyncMemo"
import { useIssuePickerLabels } from "../hooks/useIssuePickerLabels"
import { useLinearApi } from "../hooks/useRequestDataUpdate"
import { createEstimateDataItems, issueEstimationByType } from "../utils/issueEstimateByType"

import type { LinearWorkspace } from "src/linear/LinearWorkspaces"

type IssueFormContextParams = {
  issue: SerializedIssue | null
  connection: LinearWorkspace
  panelActions: ReturnType<typeof useLinearApi>
  updateIssue: IssueContextValueData["update"]["issue"]
}

const emptyHistoryFields = {
  comments: null as IssueContextValueData["comments"],
  commentsLoading: false,
  history: null as IssueContextValueData["history"],
  historyLoading: false,
  subIssues: null as IssueContextValueData["subIssues"],
  subIssuesLoading: false,
  attachments: null as IssueContextValueData["attachments"],
  attachmentsLoading: false,
}

/** Picker options and editor actions for panels that edit issue fields without the activity feed. */
export function useIssueFormContextValue({
  issue,
  connection,
  panelActions,
  updateIssue,
}: IssueFormContextParams): IssueContextValueData {
  const [priorities = [], prioritiesLoading] = useAsyncMemo(async () => {
    return panelActions.getPriorities()
  }, [])

  const { teamMetadata, teamMetadataLoading, issueLabels, issueLabelsLoading, branchPrefixLabels } =
    useIssuePickerLabels({
      issue,
      getTeamMetadata: panelActions.getTeamMetadata,
      getProjectLabels: panelActions.getProjectLabels,
    })

  const projects: SerializedProject[] = teamMetadata?.projects ?? []
  const projectsLoading = teamMetadataLoading
  const cycles: SerializedCycle[] = teamMetadata?.cycles ?? []
  const cyclesLoading = teamMetadataLoading
  const workflowStates: SerializedWorkflowState[] = teamMetadata?.workflowStates ?? []
  const workflowStatesLoading = teamMetadataLoading

  const [loadedTeam, issueEstimationsLoading] = useAsyncMemo(async () => {
    return issue?.teamId ? panelActions.getTeam(issue.teamId) : null
  }, [issue?.teamId])
  const team = loadedTeam?.id === issue?.teamId ? loadedTeam : null
  const issueEstimations = useMemo(() => {
    if (!team?.issueEstimationType || team.issueEstimationType === "notUsed") {
      return null
    }
    return createEstimateDataItems(team.issueEstimationType as keyof typeof issueEstimationByType)
  }, [team])

  const [users = [], usersLoading] = useAsyncMemo(async () => {
    return panelActions.getWorkspaceUsers()
  }, [])

  const rejectAsync = async () => Promise.reject(new Error("Not available in this panel"))

  return useMemo(
    (): IssueContextValueData => ({
      me: null,
      meLoading: false,
      issue: issue!,
      connection,
      team,
      priorities: priorities || [],
      prioritiesLoading,
      issueLabels,
      issueLabelsLoading,
      branchPrefixLabels,
      projects,
      projectsLoading,
      cycles,
      cyclesLoading,
      workflowStates,
      workflowStatesLoading,
      users: users ?? [],
      usersLoading,
      issueEstimations,
      issueEstimationsLoading,
      ...emptyHistoryFields,
      update: {
        issue: updateIssue,
        comments: {
          addComment: rejectAsync,
          updateComment: rejectAsync,
          deleteComment: rejectAsync,
          sendCommentReply: rejectAsync,
          resolveComment: rejectAsync,
          unresolveComment: rejectAsync,
        },
        reactions: {
          addReaction: rejectAsync,
          removeReaction: rejectAsync,
        },
        attachments: {
          delete: rejectAsync,
          create: rejectAsync,
          update: rejectAsync,
        },
        subIssues: {
          createSubIssue: rejectAsync,
          deleteSubIssue: rejectAsync,
        },
        panelActions,
      },
    }),
    [
      issue,
      connection,
      team,
      priorities,
      prioritiesLoading,
      issueLabels,
      issueLabelsLoading,
      branchPrefixLabels,
      projects,
      projectsLoading,
      cycles,
      cyclesLoading,
      workflowStates,
      workflowStatesLoading,
      users,
      usersLoading,
      issueEstimations,
      issueEstimationsLoading,
      panelActions,
    ],
  )
}
