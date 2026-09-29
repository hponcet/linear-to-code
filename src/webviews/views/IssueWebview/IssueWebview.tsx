import { Attachments } from "src/webviews/components/Attachments/Attachments"
import { CommentInput } from "src/webviews/components/Comment/CommentInput"
import { Container } from "src/webviews/components/Container/Container"
import { IssueActivity } from "src/webviews/components/IssueActivity/IssueActivity"
import { IssueLocation } from "src/webviews/components/IssueLocation/IssueLocation"
import { Separator } from "src/webviews/components/Separator/Separator"
import { SubIssues } from "src/webviews/components/SubIssues/SubIssues"
import { IssueContextProvider } from "src/webviews/contexts/IssueContext"
import { ModalsContextProvider } from "src/webviews/contexts/ModalsContext"
import { useProps } from "src/webviews/hooks/useProps"
import { IssueHeader } from "src/webviews/views/IssueWebview/IssueHeader"

import { IssueContent } from "./IssueContent"

import "./IssueWebview.scss"

export default function IssueWebview() {
  const [props, loaded] = useProps<"issue">()
  const { issueId, connection } = props

  if (!issueId || !connection) {
    return <Container loading={true} />
  }

  return (
    <IssueContextProvider
      key={issueId}
      isLoading={!loaded}
      issueId={issueId}
      connection={connection}
    >
      <ModalsContextProvider>
        <Container>
          <IssueLocation />
          <IssueHeader />
          <div className="issueBody">
            <IssueContent />
            <SubIssues />
            <Attachments />
            <Separator />
            <IssueActivity />
            <CommentInput />
          </div>
        </Container>
      </ModalsContextProvider>
    </IssueContextProvider>
  )
}
