import { LinearClient } from "@linear/sdk"
import { ReactNode, useMemo, useState } from "react"
import {
  SerializedCycle,
  SerializedIssue,
  SerializedProject,
  SerializedWorkflowState,
} from "src/types/SerializedLinear"

import { IssueContextReact, IssueContextValueData } from "./IssueContext"

import { Container } from "../components/Container/Container"
import { useAsyncEffect } from "../hooks/useAsyncEffect"
import { useAsyncMemo } from "../hooks/useAsyncMemo"
import { useIssuePickerLabels } from "../hooks/useIssuePickerLabels"
import { useLinearApi, vscApi } from "../hooks/useRequestDataUpdate"
import { createEstimateDataItems, issueEstimationByType } from "../utils/issueEstimateByType"

import type { LinearWorkspace } from "src/linear/LinearWorkspaces"

type StartWorkContextProviderProps = {
  issueId: string
  connection: LinearWorkspace
  isLoading?: boolean
  children: ReactNode
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

export function StartWorkContextProvider(props: StartWorkContextProviderProps) {
  const { children, issueId, connection, isLoading: externalLoading } = props

  const [issue, setIssue] = useState<SerializedIssue | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  async function fetchIssue(updatedAt?: number) {
    if (updatedAt && issue && issue.updatedAt.getTime() >= updatedAt) {
      return
    }

    if (issueId) {
      const fetchedIssue = await vscApi.postMessage({ type: "getIssue", issueId })
      setIssue((fetchedIssue as SerializedIssue) || null)
    }
  }

  const panelActions = useLinearApi({
    updateIssue: fetchIssue,
  })

  useAsyncEffect(async () => {
    setIsLoading(true)
    try {
      await fetchIssue()
    } catch (error) {
      console.error("Failed to load issue:", error)
    } finally {
      setIsLoading(false)
    }
  }, [issueId])

  async function updateIssue(
    id: string,
    updatedFields: Parameters<LinearClient["updateIssue"]>[1],
  ): Promise<SerializedIssue | undefined> {
    try {
      const updatedIssue = (await panelActions.linearUpdateIssue(
        id,
        updatedFields,
      )) as SerializedIssue | void

      if (updatedIssue && id === issueId) {
        setIssue(updatedIssue)
      }

      return updatedIssue || undefined
    } catch (error) {
      console.error("Failed to update issue:", error)
      return undefined
    }
  }

  const [priorities = [], prioritiesLoading] = useAsyncMemo(async () => {
    return panelActions.getPriorities()
  }, [issueId])

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
  }, [issueId, issue?.teamId])
  const team = loadedTeam?.id === issue?.teamId ? loadedTeam : null
  const issueEstimations = useMemo(() => {
    if (!team?.issueEstimationType || team.issueEstimationType === "notUsed") {
      return null
    }
    return createEstimateDataItems(team.issueEstimationType as keyof typeof issueEstimationByType)
  }, [team])

  const [users = [], usersLoading] = useAsyncMemo(async () => {
    return panelActions.getWorkspaceUsers()
  }, [issueId])

  const rejectAsync = async () => Promise.reject(new Error("Not available in Start Work"))

  const context = useMemo(
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

  if (!issue || isLoading || externalLoading) {
    return <Container loading={true} />
  }

  return <IssueContextReact.Provider value={context}>{children}</IssueContextReact.Provider>
}
