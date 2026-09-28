import { useIssueContext } from "src/webviews/contexts/IssueContext"

export function IssueLocation() {
  const { connection, team, issue } = useIssueContext()
  return (
    <div className="linearWorkspaceBadge">
      {[connection.name, team?.name, issue.identifier].filter(Boolean).join(" - ")}
    </div>
  )
}
