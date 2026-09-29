import { expect, test } from "@playwright/test"

import {
  getDescriptionUpdates,
  openIssueWebview,
  waitForDescriptionUpdate,
} from "./support/issueWebview"

import type { Locator, Page } from "@playwright/test"

const SELECT_ALL = process.platform === "darwin" ? "Meta+A" : "Control+A"
const UNDO = process.platform === "darwin" ? "Meta+Z" : "Control+Z"
const REDO = process.platform === "darwin" ? "Meta+Shift+Z" : "Control+Shift+Z"
const DOCUMENT_END = process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End"

async function expectDescription(
  page: Page,
  previousCount: number,
  expected: string,
): Promise<number> {
  const updates = await waitForDescriptionUpdate(page, previousCount)
  const actual = updates.at(-1)?.fields.description
  expect(actual, `Latest description update: ${JSON.stringify(actual)}`).toBe(expected)
  return updates.length
}

async function clearDescription(
  page: Page,
  editor: Locator,
  previousCount: number,
): Promise<number> {
  await editor.press(SELECT_ALL)
  await editor.press("Backspace")
  await expect(editor).toHaveText("")
  return expectDescription(page, previousCount, "")
}

test("renders, edits, deletes, and recreates a blockquote with its input rule", async ({
  page,
}) => {
  const initial = "> Original quote."
  const edited = "> Original quote. Edited."
  const recreated = "> Recreated quote."
  const harness = await openIssueWebview(page, initial)
  const editor = page.getByRole("textbox", { name: "Issue description" })
  const quote = editor.locator("blockquote")

  await expect(quote).toHaveText("Original quote.")

  await quote.locator("p").click()
  await page.keyboard.press("End")
  await page.keyboard.insertText(" Edited.")
  let updateCount = await expectDescription(page, 0, edited)

  updateCount = await clearDescription(page, editor, updateCount)

  await editor.pressSequentially("> ")
  await editor.pressSequentially("Recreated quote.")
  await expectDescription(page, updateCount, recreated)
  await expect(editor.locator("blockquote")).toHaveText("Recreated quote.")

  expect(await getDescriptionUpdates(page)).toHaveLength(3)
  await harness.assertClean()
})

test("renders, edits, deletes, and recreates a divider with its input rule", async ({ page }) => {
  const initial = "Before divider.\n\n---\n\nAfter divider."
  const edited = "Before divider.\n\n---\n\nAfter divider. Edited."
  const recreated = "---\n\nRecreated after divider."
  const harness = await openIssueWebview(page, initial)
  const editor = page.getByRole("textbox", { name: "Issue description" })

  await expect(editor.locator("hr")).toHaveCount(1)

  await editor.getByText("After divider.", { exact: true }).click()
  await page.keyboard.press("End")
  await page.keyboard.insertText(" Edited.")
  let updateCount = await expectDescription(page, 0, edited)

  updateCount = await clearDescription(page, editor, updateCount)

  await editor.pressSequentially("---")
  await editor.pressSequentially("Recreated after divider.")
  await expectDescription(page, updateCount, recreated)
  await expect(editor.locator("hr")).toHaveCount(1)

  expect(await getDescriptionUpdates(page)).toHaveLength(3)
  await harness.assertClean()
})

test("renders, edits, deletes, and recreates a nested bulleted list with its input rule", async ({
  page,
}) => {
  const initial = "* Parent\n  * Nested\n* Tail"
  const edited = "- Parent\n  - Nested edited\n- Tail"
  const recreated = "- Recreated parent\n  - Recreated nested"
  const harness = await openIssueWebview(page, initial)
  const editor = page.getByRole("textbox", { name: "Issue description" })

  await expect(editor.locator("ul")).toHaveCount(2)

  await editor.getByText("Nested", { exact: true }).click()
  await page.keyboard.press("End")
  await page.keyboard.insertText(" edited")
  let updateCount = await expectDescription(page, 0, edited)

  updateCount = await clearDescription(page, editor, updateCount)

  await editor.pressSequentially("* ")
  await editor.pressSequentially("Recreated parent")
  await editor.press("Enter")
  await editor.press("Tab")
  await editor.pressSequentially("Recreated nested")
  await expectDescription(page, updateCount, recreated)
  await expect(editor.locator("ul")).toHaveCount(2)

  expect(await getDescriptionUpdates(page)).toHaveLength(3)
  await harness.assertClean()
})

