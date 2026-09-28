import { SerializedCycle } from "src/types/SerializedLinear"

type CycleIconProps = {
  style?: React.CSSProperties
  className?: string
  cycle?: Pick<SerializedCycle, "isActive" | "isNext"> | null
  size?: number
}

export function ProjectCycleIcon(props: CycleIconProps) {
  const { style, className, cycle, size = 16 } = props

  if (!cycle) {
    return (
      <svg
        stroke="lch(42.071% 1.933 272 / 1)"
        width={size}
        height={size}
        viewBox="0 0 16 16"
        aria-hidden="true"
        style={style}
        className={className}
      >
        <circle
          cx="8"
          cy="8"
          r="6.25"
          fill="none"
          strokeWidth={1.5}
          strokeDasharray="1.636246173744684"
          strokeDashoffset="0.818123086872342"
        ></circle>
      </svg>
    )
  }

  if (cycle.isActive) {
    return (
      <svg
        width={size}
        height={size}
        fill="lch(64.892% 1.933 272 / 1)"
        stroke="lch(42.071% 1.933 272 / 1)"
        viewBox="0 0 16 16"
        aria-hidden="true"
        style={{ overflow: "visible", ...style }}
        className={className}
      >
        <circle
          transform="rotate(175.2733284560421 6.25 6.25)"
          cx="8"
          cy="8"
          r="6.25"
          fill="none"
          strokeWidth="1.5"
          strokeDasharray="39.269908169872416px"
          strokeDashoffset="30.24970258085561px"
          style={{
            transition: "transform 0.6s, stroke-dashoffset 0.6s",
            strokeLinecap: "round",
            transformBox: "fill-box",
          }}
        ></circle>
        <circle
          transform="rotate(-76 6.25 6.25)"
          cx="8"
          cy="8"
          r="6.25"
          fill="none"
          stroke="lch(48% 59.31 288.43)"
          strokeWidth="1.5"
          strokeDasharray="39.269908169872416px"
          strokeDashoffset="15.020205589016804px"
          style={{
            transition: "stroke-dashoffset 0.6s",
            strokeLinecap: "round",
            transformBox: "fill-box",
          }}
        ></circle>
        <path
          stroke="none"
          d="M6.95588 5.28329L10.6901 7.43926C11.0235 7.63171 11.0235 8.11283 10.6901 8.30528L6.95588 10.4612C6.62255 10.6537 6.20588 10.4131 6.20588 10.0282L6.20588 5.71631C6.20588 5.33141 6.62255 5.09084 6.95588 5.28329Z"
        ></path>
      </svg>
    )
  }

  if (cycle.isNext) {
    return (
      <svg
        width={size}
        height={size}
        fill="lch(64.892% 1.933 272 / 1)"
        stroke="lch(42.071% 1.933 272 / 1)"
        viewBox="0 0 16 16"
        aria-hidden="true"
        style={style}
        className={className}
      >
        <circle cx="8" cy="8" r="6.25" fill="none" strokeWidth="1.5"></circle>
        <circle
          cx="8"
          cy="8"
          r="6.25"
          fill="none"
          strokeWidth="1.5"
          strokeDasharray="1.636246173744684"
          strokeDashoffset="0.818123086872342"
        ></circle>
        <path
          stroke="none"
          d="M6.95588 5.28329L10.6901 7.43926C11.0235 7.63171 11.0235 8.11283 10.6901 8.30528L6.95588 10.4612C6.62255 10.6537 6.20588 10.4131 6.20588 10.0282L6.20588 5.71631C6.20588 5.33141 6.62255 5.09084 6.95588 5.28329Z"
        ></path>
      </svg>
    )
  }

  return (
    <svg
      width={size}
      height={size}
      fill="lch(64.892% 1.933 272 / 1)"
      stroke="lch(42.071% 1.933 272 / 1)"
      viewBox="0 0 16 16"
      aria-hidden="true"
      style={style}
      className={className}
    >
      <circle
        cx="8"
        cy="8"
        r="6.25"
        fill="none"
        strokeWidth="1.5"
        strokeDasharray="1.636246173744684"
        strokeDashoffset="0.818123086872342"
      ></circle>
      <path
        stroke="none"
        d="M6.95588 5.28329L10.6901 7.43926C11.0235 7.63171 11.0235 8.11283 10.6901 8.30528L6.95588 10.4612C6.62255 10.6537 6.20588 10.4131 6.20588 10.0282L6.20588 5.71631C6.20588 5.33141 6.62255 5.09084 6.95588 5.28329Z"
      ></path>
    </svg>
  )
}
