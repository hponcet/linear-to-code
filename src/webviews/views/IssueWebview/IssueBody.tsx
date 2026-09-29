import { Attachments } from "src/webviews/components/Attachments/Attachments"
import { CommentInput } from "src/webviews/components/Comment/CommentInput"
import { IssueActivity } from "src/webviews/components/IssueActivity/IssueActivity"
import { Separator } from "src/webviews/components/Separator/Separator"
import { SubIssues } from "src/webviews/components/SubIssues/SubIssues"

import { IssueContent } from "./IssueContent"

export function IssueBody() {
  return (
    <div className="issueBody">
      <IssueContent />
      <SubIssues />
      <Attachments />
      <Separator />
      <IssueActivity />
      <CommentInput />
    </div>
  )
}