test("renders, edits, deletes, and recreates Linear-indented links in a list item", async ({
  page,
}) => {
  const firstUrl = "https://example.com/first/file.ts"
  const secondUrl = "https://example.com/second/file.ts"
  const source = `* repository:\n    [first/file.ts](<${firstUrl}>)\n    [second/file.ts](<${secondUrl}>)`
  const canonical = (label: string) =>
    `- ${label}\n[first/file.ts](<${firstUrl}>)\n[second/file.ts](<${secondUrl}>)`
  const harness = await openIssueWebview(page, source)
  const editor = page.getByRole("textbox", { name: "Issue description" })

  await expect(editor.locator("ul")).toHaveCount(1)
  await expect(editor.getByRole("link", { name: "first/file.ts" })).toHaveAttribute(
    "href",
    firstUrl,
  )
  await expect(editor.getByRole("link", { name: "second/file.ts" })).toHaveAttribute(
    "href",
    secondUrl,
  )

  await editor
    .locator("li p")
    .first()
    .evaluate((paragraph) => {
      const text = paragraph.firstChild
      if (!text) throw new Error("Missing list label")
      const range = document.createRange()
      range.setStart(text, text.textContent?.length ?? 0)
      range.collapse(true)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      ;(paragraph.closest('[contenteditable="true"]') as HTMLElement | null)?.focus()
    })
  await page.keyboard.insertText(" edited")
  let updateCount = await expectDescription(page, 0, canonical("repository: edited"))

  updateCount = await clearDescription(page, editor, updateCount)

  await editor.evaluate((element, markdown) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData("text/plain", markdown)
    element.dispatchEvent(
      new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }),
    )
  }, source)
  await expectDescription(page, updateCount, canonical("repository:"))
  await expect(editor.getByRole("link")).toHaveCount(2)

  expect(await getDescriptionUpdates(page)).toHaveLength(3)
  await harness.assertClean()
})

test("renders, edits, deletes, and recreates a nested ordered list with its start number", async ({
  page,
}) => {
  const initial = "3. Third\n   1. Nested\n4. Fourth"
  const edited = "3. Third\n  1. Nested edited\n4. Fourth"
  const recreated = "3. Recreated third\n  1. Recreated nested"
  const harness = await openIssueWebview(page, initial)
  const editor = page.getByRole("textbox", { name: "Issue description" })

  await expect(editor.locator("ol")).toHaveCount(2)
  await expect(editor.locator("ol").first()).toHaveAttribute("start", "3")

  await editor.getByText("Nested", { exact: true }).click()
  await page.keyboard.press("End")
  await page.keyboard.insertText(" edited")
  let updateCount = await expectDescription(page, 0, edited)

  updateCount = await clearDescription(page, editor, updateCount)

  await editor.pressSequentially("3. ")
  await editor.pressSequentially("Recreated third")
  await editor.press("Enter")
  await editor.press("Tab")
  await editor.pressSequentially("Recreated nested")
  await expectDescription(page, updateCount, recreated)
  await expect(editor.locator("ol")).toHaveCount(2)
  await expect(editor.locator("ol").first()).toHaveAttribute("start", "3")

  expect(await getDescriptionUpdates(page)).toHaveLength(3)
  await harness.assertClean()
})

test("renders, checks, deletes, and recreates a nested checklist with its input rule", async ({
  page,
}) => {
  const initial = "- [ ] Open\n  - [x] Nested\n- [X] Done"
  const edited = "- [x] Open\n  - [x] Nested\n- [x] Done"
  const recreated = "- [ ] Recreated open\n  - [ ] Recreated nested"
  const harness = await openIssueWebview(page, initial)
  const editor = page.getByRole("textbox", { name: "Issue description" })

  await expect(editor.locator('ul[data-type="taskList"]')).toHaveCount(2)
  const openItem = editor.locator('ul[data-type="taskList"] > li').first()
  const openCheckbox = openItem.locator(':scope > label input[type="checkbox"]')
  await expect(openCheckbox).toHaveAttribute("aria-label", "Task item checkbox for Open")
  await expect(openCheckbox).not.toBeChecked()

  await openItem.locator(":scope > label").click()
  let updateCount = await expectDescription(page, 0, edited)
  await expect(openCheckbox).toBeChecked()

  updateCount = await clearDescription(page, editor, updateCount)

  await editor.pressSequentially("[ ] ")
  await editor.pressSequentially("Recreated open")
  await editor.press("Enter")
  await editor.press("Tab")
  await editor.pressSequentially("Recreated nested")
  await expectDescription(page, updateCount, recreated)
  await expect(editor.locator('ul[data-type="taskList"]')).toHaveCount(2)

  expect(await getDescriptionUpdates(page)).toHaveLength(3)
  await harness.assertClean()
})

