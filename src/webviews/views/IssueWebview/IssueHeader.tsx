import { ReactNode } from "react"
import { useDialog } from "rsuite"
import { AssigneePicker } from "src/webviews/components/Assignee/AssigneePicker"
import { CheckoutButton } from "src/webviews/components/ConfigureBranchButton/CheckoutButton"
import { ConfigureBranchButton } from "src/webviews/components/ConfigureBranchButton/ConfigureBranchButton"
import { EstimatePicker } from "src/webviews/components/EstimatePicker/EstimatePicker"
import { CogIcon } from "src/webviews/components/Icons/CogIcon"
import { LinkIcon } from "src/webviews/components/Icons/LinkIcon"
import { TrashIcon } from "src/webviews/components/Icons/TrashIcon"
import { LabelsPicker } from "src/webviews/components/LabelsPicker/LabelsPicker"
import { Menu } from "src/webviews/components/Menu/Menu"
import { OpenExternalIssue } from "src/webviews/components/OpenExternalIssue/OpenExternalIssue"
import { PriorityPicker } from "src/webviews/components/PriorityPicker/PriorityPicker"
import { ProjectCyclePicker } from "src/webviews/components/ProjectCyclePicker/ProjectCyclePicker"
import { IssueProjectPicker } from "src/webviews/components/ProjectPicker/ProjectPicker"
import { PullRequestButton } from "src/webviews/components/PullRequestButton/PullRequestButton"
import { WorkflowStatePicker } from "src/webviews/components/WorklfowStatePicker/WorkflowStatePicker"
import { useIssueContext } from "src/webviews/contexts/IssueContext"
import { useModalsContext } from "src/webviews/contexts/ModalsContext"

import "./IssueHeader.css"

type IssueHeaderProps = {
  /** Rendered before the pickers. */
  leading?: ReactNode
  /** Replaces the actions that need an existing issue (branch, pull request, link, menu). */
  actions?: ReactNode
}

export function IssueHeader({ leading, actions }: IssueHeaderProps) {
  const { issue, update } = useIssueContext()

  const { setIsCreatingAttachment } = useModalsContext()

  const dialog = useDialog()

  return (
    <>
      <div className="issueHeaderTopRow">
        {leading}
        {issue.trashed && (
          <span className="issueTrashedLabel">
            <TrashIcon /> Trashed
          </span>
        )}

        <WorkflowStatePicker
          issue={issue}
          onChange={(stateId) => update.issue(issue.id, { stateId })}
          style={{ marginLeft: 6 }}
          size={14}
          disabled={!!issue.trashed}
        />
        <PriorityPicker
          issue={issue}
          onChange={(priority) => update.issue(issue.id, { priority })}
          style={{ marginLeft: 6 }}
          size={14}
          disabled={!!issue.trashed}
        />
        <EstimatePicker
          issue={issue}
          onChange={(estimate) => update.issue(issue.id, { estimate })}
          style={{ marginLeft: 6 }}
          size={14}
          disabled={!!issue.trashed}
        />
        <ProjectCyclePicker
          issue={issue}
          onChange={(cycleId) => update.issue(issue.id, { cycleId })}
          style={{ marginLeft: 6 }}
          size={14}
          disabled={!!issue.trashed}
        />
        <IssueProjectPicker
          issue={issue}
          onChange={(projectId) => update.issue(issue.id, { projectId })}
          style={{ marginLeft: 6 }}
          size={14}
          placement="bottom"
          disabled={!!issue.trashed}
        />
        <div className="issueHeaderBottomRow" style={{ marginLeft: "auto" }}>
          <AssigneePicker
            issue={issue}
            onChange={(assigneeId) => update.issue(issue.id, { assigneeId })}
            style={{ marginLeft: 6 }}
            size={14}
            placement="bottomEnd"
            inline="icon"
            disabled={!!issue.trashed}
          />
          {actions ?? (
            <>
              {!issue.trashed && (
                <>
                  <CheckoutButton
                    issue={issue}
                    style={{ marginLeft: 6, padding: 0 }}
                    inline="icon"
                  />
                  <PullRequestButton
                    issue={issue}
                    style={{ marginLeft: 6, padding: 0 }}
                    inline="icon"
                  />
                  <ConfigureBranchButton
                    issue={issue}
                    style={{ marginLeft: 6, padding: 0 }}
                    inline="icon"
                  />
                </>
              )}
              <OpenExternalIssue issue={issue} style={{ marginLeft: 6, padding: 0 }} />
              <Menu
                items={[
                  {
                    label: "Add an attachment",
                    action: () => setIsCreatingAttachment({}),
                    icon: <LinkIcon size={14} />,
                  },
                  {
                    label: "Copy issue link",
                    action: () => window.navigator.clipboard.writeText(issue.url),
                    icon: <LinkIcon size={14} />,
                  },
                  {
                    label: "Settings",
                    action: () => update.panelActions.openSettings(),
                    icon: <CogIcon size={14} />,
                  },
                  {
                    label: "Delete issue",
                    icon: <TrashIcon size={14} />,
                    action: async () => {
                      const shouldDeleteIssue = await dialog.confirm(
                        `Are you sure you want to delete issue ${issue.identifier}? This action cannot be undone.`,
                        {
                          title: `Delete Issue ${issue.identifier}`,
                          okText: "Delete",
                          severity: "error",
                        },
                      )
                      if (shouldDeleteIssue) {
                        await update.subIssues.deleteSubIssue(issue.id)
                      }
                    },
                  },
                ]}
              />
            </>
          )}
        </div>
      </div>
      <LabelsPicker
        issue={issue}
        onChange={(labelIds) => update.issue(issue.id, { labelIds })}
        style={{ marginTop: 6 }}
        size={14}
        disabled={!!issue.trashed}
      />
    </>
  )
}
