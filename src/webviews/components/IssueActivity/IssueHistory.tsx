import { Fragment, useState } from "react"
import { Animation } from "rsuite"
import { useIssueContext } from "src/webviews/contexts/IssueContext"
import { History } from "src/webviews/utils/history"
import moment from "src/webviews/utils/moment"

import { getActivity, getAllHistoryTypes, getHistoryType } from "../InlineIssue/historyUtils"
import { UserAvatar } from "../UserAvatar/UserAvatar"

import "./IssueHistory.scss"

type IssueHistoryProps = {
  history: History[]
  level?: number
  onClick?: () => void
}

export function IssueHistory(props: IssueHistoryProps) {
  const { history, level = 0, onClick } = props

  const contextValues = useIssueContext()

  const [expand, setExpand] = useState(false)

  const activity = history[0]

  if (!activity) {
    return null
  }

  const historyTypes = getAllHistoryTypes(activity).sort((a, b) =>
    getHistoryType(a).localeCompare(getHistoryType(b)),
  )

  if (historyTypes.length === 0) {
    return null
  }

  const [content, icon] = getActivity(contextValues, activity)

  const shouldCollapse = level === 0 && history.length > 1

  return (
    <>
      {shouldCollapse && (
        <Animation.Collapse in={expand}>
          {(props, ref) => (
            <div ref={ref} {...props} className={`issueHistoryExpandArea ${props.className || ""}`}>
              <div className="activityBreadcrumbTrail" style={{ left: 29 }} />
              {history
                .slice(1, history.length)
                .map((h, i, arr) => (
                  <IssueHistory
                    key={h.id}
                    history={[h]}
                    level={i === arr.length - 1 ? 0 : 1}
                    onClick={i === arr.length - 1 ? () => setExpand((v) => !v) : undefined}
                  />
                ))
                .reverse()}
            </div>
          )}
        </Animation.Collapse>
      )}
      <div
        className="issueHistory"
        onClick={onClick || (() => setExpand((v) => !v))}
        style={{
          cursor: shouldCollapse || !!onClick ? "pointer" : "default",
          paddingLeft: level * 20,
        }}
      >
        <div className="historyActivityLine">
          <div className="issueHistoryIcon">
            <div>
              {icon ||
                (activity.actor ? (
                  <UserAvatar
                    user={activity.actor}
                    size={14}
                    style={{ outline: "4px solid var(--lm-surface-bg)" }}
                  />
                ) : null)}
            </div>
          </div>
          <span className="issueHistoryContent">
            <span>{activity?.actor?.email}</span>
            {content.map((action, index) => {
              return (
                <Fragment key={String(index)}>
                  {action}
                  {content.length !== index + 1 ? <span> and </span> : null}
                </Fragment>
              )
            })}
            <span style={{ padding: "0 3px" }}>·</span>
            <span className="issueHistoryDate">{moment(activity.updatedAt).fromNow()}</span>
            {shouldCollapse && (
              <span className="issueHistoryExpandIndicator">
                {expand ? "▲" : `+ ${history.length - 1} more`}
              </span>
            )}
          </span>
        </div>
      </div>
    </>
  )
}
