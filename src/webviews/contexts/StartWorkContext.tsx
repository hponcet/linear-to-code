import { LinearClient } from "@linear/sdk"
import { ReactNode, useState } from "react"
import { SerializedIssue } from "src/types/SerializedLinear"

import { IssueContextReact } from "./IssueContext"
import { useIssueFormContextValue } from "./IssueFormContext"

import { Container } from "../components/Container/Container"
import { useAsyncEffect } from "../hooks/useAsyncEffect"
import { useLinearApi, vscApi } from "../hooks/useRequestDataUpdate"

import type { LinearWorkspace } from "src/linear/LinearWorkspaces"

type StartWorkContextProviderProps = {
  issueId: string
  connection: LinearWorkspace
  isLoading?: boolean
  children: ReactNode
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

  const context = useIssueFormContextValue({ issue, connection, panelActions, updateIssue })

  if (!issue || isLoading || externalLoading) {
    return <Container loading={true} />
  }

  return <IssueContextReact.Provider value={context}>{children}</IssueContextReact.Provider>
}