const codeBlockCases = [
  { language: "", source: "plain original", recreated: "plain recreated" },
  {
    language: "javascript",
    source: "const original = true",
    recreated: "const recreated = true",
  },
  {
    language: "typescript",
    source: "const original: boolean = true",
    recreated: "const recreated: boolean = true",
  },
  { language: "tsx", source: "const Original = () => <div />", recreated: "<Recreated />" },
  {
    language: "graphql",
    source: "query Original { viewer { id } }",
    recreated: "query Recreated { viewer { name } }",
  },
  { language: "json", source: '{"original":true}', recreated: '{"recreated":true}' },
  { language: "bash", source: "echo original", recreated: "echo recreated" },
  { language: "markdown", source: "# Original", recreated: "# Recreated" },
  {
    language: "css",
    source: ".original { color: red; }",
    recreated: ".recreated { color: blue; }",
  },
  { language: "xml", source: "<original />", recreated: "<recreated />" },
  { language: "unknown", source: "original syntax", recreated: "recreated syntax" },
] as const

for (const { language, source, recreated } of codeBlockCases) {
  const fence = `\`\`\`${language}`
  const initial = `${fence}\n${source}\n\`\`\``
  const edited = `${fence}\n${source} edited\n\`\`\``
  const recreatedMarkdown = `${fence}\n${recreated}\n\`\`\``
  const name = language || "unlabelled"

  test(`renders, edits, deletes, and recreates a ${name} code block`, async ({ page }) => {
    const harness = await openIssueWebview(page, initial)
    const editor = page.getByRole("textbox", { name: "Issue description" })
    const codeBlock = editor.locator(".linear-code-block")
    const code = codeBlock.locator("code")

    await expect(code).toHaveText(source)
    if (language) await expect(codeBlock).toHaveAttribute("data-language", language)

    await code.click()
    await page.keyboard.press(SELECT_ALL)
    await page.keyboard.press("ArrowRight")
    await page.keyboard.insertText(" edited")
    let updateCount = await expectDescription(page, 0, edited)

    updateCount = await clearDescription(page, editor, updateCount)

    await editor.pressSequentially(`${fence} `)
    await editor.pressSequentially(recreated)
    await expectDescription(page, updateCount, recreatedMarkdown)
    await expect(editor.locator(".linear-code-block code")).toHaveText(recreated)

    expect(await getDescriptionUpdates(page)).toHaveLength(3)
    await harness.assertClean()
  })
}

test("renders, edits, deletes, and recreates a Mermaid diagram", async ({ page }) => {
  const initial = "```mermaid\nflowchart LR\n  A --> B\n```"
  const edited = "```mermaid\nflowchart LR\n  A --> B --> C\n```"
  const recreated = "```mermaid\nsequenceDiagram\n  Alice->>Bob: Hello\n```"
  const harness = await openIssueWebview(page, initial)
  const editor = page.getByRole("textbox", { name: "Issue description" })
  const code = editor.locator(".linear-code-block code")

  await expect(page.getByRole("img", { name: "Mermaid diagram" })).toBeVisible()
  // A valid diagram shows its picture, never its source, until the switch is used.
  await expect(code).toBeHidden()

  await page.getByRole("button", { name: "Edit diagram" }).click()
  await expect(code).toBeVisible()
  await expect(page.getByRole("img", { name: "Mermaid diagram" })).toBeHidden()

  // A click in the middle of a multi-line source can land on any line. The source is the whole
  // description, so the end of the document is the end of the source.
  await code.click()
  await page.keyboard.press(DOCUMENT_END)
  await page.keyboard.insertText(" --> C")
  let updateCount = await expectDescription(page, 0, edited)

  await page.getByRole("button", { name: "View diagram" }).click()
  await expect(page.getByRole("img", { name: "Mermaid diagram" })).toBeVisible()
  await expect(code).toBeHidden()

  updateCount = await clearDescription(page, editor, updateCount)

  await editor.pressSequentially("```mermaid ")
  await editor.pressSequentially("sequenceDiagram")
  await editor.press("Enter")
  await editor.pressSequentially("  Alice->>Bob: Hello")
  await expectDescription(page, updateCount, recreated)
  await page.getByRole("button", { name: "View diagram" }).click()
  await expect(page.getByRole("img", { name: "Mermaid diagram" })).toBeVisible()

  expect(await getDescriptionUpdates(page)).toHaveLength(3)
  await harness.assertClean()
})

