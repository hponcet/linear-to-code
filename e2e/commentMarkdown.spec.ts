import { readFileSync } from "fs"
import { resolve } from "path"

import { expect, test } from "@playwright/test"

import { getIpcRequests, openIssueWebview } from "./support/issueWebview"

import type { Locator, Page } from "@playwright/test"

const pixel =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII="
const imageUrl = `data:image/png;base64,${pixel}`
const richComment = `${readFileSync(
  resolve("src/test/fixtures/linearMarkdown/des-538-comment.graphql.md"),
  "utf8",
)
  .trimEnd()
  .replace("https://linear.app/favicon.ico", imageUrl)}\n\n\`\`\`ts\nconst comment = true\n\`\`\``
const canonicalRichComment = richComment.replace(
  `- [x] Done\n\n| A | B |\n| --- | --- |\n| One | Two |\n\n![Image](${imageUrl})`,
  `- [x] Done\n\n\n| A   | B   |\n| --- | --- |\n| One | Two |\n\n\n![Image](<${imageUrl}>)`,
)
const viewer = {
  id: "user-e2e",
  displayName: "E2E User",
  name: "E2E User",
  email: "e2e@example.com",
  active: true,
}
const timestamp = "2026-01-01T00:00:00.000Z"

async function waitForRequest(page: Page, type: string, previousCount = 0) {
  await expect.poll(async () => (await getIpcRequests(page, type)).length).toBe(previousCount + 1)
  return (await getIpcRequests(page, type)).at(-1)!
}

async function clickCommentAction(comment: Locator, name: "Reply" | "Edit" | "Delete") {
  await comment.locator(".issueComment").first().hover()
  await comment
    .locator(".issueCommentActions")
    .first()
    .getByRole("button", { name, exact: true })
    .click()
}

async function confirmCommentDeletion(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Delete Comment" })
  await expect(dialog).toBeVisible()
  await dialog.getByRole("button", { name: "Delete", exact: true }).click()
}

async function pasteMarkdown(editor: Locator, markdown: string) {
  await editor.focus()
  await editor.evaluate((element, text) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData("text/plain", text)
    element.dispatchEvent(
      new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }),
    )
  }, markdown)
}

