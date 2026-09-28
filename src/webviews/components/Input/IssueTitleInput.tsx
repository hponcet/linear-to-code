import { useEffect, useId, useRef, useState } from "react"
import { normalizeIssueTitle } from "src/linear/issueTitle"

import { Button } from "../Button/Button"

import "./IssueTitleInput.scss"

type IssueTitleInputProps = {
  value: string
  deleted?: boolean | null
  onSave: (value: string) => Promise<string | undefined>
}

export function IssueTitleInput({ value, deleted, onSave }: IssueTitleInputProps) {
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const dirty = useRef(false)
  const savePending = useRef(false)
  const errorId = useId()

  useEffect(() => {
    if (!dirty.current) setDraft(value)
  }, [value])

  async function save() {
    if (deleted || savePending.current || !dirty.current) return
    let title: string
    try {
      title = normalizeIssueTitle(draft)
    } catch (error) {
      setError((error as Error).message)
      return
    }
    if (title === value) {
      dirty.current = false
      setDraft(value)
      setError(undefined)
      return
    }

    savePending.current = true
    setSaving(true)
    setError(undefined)
    try {
      const savedTitle = await onSave(title)
      if (savedTitle === undefined) throw new Error("Title was not saved")
      dirty.current = false
      setDraft(savedTitle)
    } catch {
      setError("Could not save the title. Your changes are kept here.")
    } finally {
      savePending.current = false
      setSaving(false)
    }
  }

  return (
    <div className={`linear-issue-title-input${deleted ? " deleted" : ""}`}>
      <textarea
        aria-label="Issue title"
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        aria-busy={saving}
        title={deleted ? "Deleted issue" : "Enter to save · Escape to cancel"}
        placeholder="Issue title"
        rows={1}
        value={draft}
        readOnly={!!deleted || saving}
        onChange={(event) => {
          dirty.current = true
          setDraft(event.target.value)
          setError(undefined)
        }}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || saving) return
          if (event.key === "Enter") {
            event.preventDefault()
            event.stopPropagation()
            event.currentTarget.blur()
          } else if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            dirty.current = false
            setDraft(value)
            setError(undefined)
            event.currentTarget.blur()
          }
        }}
      />
      {error && (
        <div className="issueTitleFeedback" id={errorId} role="alert">
          {error}{" "}
          {draft.trim() && (
            <Button size="xs" variant="subtle" onClick={() => void save()}>
              Retry
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
