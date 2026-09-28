import { useEffect, useId, useState } from "react"
import { Animation } from "rsuite"

import { Button } from "../../components/Button/Button"
import { LinearReferenceIcon } from "../../components/Editor/markdownPlugins/MentionPlugin/LinearReferenceIcon"
import { CaretIcon } from "../../components/Icons/CaretIcon"
import { CrossIcon } from "../../components/Icons/CrossIcon"
import { ProjectCycleIcon } from "../../components/ProjectCyclePicker/ProjectCycleIcon"
import { UserAvatar } from "../../components/UserAvatar/UserAvatar"
import { WorkflowStateIcon } from "../../components/WorklfowStatePicker/WorkflowStateIcon"
import { vscApi } from "../../hooks/useRequestDataUpdate"

import type { NavigationSelector, NavigationSnapshot } from "src/types/Navigation"

import "./NavigationWebview.css"

function ActiveFilters({
  filters,
  busy,
  remove,
}: {
  filters: NavigationSnapshot["filters"]
  busy: boolean
  remove: (id: string) => Promise<void>
}) {
  const [collapsed, setCollapsed] = useState(true)
  const contentId = useId()
  if (!filters.length) return null

  return (
    <section className="navigationFilters" aria-label="Active filters">
      <Button
        className="navigationFiltersToggle"
        variant="subtle"
        aria-label={`Active filters (${filters.length})`}
        aria-expanded={!collapsed}
        aria-controls={contentId}
        onClick={() => setCollapsed(!collapsed)}
      >
        <CaretIcon
          style={{
            transform: collapsed ? "rotate(0deg)" : "rotate(90deg)",
            transition: "transform 0.3s",
          }}
        />
        <span>Active filters</span>
        <span className="navigationFilterCount">{filters.length}</span>
      </Button>
      <Animation.Collapse in={!collapsed}>
        {(props, ref) => (
          <div {...props} ref={ref} id={contentId} inert={collapsed} aria-hidden={collapsed}>
            <div className="navigationFilterGroups">
              {(
                [
                  ["cycle", "Cycle"],
                  ["status", "Statuses"],
                  ["assignee", "Assignees"],
                ] as const
              ).map(([kind, label]) => {
                const selected = filters.filter((filter) => filter.kind === kind)
                if (!selected.length) return null
                return (
                  <div key={kind} role="group" aria-labelledby={`${contentId}-${kind}`}>
                    <div className="navigationFilterCategory" id={`${contentId}-${kind}`}>
                      {label}
                    </div>
                    <div className="navigationFilterChips">
                      {selected.map((filter) => (
                        <span
                          key={filter.id}
                          className="navigationFilterChip"
                          title={
                            filter.description
                              ? `${filter.description}: ${filter.label}`
                              : filter.label
                          }
                        >
                          <span className="navigationFilterIcon" aria-hidden="true">
                            {filter.kind === "cycle" && (
                              <ProjectCycleIcon cycle={filter.cycle} size={14} />
                            )}
                            {filter.kind === "status" && (
                              <WorkflowStateIcon workflowState={filter.workflowState} size={14} />
                            )}
                            {filter.kind === "assignee" && (
                              <UserAvatar user={filter.user} size={14} />
                            )}
                          </span>
                          <span className="navigationFilterLabel">{filter.label}</span>
                          <Button
                            className="navigationFilterRemove"
                            size="xs"
                            variant="subtle"
                            icon={<CrossIcon size={10} />}
                            disabled={busy}
                            aria-label={`Remove ${filter.label}`}
                            title={`Remove ${filter.label}`}
                            onClick={() => remove(filter.id)}
                          />
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </Animation.Collapse>
    </section>
  )
}

export function NavigationWebview() {
  const [state, setState] = useState<NavigationSnapshot>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.data.action === "navigationChanged") setState(event.data.payload)
    }
    window.addEventListener("message", listener)
    void vscApi
      .postMessage({ type: "getNavigation" })
      .then(setState)
      .catch((error) => setError(String(error)))
    return () => window.removeEventListener("message", listener)
  }, [])

  const select = async (selector: NavigationSelector) => {
    setError(undefined)
    try {
      await vscApi.postMessage({ type: "selectNavigation", selector })
    } catch (error) {
      setError(String(error))
    }
  }
  const field = (selector: NavigationSelector, label: string, value: string) => (
    <Button
      size="sm"
      variant="subtle"
      disabled={state?.busy}
      onClick={() => select(selector)}
      aria-label={`${label}: ${value}`}
      title={value}
    >
      {selector === "project" && (
        <LinearReferenceIcon
          kind="project"
          card={{
            kind: "project",
            rows: [],
            title: value,
            icon: state?.projectIcon,
            color: state?.projectColor,
          }}
        />
      )}
      {selector === "team" && (
        <LinearReferenceIcon
          kind="team"
          card={{
            kind: "view",
            rows: [],
            title: value,
            icon: state?.teamIcon,
            color: state?.teamColor,
          }}
        />
      )}
      <span className="navigationValue">{value}</span>
      <span aria-hidden="true">▾</span>
    </Button>
  )
  if (!state)
    return (
      <div className="linearNavigation" role="status">
        Loading workspaces...
      </div>
    )
  return (
    <nav className="linearNavigation" aria-label="Linear navigation" aria-busy={state.busy}>
      <div className="navigationRow">
        {field("workspace", "Workspace", state.workspace?.name ?? "Connect workspace...")}
        <Button
          size="sm"
          variant="subtle"
          iconOnly
          disabled={state.busy}
          onClick={() => select("menu")}
          aria-label="Workspace menu"
        >
          ···
        </Button>
      </div>
      {state.workspace && (
        <>
          <div className="navigationRow">
            {field("team", "Team", state.team)}
            {field("project", "Project", state.project)}
          </div>
          <div className="navigationRow">
            {field("view", "View", state.view)}
            <Button
              size="sm"
              variant="subtle"
              disabled={state.busy}
              onClick={() => select("filters")}
            >
              Filters{state.filters.length ? ` (${state.filters.length})` : ""}
            </Button>
          </div>
          <ActiveFilters
            key={state.workspace.id}
            filters={state.filters}
            busy={state.busy}
            remove={async (id) => {
              try {
                await vscApi.postMessage({ type: "clearNavigationFilter", id })
              } catch (error) {
                setError(String(error))
              }
            }}
          />
        </>
      )}
      {(error || state.error) && (
        <div className="navigationError" role="status">
          <span>
            {error || "Unable to load this workspace. Refresh or reconnect to try again."}
          </span>
          <Button size="sm" variant="link" onClick={() => select("reconnect")}>
            Reconnect
          </Button>
        </div>
      )}
    </nav>
  )
}
