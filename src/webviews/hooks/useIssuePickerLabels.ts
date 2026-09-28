import { useMemo } from "react"
import {
  SerializedIssue,
  SerializedIssueLabel,
  SerializedTeamMetadata,
} from "src/types/SerializedLinear"

import { useAsyncMemo } from "./useAsyncMemo"

import { mergeLabelsById } from "../utils/prefixByLabelList"

type UseIssuePickerLabelsParams = {
  issue: SerializedIssue | null | undefined
  getTeamMetadata: (teamId: string) => Promise<SerializedTeamMetadata>
  getProjectLabels: (projectId: string) => Promise<SerializedIssueLabel[]>
}

export function resolveIssuePickerLabels(
  teamLabels: SerializedIssueLabel[] = [],
  projectLabels: SerializedIssueLabel[] = [],
) {
  return {
    issueLabels: teamLabels,
    branchPrefixLabels: mergeLabelsById(teamLabels, projectLabels),
  }
}

export function useIssuePickerLabels(params: UseIssuePickerLabelsParams) {
  const { issue, getTeamMetadata, getProjectLabels } = params

  const [teamMetadata, teamMetadataLoading] = useAsyncMemo(async () => {
    if (!issue?.teamId) {
      return null
    }
    return getTeamMetadata(issue.teamId)
  }, [issue?.teamId, getTeamMetadata])

  const [projectLabels] = useAsyncMemo(async () => {
    if (!issue?.projectId) {
      return null
    }
    return getProjectLabels(issue.projectId)
  }, [issue?.projectId, getProjectLabels])

  const { issueLabels, branchPrefixLabels } = useMemo(
    () => resolveIssuePickerLabels(teamMetadata?.labels, projectLabels ?? []),
    [teamMetadata?.labels, projectLabels],
  )

  return {
    teamMetadata,
    teamMetadataLoading,
    issueLabels,
    issueLabelsLoading: teamMetadataLoading,
    teamLabels: issueLabels,
    branchPrefixLabels,
  }
}
