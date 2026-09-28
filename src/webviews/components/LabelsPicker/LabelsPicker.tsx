import { useMemo } from "react"
import { TagPicker, type TagPickerProps } from "rsuite"
import { SerializedIssue } from "src/types/SerializedLinear"
import { useIssueContext } from "src/webviews/contexts/IssueContext"

import { Label } from "./Label"
import { LabelIcon } from "./LabelIcon"

import "./LabelsPicker.css"

type LabelsPickerProps = Omit<TagPickerProps, "onChange" | "value" | "data" | "size"> & {
  issue: SerializedIssue
  inline?: boolean
  size?: number
  onChange: (labelIds: string[]) => void
  style?: React.CSSProperties
  className?: string
}

export function LabelsPicker(props: LabelsPickerProps) {
  const { issue, onChange, inline, size, style, className, ...tagPickerProps } = props
  const { issueLabels, issueLabelsLoading } = useIssueContext()
  const editable = !props.disabled && !props.readOnly && !props.plaintext
  const placeholder = (
    <span
      key="add-label-placeholder"
      className="labelPickerPlaceholder"
      style={{ cursor: editable ? "pointer" : "default" }}
    >
      <LabelIcon size={14} style={{ marginRight: 6 }} />
      {editable ? "Add a label..." : "Labels"}
    </span>
  )

  const cacheData = useMemo(
    () =>
      issueLabels
        ?.map((label) => ({
          label: label.name,
          value: label.id,
          issueLabel: label,
        }))
        .sort((a, b) => a.label.localeCompare(b.label))
        .sort((a) => (issue?.labelIds?.includes(a.value) ? -1 : 1)) || [],
    [issueLabels, issue.labelIds],
  )

  return (
    <TagPicker
      virtualized
      style={style}
      className={`labelPicker ${className || ""}`}
      loading={issueLabelsLoading}
      data={cacheData}
      value={issue?.labelIds || []}
      onChange={onChange}
      placeholder={placeholder}
      cleanable={false}
      searchable
      renderOption={(_, item) => <Label key={item.value} issueLabel={item.issueLabel} inline />}
      renderValue={(_, items) => {
        const labels = items.map((item) => {
          if (!item) return null
          return <Label key={item.value} issueLabel={item.issueLabel} inline={inline} size={size} />
        })
        return editable && items.length > 0 ? [...labels, placeholder] : labels
      }}
      {...tagPickerProps}
    />
  )
}
