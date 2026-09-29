import { SerializedCycle } from "src/types/SerializedLinear"

import { ProjectCycleIcon } from "./ProjectCycleIcon"

import "./ProjectCycle.css"

const cycleDateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })

export type ProjectCycleProps = {
  projectCycle: SerializedCycle | null
  showDate?: boolean
  inline?: "text" | "icon"
  size?: number
  style?: React.CSSProperties
  className?: string
}

export function ProjectCycle(props: ProjectCycleProps) {
  const { style, className, projectCycle, showDate, inline, size } = props

  function getLabel() {
    if (!projectCycle) {
      return "No cycle"
    } else {
      return projectCycle.name || `Cycle ${projectCycle.number}`
    }
  }

  function getDateLabel() {
    if (projectCycle?.startsAt && projectCycle?.endsAt) {
      return `${cycleDateFormat.format(new Date(projectCycle.startsAt))} - ${cycleDateFormat.format(
        new Date(projectCycle.endsAt),
      )}`
    }
    return null
  }

  if (inline === "text") {
    return getLabel()
  } else if (inline === "icon") {
    return <ProjectCycleIcon cycle={projectCycle} style={style} className={className} size={size} />
  }

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "start",
        opacity: projectCycle ? 1 : 0.5,
        fontSize: size,
        ...style,
      }}
      className={className}
    >
      <ProjectCycleIcon cycle={projectCycle} style={{ marginRight: 8 }} size={size} />
      <span>{getLabel()}</span>
      {showDate && projectCycle?.startsAt && projectCycle?.endsAt ? (
        <div className="cycleDates">
          {getDateLabel()}{" "}
          {projectCycle.isActive ? ` ・ Current` : projectCycle.isNext ? ` ・ Upcoming` : null}
        </div>
      ) : null}
    </div>
  )
}
