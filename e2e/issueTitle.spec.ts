import { expect, test } from "@playwright/test"

import { getIpcRequests, openIssueWebview } from "./support/issueWebview"

for (const theme of ["vscode-dark", "vscode-light", "vscode-high-contrast"]) {
  test(`edits and wraps issue titles with keyboard controls in ${theme}`, async ({ page }) => {
    const harness = await openIssueWebview(page, "Description stays unchanged.")
    await expect(page.locator(".linearWorkspaceBadge")).toHaveText(
      "E2E Workspace - E2E Team - E2E-1",
    )
    expect(await getIpcRequests(page, "getTeam")).toHaveLength(1)
    await page.setViewportSize({ width: 420, height: 740 })
    await page.evaluate((theme) => {
      document.body.className = theme
      const foreground = theme === "vscode-light" ? "#333" : "#eee"
      const background =
        theme === "vscode-light" ? "#fff" : theme === "vscode-high-contrast" ? "#000" : "#1e1e1e"
      document.body.style.color = foreground
      document.body.style.backgroundColor = background
      document.body.style.setProperty(
        "--vscode-foreground",
        theme === "vscode-light" ? "#333" : "#eee",
      )
      document.body.style.setProperty(
        "--vscode-editor-background",
        theme === "vscode-light" ? "#fff" : "#1e1e1e",
      )
      document.body.style.setProperty("--vscode-focusBorder", "#007acc")
    }, theme)
    const title = page.getByRole("textbox", { name: "Issue title", exact: true })
    const description = page.getByRole("textbox", { name: "Issue description", exact: true })
    await expect(title).toBeEditable()
    await title.focus()
    await title.press("Enter")
    expect(await getIpcRequests(page, "linearUpdateIssue")).toHaveLength(0)

    const longTitle =
      "Fix **literal Markdown** & <tags> in a long ticket title that wraps across several lines"
    await title.fill(longTitle)
    await expect.poll(() => title.evaluate((el) => el.clientHeight)).toBeGreaterThan(70)
    expect(await title.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    await page.screenshot({ path: `test-results/issue-title-${theme}.png` })
    await title.press("Enter")
    await expect.poll(() => getIpcRequests(page, "linearUpdateIssue")).toHaveLength(1)
    await expect(title).toBeEditable()
    expect((await getIpcRequests(page, "linearUpdateIssue"))[0].fields).toEqual({
      title: longTitle,
    })

    await title.fill("Discard this edit")
    await title.press("Escape")
    await expect(title).toHaveValue(longTitle)
    expect(await getIpcRequests(page, "linearUpdateIssue")).toHaveLength(1)

    await title.fill("  Pasted\nticket\ttitle  ")
    await description.click()
    await expect(title).toHaveValue("Pasted ticket title")
    await expect.poll(() => getIpcRequests(page, "linearUpdateIssue")).toHaveLength(2)
    expect((await getIpcRequests(page, "linearUpdateIssue"))[1].fields).toEqual({
      title: "Pasted ticket title",
    })
    await expect(description).toContainText("Description stays unchanged.")
    await harness.assertClean()
  })
}

test("keeps failed title edits for retry and rejects an empty title", async ({ page }) => {
  const harness = await openIssueWebview(page, {
    initialDescription: "Body",
    titleUpdateDelayMs: 300,
    titleUpdateFailures: 1,
  })
  const title = page.getByRole("textbox", { name: "Issue title", exact: true })
  const feedback = page.locator(".linear-issue-title-input")
  await title.fill(" ")
  await title.press("Enter")
  await expect(feedback.getByRole("alert")).toContainText("Issue title cannot be empty.")
  expect(await getIpcRequests(page, "linearUpdateIssue")).toHaveLength(0)

  await title.fill("Keep this draft")
  await title.press("Enter")
  await expect(title).not.toBeEditable()
  await expect(title).toHaveAttribute("aria-busy", "true")
  await expect(feedback.getByRole("status")).toHaveCount(0)
  await expect(feedback.getByRole("alert")).toContainText("Your changes are kept here.")
  await expect(title).toHaveValue("Keep this draft")
  await feedback.getByRole("button", { name: "Retry", exact: true }).click()
  await expect(title).toBeEditable()
  await expect(feedback.getByRole("alert")).toHaveCount(0)
  expect(await getIpcRequests(page, "linearUpdateIssue")).toHaveLength(2)
  await title.focus()
  await title.press("Enter")
  expect(await getIpcRequests(page, "linearUpdateIssue")).toHaveLength(2)
  await harness.assertClean()
})

test("refreshes saved titles without replacing an edit in progress", async ({ page }) => {
  const harness = await openIssueWebview(page, "Body")
  const title = page.getByRole("textbox", { name: "Issue title", exact: true })
  const updateTitle = (value: string) =>
    page.evaluate((title) => {
      ;(
        window as typeof window & { __linearE2E: { updateTitle: (value: string) => void } }
      ).__linearE2E.updateTitle(title)
    }, value)
  await updateTitle("Updated elsewhere")
  await expect(title).toHaveValue("Updated elsewhere")
  await title.fill("Local edit")
  const fetchCount = (await getIpcRequests(page, "getIssue")).length
  await updateTitle("New remote title")
  await expect
    .poll(async () => (await getIpcRequests(page, "getIssue")).length)
    .toBeGreaterThan(fetchCount)
  await expect(title).toHaveValue("Local edit")
  await title.press("Escape")
  await expect(title).toHaveValue("New remote title")
  expect(await getIpcRequests(page, "linearUpdateIssue")).toHaveLength(0)
  await harness.assertClean()
})

test("keeps deleted issue titles read-only", async ({ page }) => {
  const harness = await openIssueWebview(page, { initialDescription: "Body", trashed: true })
  await expect(page.getByRole("textbox", { name: "Issue title", exact: true })).not.toBeEditable()
  expect(await getIpcRequests(page, "linearUpdateIssue")).toHaveLength(0)
  await harness.assertClean()
})
