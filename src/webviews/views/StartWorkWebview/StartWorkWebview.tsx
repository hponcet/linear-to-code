import { Container } from "src/webviews/components/Container/Container"
import { StartWorkContextProvider } from "src/webviews/contexts/StartWorkContext"
import { useIssueBranches } from "src/webviews/hooks/useGitBranches"
import { useProps } from "src/webviews/hooks/useProps"

import { StartWorkContent } from "./StartWorkContent"

export function StartWorkWebview() {
  const [props, loaded] = useProps<"startWork">()

  const { issueId, connection, fromCheckout, isCursor } = props

  const {
    branches,
    currentBranch,
    isLoading,
    issueSettings,
    repoInitialized,
    gitApiInitialized,
    updateIssueSettings,
  } = useIssueBranches({ issueId: issueId! })

  if (!issueId || !connection || isLoading) {
    return <Container loading={true} />
  }

  return (
    <StartWorkContextProvider isLoading={!loaded} issueId={issueId} connection={connection}>
      <Container loading={!loaded}>
        <div className="linearWorkspaceBadge">{connection.name}</div>
        <StartWorkContent
          branches={branches}
          currentBranch={currentBranch}
          fromCheckout={fromCheckout}
          repoInitialized={repoInitialized}
          gitInitialized={gitApiInitialized}
          issueSettings={issueSettings}
          updateIssueSettings={updateIssueSettings}
          isCursor={isCursor}
        />
      </Container>
    </StartWorkContextProvider>
  )
}
