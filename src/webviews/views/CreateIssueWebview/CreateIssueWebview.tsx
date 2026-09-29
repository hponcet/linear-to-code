import { useEffect, useRef, useState } from "react"
import { SelectPicker } from "rsuite"
import { Props } from "src/types/ActionMessage"
import { SerializedIssue } from "src/types/SerializedLinear"
import { Button } from "src/webviews/components/Button/Button"
import { Container } from "src/webviews/components/Container/Container"
import { TeamIcon } from "src/webviews/components/Icons/TeamIcon"
import { IssueLocation } from "src/webviews/components/IssueLocation/IssueLocation"
import { IssueContextReact } from "src/webviews/contexts/IssueContext"
import { useIssueFormContextValue } from "src/webviews/contexts/IssueFormContext"
import { useAsyncMemo } from "src/webviews/hooks/useAsyncMemo"
import { useProps } from "src/webviews/hooks/useProps"
import { useLinearApi, vscApi } from "src/webviews/hooks/useRequestDataUpdate"
import { IssueHeader } from "src/webviews/views/IssueWebview/IssueHeader"

import "../../components/Input/IssueTitleInput.scss"
import "../IssueWebview/IssueWebview.scss"

import type { IssueUpdateFields } from "src/linear/LinearService"
import type { LinearWorkspace } from "src/linear/LinearWorkspaces"
import type { Editor as EditorComponent } from "src/webviews/components/Editor/Editor"

type CreateIssueFormProps = Omit<Props["createIssue"], "connection"> & {
  connection: LinearWorkspace
  Editor: typeof EditorComponent
}

// The editor starts loading with the page, so the page script stays small. The form renders once
// it's there, in a normal update rather than through Suspense (see IssueWebview).
const editorModule = import("src/webviews/components/Editor/Editor")

function CreateIssueForm({ connection, teams, draft: initialDraft, Editor }: CreateIssueFormProps) {
  const [draft, setDraft] = useState<IssueUpdateFields>({
    title: "",
    description: "",
    priority: 0,
    labelIds: [],
    ...initialDraft,
  })
  const [descriptionValid, setDescriptionValid] = useState(false)
  const [created, setCreated] = useState<SerializedIssue>()
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const panelActions = useLinearApi()

  const context = useIssueFormContextValue({
    issue: draft as SerializedIssue,
    connection,
    panelActions,
    updateIssue: async (_issueId, fields) => {
      setDraft((current) => ({ ...current, ...fields }))
      return undefined
    },
  })

  const defaultStateId = context.team?.defaultIssueStateId
  useEffect(() => {
    if (defaultStateId) {
      setDraft((current) => (current.stateId ? current : { ...current, stateId: defaultStateId }))
    }
  }, [defaultStateId])

  useEffect(() => titleRef.current?.focus(), [])

  function changeTeam(teamId: string) {
    // Statuses, cycles, projects, labels and estimates belong to the previous team.
    setDraft(({ title, description, priority, assigneeId }) => ({
      title,
      description,
      priority,
      assigneeId,
      teamId,
      labelIds: [],
    }))
  }

  async function submit() {
    try {
      const issue =
        created ??
        (await vscApi.postMessage({ type: "createIssue", teamId: draft.teamId!, fields: draft }))
      // Retrying after a failed open must never create the issue twice.
      setCreated(issue)
      await vscApi.postMessage({ type: "openIssue", issueId: issue.id }, { notifyError: true })
      void panelActions.closePanel()
    } catch {
      // The error toast is already shown; keep the form so the user can retry.
    }
  }

  // A title, a status and a team are required. The description only blocks while it can't be
  // saved as-is (an upload in progress or unsupported Markdown), so nothing is lost on create.
  const canSubmit =
    !!created || (!!draft.teamId && !!draft.stateId && !!draft.title?.trim() && descriptionValid)

  return (
    <IssueContextReact.Provider value={context}>
      <Container>
        <IssueLocation />
        <IssueHeader
          leading={
            <SelectPicker
              aria-label="Team"
              data={teams.map((team) => ({ label: team.name, value: team.id }))}
              value={draft.teamId}
              cleanable={false}
              placement="bottomStart"
              style={{ marginLeft: 6 }}
              renderValue={(_, item) => (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <TeamIcon size={14} />
                  {item?.label}
                </span>
              )}
              onChange={(teamId) => teamId && changeTeam(teamId)}
            />
          }
          actions={
            <Button
              variant="primary"
              style={{ marginLeft: 6 }}
              disabled={!canSubmit}
              onClick={submit}
            >
              {created ? `Open ${created.identifier}` : "Create Issue"}
            </Button>
          }
        />
        <div className="issueBody">
          <div className="linear-issue-title-input">
            <textarea
              ref={titleRef}
              aria-label="Issue title"
              aria-required
              placeholder="Issue title"
              rows={1}
              value={draft.title ?? ""}
              onChange={(event) => {
                const title = event.target.value
                setDraft((current) => ({ ...current, title }))
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) event.preventDefault()
              }}
            />
          </div>
          <Editor
            editable
            ariaLabel="Issue description"
            placeholder="Add description..."
            value={draft.description ?? ""}
            onChange={(description) => setDraft((current) => ({ ...current, description }))}
            onValidityChange={setDescriptionValid}
          />
        </div>
      </Container>
    </IssueContextReact.Provider>
  )
}

export default function CreateIssueWebview() {
  const [props, loaded] = useProps<"createIssue">()
  const [editor] = useAsyncMemo(() => editorModule, [])

  if (!loaded || !props.connection || !editor) {
    return <Container loading={true} />
  }

  return <CreateIssueForm {...props} connection={props.connection} Editor={editor.Editor} />
}