test("keeps invalid Mermaid source editable through edit, delete, and recreation", async ({
  page,
}) => {
  const initial = "```mermaid\nflowchart LR\n  A -->\n```"
  const edited = "```mermaid\nflowchart LR\n  A --> B\n```"
  const recreated = "```mermaid\nnot a diagram\n```"
  const harness = await openIssueWebview(page, initial)
  const editor = page.getByRole("textbox", { name: "Issue description" })
  const code = editor.locator(".linear-code-block code")

  // A broken diagram has no picture to show, so its source stays open with no switch.
  await expect(editor.locator(".linear-mermaid-error")).toBeVisible()
  await expect(code).toHaveText("flowchart LR\n  A -->")
  await expect(page.getByRole("button", { name: /diagram/ })).toHaveCount(0)
  await expect(page.locator('body > [id^="dlinear-mermaid-"]')).toHaveCount(0)
  await expect(page.getByText("Syntax error in text")).toHaveCount(0)

  // A click in the middle of a multi-line source can land on any line. The source is the whole
  // description, so the end of the document is the end of the source.
  await code.click()
  await page.keyboard.press(DOCUMENT_END)
  await page.keyboard.insertText(" B")
  let updateCount = await expectDescription(page, 0, edited)
  await page.getByRole("button", { name: "View diagram" }).click()
  await expect(page.getByRole("img", { name: "Mermaid diagram" })).toBeVisible()

  updateCount = await clearDescription(page, editor, updateCount)

  await editor.pressSequentially("```mermaid ")
  await editor.pressSequentially("not a diagram")
  await expectDescription(page, updateCount, recreated)
  await expect(editor.locator(".linear-mermaid-error")).toBeVisible()
  await expect(code).toHaveText("not a diagram")

  expect(await getDescriptionUpdates(page)).toHaveLength(3)
  await harness.assertClean()
})

test("emits the document after edit, undo, and redo", async ({ page }) => {
  const initial = "Undo base."
  const edited = "Undo base. Edited."
  const harness = await openIssueWebview(page, initial)
  const editor = page.getByRole("textbox", { name: "Issue description" })

  await expect(editor).toHaveText(initial)

  await editor.press("End")
  await editor.pressSequentially(" Edited.")
  let updateCount = await expectDescription(page, 0, edited)

  await editor.press(UNDO)
  updateCount = await expectDescription(page, updateCount, initial)
  await expect(editor).toHaveText(initial)

  await editor.press(REDO)
  await expectDescription(page, updateCount, edited)
  await expect(editor).toHaveText(edited)

  expect(await getDescriptionUpdates(page)).toHaveLength(3)
  await harness.assertClean()
})

test("keeps a wide image and its selection ring inside the editor's scroll container", async ({
  page,
}) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900"/></svg>`
  const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
  const harness = await openIssueWebview(
    page,
    `> Quoted screenshot:\n>\n> ![Screenshot](${source})`,
  )
  const image = page.locator("blockquote").getByRole("img", { name: "Screenshot" })
  await expect(image).toBeVisible()

  const overflow = await page
    .locator(".simple-editor-wrapper")
    .first()
    .evaluate((wrapper) => wrapper.scrollWidth - wrapper.clientWidth)
  expect(overflow).toBe(0)

  // The selection ring must stay inside the scroll container instead of being clipped by it.
  await image.click()
  await expect(page.locator(".react-renderer.ProseMirror-selectednode")).toBeVisible()
  const ringOverflow = await page
    .locator(".react-renderer.ProseMirror-selectednode > *")
    .evaluate((ring) => {
      const wrapper = ring.closest(".simple-editor-wrapper")!.getBoundingClientRect()
      const box = ring.getBoundingClientRect()
      const style = getComputedStyle(ring)
      const spread = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset)
      return Math.max(box.right + spread - wrapper.right, wrapper.left - (box.left - spread))
    })
  expect(ringOverflow).toBeLessThanOrEqual(0)
  await harness.assertClean()
})
