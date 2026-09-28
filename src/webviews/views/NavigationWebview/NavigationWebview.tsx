import { useEffect, useState } from "react"

import { Button } from "../../components/Button/Button"
import { LinearReferenceIcon } from "../../components/Editor/markdownPlugins/MentionPlugin/LinearReferenceIcon"
import { vscApi } from "../../hooks/useRequestDataUpdate"

import type { NavigationSelector, NavigationSnapshot } from "src/types/Navigation"

import "./NavigationWebview.css"

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
          <div className="navigationFilters" aria-label="Active filters">
            {state.filters.map((filter) => (
              <Button
                key={filter.id}
                title={filter.description ? `${filter.description}: ${filter.label}` : filter.label}
                size="xs"
                variant="subtle"
                disabled={state.busy}
                aria-label={`Remove ${filter.label}`}
                onClick={async () => {
                  try {
                    await vscApi.postMessage({ type: "clearNavigationFilter", id: filter.id })
                  } catch (error) {
                    setError(String(error))
                  }
                }}
              >
                {filter.color && (
                  <span
                    className="navigationStatusDot"
                    style={{ backgroundColor: filter.color }}
                    aria-hidden="true"
                  />
                )}
                {filter.label}
                <span aria-hidden="true"> ×</span>
              </Button>
            ))}
          </div>
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
