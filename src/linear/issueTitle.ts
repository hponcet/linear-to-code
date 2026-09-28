export function normalizeIssueTitle(value: unknown): string {
  if (typeof value !== "string") throw new Error("Issue title must be text.")
  const title = value.replace(/[\r\n\t]+/g, " ").trim()
  if (!title) throw new Error("Issue title cannot be empty.")
  return title
}
