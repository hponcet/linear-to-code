import { Container } from "src/webviews/components/Container/Container"
import { IssueLocation } from "src/webviews/components/IssueLocation/IssueLocation"
import { IssueContextProvider } from "src/webviews/contexts/IssueContext"
import { ModalsContextProvider } from "src/webviews/contexts/ModalsContext"
import { useAsyncMemo } from "src/webviews/hooks/useAsyncMemo"
import { useProps } from "src/webviews/hooks/useProps"
import { IssueHeader } from "src/webviews/views/IssueWebview/IssueHeader"

import "./IssueWebview.scss"

// The body carries the editor. It starts loading with the page and arrives while the issue is
// fetched, so the page script stays small. It renders in a normal update, not through Suspense:
// a Suspense retry renders concurrently, and Tiptap destroys an editor not mounted within 1 ms.
const issueBodyModule = import("./IssueBody")

export default function IssueWebview() {
  const [props, loaded] = useProps<"issue">()
  const [issueBody] = useAsyncMemo(() => issueBodyModule, [])
  const { issueId, connection } = props

  if (!issueId || !connection) {
    return <Container loading={true} />
  }

  const IssueBody = issueBody?.IssueBody
  return (
    <IssueContextProvider
      key={issueId}
      isLoading={!loaded}
      issueId={issueId}
      connection={connection}
    >
      <ModalsContextProvider>
        {IssueBody ? (
          <Container>
            <IssueLocation />
            <IssueHeader />
            <IssueBody />
          </Container>
        ) : (
          <Container loading={true} />
        )}
      </ModalsContextProvider>
    </IssueContextProvider>
  )
}
