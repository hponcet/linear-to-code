import { expect, test } from "@playwright/test"

import { getIpcRequests, openIssueWebview } from "./support/issueWebview"

import type { IssueWebviewOptions, IssueWebviewHarness } from "./support/issueWebview"
import type { Locator, Page } from "@playwright/test"

const viewer = {
  id: "reader-user-e2e",
  displayName: "Reader User",
  name: "Reader User",
  email: "reader@example.com",
  active: true,
}
const timestamp = "2026-01-01T00:00:00.000Z"
const mutationRequestTypes = new Set([
  "linearUpdateIssue",
  "createComment",
  "updateComment",
  "deleteComment",
  "createSubIssue",
])
const pixel =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII="
const dataImage = `data:image/png;base64,${pixel}`

type ReaderOptions = Omit<IssueWebviewOptions, "initialDescription" | "initialComments" | "viewer">

async function openCommentReader(
  page: Page,
  body: string,
  options: ReaderOptions = {},
): Promise<{ harness: IssueWebviewHarness; reader: Locator }> {
  const harness = await openIssueWebview(page, {
    initialDescription: "Reader E2E fixture.",
    initialComments: [
      {
        id: "reader-comment-e2e",
        body,
        userId: viewer.id,
        parentId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    viewer,
    ...options,
  })
  const reader = page.getByRole("document", { name: "Comment by Reader User" })

  await expect(reader).toBeVisible()
  await expect(reader).toHaveAttribute("contenteditable", "false")
  await expect(reader).not.toHaveAttribute("aria-multiline", "true")
  await expect(page.getByRole("textbox", { name: "Comment by Reader User" })).toHaveCount(0)

  return { harness, reader }
}

async function expectNoContentMutation(page: Page) {
  const requests = await getIpcRequests(page)
  expect(requests.filter(({ type }) => mutationRequestTypes.has(type))).toEqual([])
}

test("renders and uses the complete read-only text, block, list, table, details, and reference matrix", async ({
  page,
}) => {
  const namedLink = "https://example.com/path_(one)?q=a%20b"
  const mailLink = "mailto:reader@example.com"
  const projectReference = "https://linear.app/e2e/project/project-ref"
  const body = `# Heading 1

## Heading 2

### Heading 3

#### Heading 4

##### Heading 5

###### Heading 6

Paragraph with **bold**, *italic*, ~~strike~~, \`inline code\`, [named link](<${namedLink}>), and [email](<${mailLink}>).

First visual line
Second visual line

> Outer quote
>
> > Nested quote

---

* Bullet parent
  * Bullet child
* Bullet tail

3. Ordered third
   1. Ordered child
4. Ordered fourth

- [ ] Open task
  - [x] Nested done task
- [X] Done task

| Feature | Rich value | Empty |
| --- | --- | --- |
| Marks | **bold cell** and \`code cell\` | |
| Link | [cell link](<https://example.com/cell>) | value |

>>> Outer details

Outer **details body**.

+++ Inner details

Nested details body.

+++

>>>

Date: 2026-09-01. Emoji: 🧪🚀.

User: <user id="11111111-1111-4111-8111-111111111111">reader.user</user>

Issue: <issue id="22222222-2222-4222-8222-222222222222" href="https://linear.app/e2e/issue/E2E-2/reference">E2E-2</issue>

Project: ${projectReference}

Document: https://linear.app/e2e/document/document-ref

Cycle: https://linear.app/e2e/cycle/cycle-ref

Milestone: https://linear.app/e2e/project-milestone/milestone-ref

View: https://linear.app/e2e/view/view-ref

Initiative: https://linear.app/e2e/initiative/initiative-ref`
  const { harness, reader } = await openCommentReader(page, body)

  for (let level = 1; level <= 6; level += 1) {
    await expect(reader.getByRole("heading", { level, name: `Heading ${level}` })).toBeVisible()
  }
  await expect(reader.locator("strong").filter({ hasText: "bold" }).first()).toBeVisible()
  await expect(reader.locator("em").filter({ hasText: "italic" })).toBeVisible()
  await expect(reader.locator("s")).toHaveText("strike")
  await expect(reader.getByRole("code").filter({ hasText: "inline code" })).toBeVisible()

  const visualLines = reader.locator("p").filter({ hasText: "First visual line" })
  await expect(visualLines.locator("br")).toHaveCount(1)
  await expect(reader.locator("blockquote")).toHaveCount(2)
  await expect(reader.getByRole("separator")).toHaveCount(1)

  await expect(reader.locator('ul:not([data-type="taskList"])')).toHaveCount(2)
  await expect(reader.locator("ol")).toHaveCount(2)
  await expect(reader.locator("ol").first()).toHaveAttribute("start", "3")
  const taskCheckboxes = reader.locator('input[type="checkbox"]')
  await expect(taskCheckboxes).toHaveCount(3)
  await expect(taskCheckboxes.nth(0)).toBeDisabled()
  await expect(taskCheckboxes.nth(0)).not.toBeChecked()
  await expect(taskCheckboxes.nth(1)).toBeChecked()
  await expect(taskCheckboxes.nth(2)).toBeChecked()
  await expect(taskCheckboxes.nth(0)).toHaveAttribute(
    "aria-label",
    "Task item checkbox for Open task",
  )

  const table = reader.getByRole("table")
  await expect(table).toBeVisible()
  await expect(table.getByRole("columnheader", { name: "Feature" })).toBeVisible()
  const richCell = table.getByRole("cell").filter({ hasText: "bold cell" })
  await expect(richCell.locator("strong")).toHaveText("bold cell")
  await expect(richCell.getByRole("code")).toHaveText("code cell")
  await expect(table.getByRole("link", { name: "cell link" })).toHaveAttribute(
    "href",
    "https://example.com/cell",
  )
  await expect(table.getByRole("row").nth(1).getByRole("cell").last()).toHaveText("")

  const outerToggle = reader.getByRole("button", { name: "Expand details" })
  await expect(outerToggle).toHaveAttribute("aria-expanded", "false")
  await outerToggle.click()
  await expect(reader.getByRole("button", { name: "Collapse details" })).toHaveAttribute(
    "aria-expanded",
    "true",
  )
  const innerToggle = reader.getByRole("button", { name: "Expand details" })
  await innerToggle.click()
  await expect(reader.getByText("Nested details body.", { exact: true })).toBeVisible()

  await expect(reader).toContainText("Date: 2026-09-01. Emoji: 🧪🚀.")
  const mentions = reader.locator('[data-type="mention"]')
  await expect(mentions).toHaveCount(8)
  for (const kind of [
    "user",
    "issue",
    "project",
    "document",
    "cycle",
    "milestone",
    "view",
    "initiative",
  ]) {
    await expect(reader.locator(`[data-type="mention"][data-kind="${kind}"]`)).toHaveCount(1)
  }

  const initialPageUrl = page.url()
  await reader.getByRole("link", { name: "named link" }).click()
  await reader.getByRole("link", { name: "email" }).click()
  await reader.locator('[data-type="mention"][data-kind="project"]').click()
  await expect.poll(async () => (await getIpcRequests(page, "openExternalUrl")).length).toBe(3)
  expect(await getIpcRequests(page, "openExternalUrl")).toMatchObject([
    { type: "openExternalUrl", url: namedLink },
    { type: "openExternalUrl", url: mailLink },
    { type: "openExternalUrl", url: projectReference },
  ])
  expect(page.url()).toBe(initialPageUrl)

  await expectNoContentMutation(page)
  await harness.assertClean()
})

test("renders remote and data images in the reader with accessible alternatives", async ({
  page,
}) => {
  const remoteUrl = "https://images.example.test/reader.png"
  const { harness, reader } = await openCommentReader(
    page,
    `![Remote reader image](<${remoteUrl}>)\n\n![Data reader image](<${dataImage}>)`,
    {
      uploadAsset: { url: remoteUrl, contentType: "image/png", bodyBase64: pixel },
    },
  )

  await expect(reader.getByRole("img", { name: "Remote reader image" })).toBeVisible()
  await expect(reader.getByRole("img", { name: "Data reader image" })).toBeVisible()
  await expect(reader.getByRole("img", { name: "Remote reader image" })).toHaveAttribute(
    "src",
    remoteUrl,
  )
  await expect(reader.getByRole("img", { name: "Data reader image" })).toHaveAttribute(
    "src",
    dataImage,
  )

  await expectNoContentMutation(page)
  await harness.assertClean()
})

test("loads a private Linear image through the authenticated reader path", async ({ page }) => {
  const canonicalUrl = "https://uploads.linear.app/e2e/private-reader.png"
  const { harness, reader } = await openCommentReader(
    page,
    `![Private reader image](<${canonicalUrl}?signature=stale-fixture>)`,
    {
      uploadAsset: { url: canonicalUrl, contentType: "image/png", bodyBase64: pixel },
    },
  )
  const image = reader.getByRole("img", { name: "Private reader image" })

  await expect(image).toBeVisible()
  await expect(image).toHaveAttribute("src", /^blob:/)
  await expect(reader.getByRole("status", { name: "Loading image…" })).toHaveCount(0)
  expect(await getIpcRequests(page, "downloadLinearAsset")).toMatchObject([{ url: canonicalUrl }])

  await expectNoContentMutation(page)
  await harness.assertClean()
})

test("renders and exposes native controls for an audio embed", async ({ page }) => {
  const url = "https://uploads.linear.app/e2e/reader.wav"
  const body = `<linear-embed node-type="audio">{"uploadState":"finished","uploadId":null,"src":"${url}","title":"reader.wav","size":44,"mimetype":"audio/wav","controls":true}</linear-embed>`
  const { harness, reader } = await openCommentReader(page, body, {
    uploadAsset: {
      url,
      contentType: "audio/wav",
      bodyBase64: "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
    },
  })
  const audio = reader.locator('audio[aria-label="reader.wav"]')

  await expect(audio).toBeVisible()
  await expect(audio).toHaveAttribute("controls", "")
  await expect(audio).toHaveAttribute("preload", "metadata")
  expect(await getIpcRequests(page, "downloadLinearAsset")).toMatchObject([{ url }])

  await expectNoContentMutation(page)
  await harness.assertClean()
})

test("renders and exposes native controls for a video embed", async ({ page }) => {
  const url = "https://uploads.linear.app/e2e/reader.mp4"
  const body = `<linear-embed node-type="video">{"uploadState":"finished","uploadId":null,"src":"${url}","title":"reader.mp4","size":1,"mimetype":"video/mp4","controls":true,"height":null,"width":null,"metadataId":null}</linear-embed>`
  const { harness, reader } = await openCommentReader(page, body, {
    uploadAsset: {
      url,
      contentType: "video/mp4",
      bodyBase64: "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=",
    },
  })

  await expect(reader.getByRole("group", { name: "reader.mp4" })).toBeVisible()
  await expect(reader.locator("video[controls]")).toBeVisible()
  expect(await getIpcRequests(page, "downloadLinearAsset")).toMatchObject([{ url }])

  await expectNoContentMutation(page)
  await harness.assertClean()
})

test("renders and downloads a private file without treating it as an external link", async ({
  page,
}) => {
  const url = "https://uploads.linear.app/e2e/reader.pdf"
  const body = `<linear-embed node-type="file">{"uploadState":"finished","href":"${url}?signature=stale-fixture","name":"reader.pdf","size":18,"mimetype":"application/pdf"}</linear-embed>`
  const { harness, reader } = await openCommentReader(page, body, {
    uploadAsset: {
      url,
      contentType: "application/pdf",
      bodyBase64: Buffer.from("Reader PDF fixture").toString("base64"),
    },
  })
  const file = reader.getByRole("button", { name: "Download reader.pdf" })

  await expect(file).toBeVisible()
  const downloadPromise = page.waitForEvent("download")
  await file.click()
  expect((await downloadPromise).suggestedFilename()).toBe("reader.pdf")
  expect(await getIpcRequests(page, "openExternalUrl")).toEqual([])

  await expectNoContentMutation(page)
  await harness.assertClean()
})

function getYouTubeEmbedUrl(id: string): string {
  const query = new URLSearchParams({
    playsinline: "1",
    preload: "metadata",
    enablejsapi: "1",
    cc_load_policy: "1",
    showinfo: "0",
    rel: "0",
    iv_load_policy: "3",
    modestbranding: "1",
  })
  return `https://www.youtube.com/embed/${id}?${query}`
}

test("renders sandboxed YouTube and Loom readers without real provider traffic", async ({
  page,
}) => {
  const youtubeUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  const youtubeEmbedUrl = getYouTubeEmbedUrl("dQw4w9WgXcQ")
  const loomUrl = "https://www.loom.com/share/reader_loom_123"
  const loomEmbedUrl = "https://www.loom.com/embed/reader_loom_123"
  const { harness, reader } = await openCommentReader(
    page,
    `![](<${youtubeUrl}>)\n\n![](<${loomUrl}>)`,
    {
      mockEmbedDocuments: [youtubeEmbedUrl, loomEmbedUrl],
      mockMediaRequests: [youtubeUrl, loomUrl],
      mockYouTubeIframeApi: true,
    },
  )
  const youtubeFrame = reader.locator("youtube-video iframe")
  const loomFrame = reader.locator('iframe[title="Loom video"]')

  await expect(reader.getByRole("group", { name: "Video" })).toHaveCount(2)
  await expect(youtubeFrame).toHaveAttribute("src", youtubeEmbedUrl)
  await expect(loomFrame).toHaveAttribute("src", loomEmbedUrl)
  await expect(loomFrame).toHaveAttribute(
    "sandbox",
    "allow-same-origin allow-scripts allow-presentation",
  )
  await expect
    .poll(() => Promise.resolve(harness.mockedEmbedRequests))
    .toEqual(
      expect.arrayContaining([youtubeEmbedUrl, loomEmbedUrl, "https://www.youtube.com/iframe_api"]),
    )

  await expectNoContentMutation(page)
  await harness.assertClean()
})

const codeCases = [
  { language: "", source: "plain reader code" },
  { language: "javascript", source: "const javascriptReader = true" },
  { language: "typescript", source: "const typescriptReader: boolean = true" },
  { language: "tsx", source: "const Reader = () => <div />" },
  { language: "graphql", source: "query Reader { viewer { id } }" },
  { language: "json", source: '{"reader":true}' },
  { language: "bash", source: "echo reader" },
  { language: "markdown", source: "# Reader code heading" },
  { language: "css", source: ".reader { color: blue; }" },
  { language: "xml", source: "<reader />" },
  { language: "unknown", source: "reader raw syntax" },
] as const

test("renders every configured code language plus valid and invalid Mermaid", async ({ page }) => {
  const validMermaid = "flowchart LR\n  Reader --> Linear"
  const invalidMermaid = "flowchart LR\n  Reader -->"
  const body = `${codeCases
    .map(({ language, source }) => `\`\`\`${language}\n${source}\n\`\`\``)
    .join(
      "\n\n",
    )}\n\n\`\`\`mermaid\n${validMermaid}\n\`\`\`\n\n\`\`\`mermaid\n${invalidMermaid}\n\`\`\``
  const { harness, reader } = await openCommentReader(page, body)

  await expect(reader.locator(".linear-code-block")).toHaveCount(codeCases.length + 2)
  for (const { language, source } of codeCases) {
    const block = reader.locator(".linear-code-block").filter({ hasText: source })
    await expect(block.getByRole("code")).toHaveText(source)
    if (language) await expect(block).toHaveAttribute("data-language", language)
    else await expect(block).not.toHaveAttribute("data-language")
  }

  await expect(reader.getByRole("img", { name: "Mermaid diagram" })).toBeVisible()
  const invalidBlock = reader.locator(".linear-code-block").filter({ hasText: invalidMermaid })
  await expect(invalidBlock.locator(".linear-mermaid-error")).toBeVisible()
  await expect(invalidBlock.getByRole("code")).toHaveText(invalidMermaid)

  await expectNoContentMutation(page)
  await harness.assertClean()
})
