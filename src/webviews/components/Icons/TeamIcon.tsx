export function TeamIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="6" cy="5" r="2.25" />
      <path d="M1.5 13v-1a3 3 0 0 1 3-3h3a3 3 0 0 1 3 3v1M11 2.75a2.25 2.25 0 0 1 0 4.5M12 9a3 3 0 0 1 2.5 3v1" />
    </svg>
  )
}
