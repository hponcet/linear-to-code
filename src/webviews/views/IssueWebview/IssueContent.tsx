import { useCallback, useEffect, useRef, useState } from "react"
import { Editor } from "src/webviews/components/Editor/Editor"
import { inspectLinearMarkdown } from "src/webviews/components/Editor/linearMarkdown"
import { EmojiPicker } from "src/webviews/components/EmojiPicker/EmojiPicker"
import { IssueTitleInput } from "src/webviews/components/Input/IssueTitleInput"
import { IssueParent } from "src/webviews/components/IssueParent/IssueParent"
import { useIssueContext } from "src/webviews/contexts/IssueContext"
import { vscApi } from "src/webviews/hooks/useRequestDataUpdate"

import {
  createDescriptionAutosave,
  DescriptionAutosave,
  restoreDescriptionDraft,
} from "./descriptionAutosave"

export function IssueContent() {
  const { issue, update } = useIssueContext()
  const [draft, setDraft] = useState<string | undefined>(undefined)
  const [draftsLoading, setDraftsLoading] = useState(true)
  const [draftLoadError, setDraftLoadError] = useState<string | undefined>(undefined)
  const [draftPersistenceError, setDraftPersistenceError] = useState<string | undefined>(undefined)
  const [rejectedDraft, setRejectedDraft] = useState<string | undefined>(undefined)
  const [draftLoadAttempt, setDraftLoadAttempt] = useState(0)
  const [description, setDescription] = useState(issue.description || "")
  const currentDescription = useRef(description)
  const descriptionIsDirty = useRef(false)
  const descriptionIsValid = useRef(false)
  const initializedIssueId = useRef<string | undefined>(undefined)
  const updateIssueRef = useRef(update.issue)
  const autosaveRef = useRef<DescriptionAutosave | null>(null)

  useEffect(() => {
    updateIssueRef.current = update.issue
  }, [update.issue])

  const persistDraft = useCallback(
    (value: string | null) => {
      void vscApi.postMessage({ type: "setIssueDescriptionDraft", issueId: issue.id, value }).then(
        () => setDraftPersistenceError(undefined),
        (error) =>
          setDraftPersistenceError(
            error instanceof Error
              ? "The local draft could not be persisted: " + error.message
              : "The local draft could not be persisted.",
          ),
      )
    },
    [issue.id],
  )

  useEffect(() => {
    let active = true
    setDraft(undefined)
    setRejectedDraft(undefined)
    setDraftsLoading(true)
    setDraftLoadError(undefined)
    void vscApi.postMessage({ type: "getIssueDescriptionDraft", issueId: issue.id }).then(
      (value) => {
        if (!active) return
        setDraft(typeof value === "string" ? value : undefined)
        setDraftsLoading(false)
      },
      (error) => {
        if (!active) return
        setDraftsLoading(false)
        setDraftLoadError(
          error instanceof Error
            ? "The local draft could not be loaded: " + error.message
            : "The local draft could not be loaded.",
        )
      },
    )
    return () => {
      active = false
    }
  }, [draftLoadAttempt, issue.id])

  useEffect(() => {
    const autosave = createDescriptionAutosave(async (value) => {
      if (!descriptionIsValid.current) return false

      const updatedIssue = await updateIssueRef.current(issue.id, { description: value })
      if (!updatedIssue) return false

      if (descriptionIsValid.current && currentDescription.current === value) {
        descriptionIsDirty.current = false
        setDraft(undefined)
        persistDraft(null)
      }

      return true
    })

    autosaveRef.current = autosave
    return () => {
      autosave.dispose()
      autosaveRef.current = null
    }
  }, [issue.id, persistDraft])

  useEffect(() => {
    if (draftsLoading || draftLoadError || initializedIssueId.current === issue.id) return

    const savedDescription = issue.description || ""
    const restored = restoreDescriptionDraft(savedDescription, draft)
    const restoredDescription = restored.description
    const restoredDescriptionIsValid = inspectLinearMarkdown(restoredDescription).ok

    initializedIssueId.current = issue.id
    currentDescription.current = restoredDescription
    descriptionIsDirty.current =
      restored.rejectedDraft === undefined && draft !== undefined && draft !== savedDescription
    descriptionIsValid.current = restoredDescriptionIsValid
    setRejectedDraft(restored.rejectedDraft)
    setDescription(restoredDescription)

    if (descriptionIsDirty.current && restoredDescriptionIsValid) {
      autosaveRef.current?.schedule(restoredDescription)
    }

    if (draft !== undefined && draft === savedDescription) {
      setDraft(undefined)
      persistDraft(null)
    }
  }, [draft, draftLoadError, draftsLoading, issue.description, issue.id, persistDraft])

  useEffect(() => {
    if (initializedIssueId.current !== issue.id || descriptionIsDirty.current) return

    const savedDescription = issue.description || ""
    currentDescription.current = savedDescription
    setDescription(savedDescription)
  }, [issue.description, issue.id])

  const persistDescriptionChange = (value: string) => {
    currentDescription.current = value
    descriptionIsDirty.current = true
    setDraft(value)
    persistDraft(value)
  }

  const updateDescription = (value: string) => {
    persistDescriptionChange(value)
    setDescription(value)

    if (descriptionIsValid.current) {
      autosaveRef.current?.schedule(value)
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <IssueTitleInput
        key={issue.id}
        value={issue.title}
        deleted={issue.trashed}
        onSave={async (title) => (await update.issue(issue.id, { title }))?.title}
      />
      <IssueParent />
      {draftLoadError ? (
        <div role="alert">
          {draftLoadError} Editing remains disabled to protect the draft.{" "}
          <button type="button" onClick={() => setDraftLoadAttempt((attempt) => attempt + 1)}>
            Retry
          </button>
        </div>
      ) : null}
      {draftPersistenceError ? <div role="alert">{draftPersistenceError}</div> : null}
      {rejectedDraft !== undefined ? (
        <div role="alert">
          A local draft contains invalid Linear Markdown. The saved Linear description is shown, and
          the draft has not been deleted.{" "}
          <button
            type="button"
            onClick={() => {
              setRejectedDraft(undefined)
              setDraft(undefined)
              persistDraft(null)
            }}
          >
            Discard local draft
          </button>
          <details>
            <summary>View local draft</summary>
            <pre>{rejectedDraft}</pre>
          </details>
        </div>
      ) : null}
      <Editor
        value={description}
        editable={!draftsLoading && !draftLoadError && rejectedDraft === undefined}
        ariaLabel="Issue description"
        onChange={updateDescription}
        onBlur={() => {
          if (descriptionIsValid.current && descriptionIsDirty.current) {
            void autosaveRef.current?.flush()
          }
        }}
        onValidityChange={(valid: boolean) => {
          descriptionIsValid.current = valid
          if (!valid) {
            autosaveRef.current?.cancelScheduled()
          } else if (descriptionIsDirty.current) {
            autosaveRef.current?.schedule(currentDescription.current)
          }
        }}
      />
      <div style={{ margin: "20px 0 16px" }}>
        <EmojiPicker
          placement="bottomStart"
          onSelect={async (emoji) => {
            await update.reactions.addReaction({
              emoji,
              issueId: issue?.id || "",
            })
          }}
          onUnselect={async (id) => {
            await update.reactions.removeReaction(id)
          }}
          reactions={issue?.reactions || []}
        />
      </div>
    </div>
  )
}