test("renders and runs the full lifecycle of a rich issue comment", async ({ page }) => {
  const harness = await openIssueWebview(page, {
    initialDescription: "The issue description uses a separate editor.",
    initialComments: [
      {
        id: "comment-e2e-root",
        body: richComment,
        userId: viewer.id,
        parentId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    viewer,
  })
  const group = page.locator(".issueCommentGroup").first()
  const reader = page.getByRole("document", { name: "Comment by E2E User" })

  await expect(
    reader.getByRole("heading", { name: "Linear Markdown comment corpus" }),
  ).toBeVisible()
  await expect(reader.locator("strong")).toHaveText("bold")
  await expect(reader.locator("em")).toHaveText("italic")
  await expect(reader.locator("s")).toHaveText("strike")
  await expect(reader.locator('ul[data-type="taskList"]')).toHaveCount(1)
  await expect(reader.locator('input[type="checkbox"]')).toHaveCount(2)
  await expect(reader.getByRole("table")).toBeVisible()
  await expect(reader.getByRole("img", { name: "Image" })).toBeVisible()
  await expect(reader.locator('[data-type="details"]')).toHaveCount(1)
  await expect(reader.getByRole("img", { name: "Mermaid diagram" })).toBeVisible()
  await expect(reader.getByRole("code").filter({ hasText: "const comment = true" })).toBeVisible()

  await clickCommentAction(group, "Edit")
  const editor = page.getByRole("textbox", { name: "Edit comment" })
  const heading = editor.getByRole("heading", { name: "Linear Markdown comment corpus" })
  await heading.click()
  await page.keyboard.press("End")
  await page.keyboard.insertText(" edited")
  await group.getByRole("button", { name: "Save", exact: true }).click()

  const update = await waitForRequest(page, "updateComment")
  expect(update.commentId).toBe("comment-e2e-root")
  expect(update.body).toBe(
    canonicalRichComment.replace(
      "# Linear Markdown comment corpus",
      "# Linear Markdown comment corpus edited",
    ),
  )
  await expect(
    page.getByRole("heading", { name: "Linear Markdown comment corpus edited" }),
  ).toBeVisible()

  await clickCommentAction(group, "Delete")
  await confirmCommentDeletion(page)
  const deletion = await waitForRequest(page, "deleteComment")
  expect(deletion.commentId).toBe("comment-e2e-root")
  await expect(page.locator(".issueCommentGroup")).toHaveCount(0)

  const newComment = page.getByRole("textbox", { name: "New issue comment" })
  await pasteMarkdown(newComment, richComment)
  await page.locator(".commentActions button").click()
  const recreation = await waitForRequest(page, "createComment")
  expect(recreation).toMatchObject({
    issueId: "issue-e2e",
    body: canonicalRichComment,
  })
  expect(recreation.parentId).toBeUndefined()
  await expect(page.getByRole("document", { name: "Comment by E2E User" })).toBeVisible()

  await harness.assertClean()
})

test("creates, edits, deletes, and recreates a comment reply", async ({ page }) => {
  const harness = await openIssueWebview(page, {
    initialDescription: "Description.",
    initialComments: [
      {
        id: "comment-e2e-root",
        body: "Root comment.",
        userId: viewer.id,
        parentId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    viewer,
  })
  const group = page.locator(".issueCommentGroup").first()

  await clickCommentAction(group, "Reply")
  const replyEditor = page.getByRole("textbox", { name: "Reply to comment" })
  await replyEditor.pressSequentially("Initial **reply**.")
  await group.locator(".issueCommentReplyActions button").click()

  const creation = await waitForRequest(page, "createComment")
  expect(creation).toMatchObject({
    issueId: "issue-e2e",
    parentId: "comment-e2e-root",
    body: "Initial **reply**.",
  })
  const child = group.locator(".issueCommentWrapper").nth(1)
  await expect(child.getByRole("document", { name: "Comment by E2E User" })).toBeVisible()

  await clickCommentAction(child, "Edit")
  const childEditor = child.getByRole("textbox", { name: "Edit comment" })
  const childParagraph = childEditor.locator("p")
  await childParagraph.click()
  await page.keyboard.press("End")
  await page.keyboard.insertText(" Edited.")
  await child.getByRole("button", { name: "Save", exact: true }).click()
  const update = await waitForRequest(page, "updateComment")
  expect(update).toMatchObject({
    commentId: "comment-e2e-created-1",
    body: "Initial **reply**. Edited.",
  })

  await clickCommentAction(child, "Delete")
  await confirmCommentDeletion(page)
  const deletion = await waitForRequest(page, "deleteComment")
  expect(deletion.commentId).toBe("comment-e2e-created-1")
  await expect(group.locator(".issueCommentWrapper")).toHaveCount(1)

  await replyEditor.pressSequentially("Recreated reply.")
  await group.locator(".issueCommentReplyActions button").click()
  const recreation = await waitForRequest(page, "createComment", 1)
  expect(recreation).toMatchObject({
    issueId: "issue-e2e",
    parentId: "comment-e2e-root",
    body: "Recreated reply.",
  })
  await expect(group.locator(".issueCommentWrapper")).toHaveCount(2)

  await harness.assertClean()
})

test("uses the shared Markdown pipeline before a mocked sub-issue creation", async ({ page }) => {
  const harness = await openIssueWebview(page, "Description.")

  await page.getByRole("button", { name: "Add sub-issues" }).click()
  await page
    .locator(".createSubIssueContainer")
    .getByPlaceholder("Issue title")
    .fill("Mocked sub-issue")
  const description = page.getByRole("textbox", { name: "Sub-issue description" })
  await description.pressSequentially("Sub-issue with **Markdown**.")
  await page.getByRole("button", { name: "Create", exact: true }).click()

  const creation = await waitForRequest(page, "createSubIssue")
  expect(creation).toMatchObject({
    parentId: "issue-e2e",
    teamId: "team-e2e",
    fields: {
      title: "Mocked sub-issue",
      description: "Sub-issue with **Markdown**.",
    },
  })
  await harness.assertClean()
})
