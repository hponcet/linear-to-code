import { expect, test } from "@playwright/test"

import {
  getDescriptionUpdates,
  getIpcRequests,
  openIssueWebview,
  waitForDescriptionUpdate,
} from "./support/issueWebview"

import type { Locator, Page } from "@playwright/test"

const selectAll = process.platform === "darwin" ? "Meta+A" : "Control+A"

async function clearEditor(editor: Locator) {
  await editor.click()
  await editor.press(selectAll)
  await editor.press("Backspace")
}

async function runSlashCommand(page: Page, editor: Locator, query: string, label: string) {
  await editor.pressSequentially(`/${query}`)
  const list = page.getByRole("listbox", { name: "Editor commands" })
  await expect(list).toBeVisible()
  await list.getByRole("option", { name: label, exact: true }).click()
}

async function expectDescriptionSave(page: Page, previousCount: number, expected: string) {
  const updates = await waitForDescriptionUpdate(page, previousCount)
  expect(updates.at(-1)?.fields.description).toBe(expected)
  return updates.length
}

async function replaceWithMention(page: Page, editor: Locator, query: string, label: string) {
  await clearEditor(editor)
  await editor.pressSequentially(`@${query}`)
  const list = page.getByRole("listbox", { name: "Linear mentions" })
  await expect(list).toBeVisible()
  await list.getByRole("option").filter({ hasText: label }).click()
}

async function pasteMarkdown(editor: Locator, markdown: string) {
  await editor.click()
  await editor.evaluate((element, value) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData("text/plain", value)
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    )
  }, markdown)
}

function canonicalTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, column) =>
    Math.max(3, header.length, ...rows.map((row) => row[column]?.length ?? 0)),
  )
  const line = (cells: string[]) =>
    `| ${cells.map((cell, column) => cell.padEnd(widths[column])).join(" | ")} |`

  return `\n${line(headers)}\n${line(widths.map((width) => "-".repeat(width)))}\n${rows
    .map(line)
    .join("\n")}\n`
}

test("uses, edits, deletes, and recreates a table", async ({ page }) => {
  const initial = "| Name | Value |\n| --- | --- |\n| Alpha | 1 |\n| Beta | 2 |"
  const edited =
    "\n| Name        | Value |\n| ----------- | ----- |\n| Alpha       | 1     |\n| Beta edited | 2     |\n"
  const recreated =
    "\n| First | Second | Third |\n| ----- | ------ | ----- |\n| A     | B      | C     |\n| D     | E      | F     |\n"
  const harness = await openIssueWebview(page, initial)
  const editor = page.getByRole("textbox", { name: "Issue description" })

  await expect(page.getByRole("table")).toBeVisible()
  await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible()

  const beta = page.getByRole("cell", { name: "Beta" })
  await beta.click()
  await page.keyboard.press("End")
  await page.keyboard.type(" edited")
  let count = await expectDescriptionSave(page, 0, edited)

  await page.keyboard.press("Home")
  await page.keyboard.press("Shift+End")
  const controls = page.getByRole("group", { name: "Table controls" })
  await expect(controls).toBeVisible()
  await controls.getByRole("button", { name: "Delete table" }).click()
  count = await expectDescriptionSave(page, count, "")

  await editor.click()
  await runSlashCommand(page, editor, "table", "Table")
  const headers = page.getByRole("columnheader")
  const cells = page.getByRole("cell")
  for (const [index, value] of ["First", "Second", "Third"].entries()) {
    await headers.nth(index).click()
    await page.keyboard.type(value)
  }
  for (const [index, value] of ["A", "B", "C", "D", "E", "F"].entries()) {
    await cells.nth(index).click()
    await page.keyboard.type(value)
  }
  await expectDescriptionSave(page, count, recreated)

  expect(await getDescriptionUpdates(page)).toHaveLength(3)
  expect(
    (await getIpcRequests(page, "setIssueDescriptionDraft")).some(
      ({ value }) => typeof value === "string" && /^\+\+\+\s*\n\s*\n\+\+\+\s*$/.test(value),
    ),
  ).toBe(false)
  await harness.assertClean()
})

const betaAlpha = [
  ["Beta", "2"],
  ["Alpha", "1"],
]
const alphaBeta = [...betaAlpha].reverse()
const tableControlCases = [
  {
    action: "add row",
    selectedRole: "cell",
    selectedName: "Beta",
    button: "Add row",
    expectedHeaders: ["Key", "Value"],
    expectedRows: [betaAlpha[0], ["", ""], betaAlpha[1]],
  },
  {
    action: "delete row",
    selectedRole: "cell",
    selectedName: "Beta",
    button: "Delete row",
    expectedHeaders: ["Key", "Value"],
    expectedRows: [betaAlpha[1]],
  },
  {
    action: "move row up",
    selectedRole: "cell",
    selectedName: "Alpha",
    button: "Move row up",
    expectedHeaders: ["Key", "Value"],
    expectedRows: alphaBeta,
  },
  {
    action: "move row down",
    selectedRole: "cell",
    selectedName: "Beta",
    button: "Move row down",
    expectedHeaders: ["Key", "Value"],
    expectedRows: alphaBeta,
  },
  {
    action: "sort ascending",
    selectedRole: "cell",
    selectedName: "Beta",
    button: "Sort ascending",
    expectedHeaders: ["Key", "Value"],
    expectedRows: alphaBeta,
  },
  {
    action: "sort descending",
    selectedRole: "cell",
    selectedName: "Alpha",
    button: "Sort descending",
    initialRows: alphaBeta,
    expectedHeaders: ["Key", "Value"],
    expectedRows: betaAlpha,
  },
  {
    action: "add column",
    selectedRole: "cell",
    selectedName: "2",
    button: "Add column",
    expectedHeaders: ["Key", "Value", ""],
    expectedRows: betaAlpha.map((row) => [...row, ""]),
  },
  {
    action: "delete column",
    selectedRole: "columnheader",
    selectedName: "Value",
    button: "Delete column",
    expectedHeaders: ["Key"],
    expectedRows: betaAlpha.map(([key]) => [key]),
  },
  {
    action: "move column left",
    selectedRole: "columnheader",
    selectedName: "Value",
    button: "Move column left",
    expectedHeaders: ["Value", "Key"],
    expectedRows: betaAlpha.map(([key, value]) => [value, key]),
  },
  {
    action: "move column right",
    selectedRole: "columnheader",
    selectedName: "Key",
    button: "Move column right",
    expectedHeaders: ["Value", "Key"],
    expectedRows: betaAlpha.map(([key, value]) => [value, key]),
  },
] as const

for (const tableCase of tableControlCases) {
  test(`uses the exposed table ${tableCase.action} control`, async ({ page }) => {
    const initialRows = "initialRows" in tableCase ? tableCase.initialRows : betaAlpha
    const harness = await openIssueWebview(
      page,
      canonicalTable(["Key", "Value"], initialRows).trim(),
    )
    const selectedCell = page.getByRole(tableCase.selectedRole, { name: tableCase.selectedName })

    await selectedCell.click({ position: { x: 4, y: 4 } })
    await page.keyboard.press("Shift+ArrowRight")
    const controls = page.getByRole("group", { name: "Table controls" })
    await expect(controls).toBeVisible()
    await controls.getByRole("button", { name: tableCase.button }).click()
    await expectDescriptionSave(
      page,
      0,
      canonicalTable(
        [...tableCase.expectedHeaders],
        tableCase.expectedRows.map((row) => [...row]),
      ),
    )

    expect(await getDescriptionUpdates(page)).toHaveLength(1)
    await harness.assertClean()
  })
}

test("navigates table cells with Tab and Shift+Tab", async ({ page }) => {
  const harness = await openIssueWebview(page, canonicalTable(["Key", "Value"], betaAlpha).trim())

  await page.getByRole("columnheader", { name: "Key" }).click()
  await page.keyboard.press("Tab")
  await expect
    .poll(() =>
      page.evaluate(
        () => window.getSelection()?.anchorNode?.parentElement?.closest("th, td")?.textContent,
      ),
    )
    .toBe("Value")
  await page.keyboard.press("Shift+Tab")
  await expect
    .poll(() =>
      page.evaluate(
        () => window.getSelection()?.anchorNode?.parentElement?.closest("th, td")?.textContent,
      ),
    )
    .toBe("Key")

  expect(await getDescriptionUpdates(page)).toEqual([])
  await harness.assertClean()
})

test("uses, edits, deletes, and recreates a collapsible section", async ({ page }) => {
  const initial = "+++ Summary\n\nBody.\n\n+++"
  const edited = "+++ Summary edited\n\nBody edited.\n\n+++"
  const recreated = "+++ Recreated\n\nRecreated body.\n\n+++"
  const harness = await openIssueWebview(page, initial)
  const editor = page.getByRole("textbox", { name: "Issue description" })
  const toggle = page.getByRole("button", { name: "Expand details" })

  await toggle.click()
  await expect(page.getByRole("button", { name: "Collapse details" })).toHaveAttribute(
    "aria-expanded",
    "true",
  )
  await expect(page.getByText("Body.", { exact: true })).toBeVisible()

  const summary = page.getByText("Summary", { exact: true })
  await summary.click({ clickCount: 3 })
  await page.keyboard.type("Summary edited")
  const body = page.locator('[data-type="detailsContent"] p')
  await body.click({ clickCount: 3 })
  await page.keyboard.type("Body edited.")
  let count = await expectDescriptionSave(page, 0, edited)

  await clearEditor(editor)
  count = await expectDescriptionSave(page, count, "")

  await runSlashCommand(page, editor, "collapsible", "Collapsible section")
  await page.locator("summary").click()
  await page.keyboard.type("Recreated")
  await page.getByRole("button", { name: "Expand details" }).click()
  await page.locator('[data-type="detailsContent"] p').click()
  await page.keyboard.type("Recreated body.")
  await expectDescriptionSave(page, count, recreated)

  expect(await getDescriptionUpdates(page)).toHaveLength(3)
  await harness.assertClean()
})

test("uses, edits, deletes, and recreates a date", async ({ page }) => {
  const initial = "2026-09-01"
  const edited = "2026-09-02"
  const recreated = "2026-10-03"
  const harness = await openIssueWebview(page, initial)
  const editor = page.getByRole("textbox", { name: "Issue description" })

  await expect(editor).toHaveText(initial)
  await editor.focus()
  await editor.press(selectAll)
  await editor.pressSequentially(edited)
  let count = await expectDescriptionSave(page, 0, edited)

  await clearEditor(editor)
  count = await expectDescriptionSave(page, count, "")

  await runSlashCommand(page, editor, "date", "Date")
  const input = page
    .locator(".simple-editor-wrapper")
    .filter({ has: editor })
    .getByLabel("Choose date")
  await input.fill(recreated, { force: true })
  await input.dispatchEvent("change")
  await expectDescriptionSave(page, count, recreated)

  expect(await getDescriptionUpdates(page)).toHaveLength(3)
  await harness.assertClean()
})

const mentionCases = [
  {
    kind: "user",
    initial: '<user id="11111111-1111-4111-8111-111111111111">initial-user</user>',
    edited: {
      kind: "user",
      id: "22222222-2222-4222-8222-222222222222",
      label: "edited-user",
      resourceUrl: null,
    },
    editedMarkdown: '<user id="22222222-2222-4222-8222-222222222222" notify>edited-user</user>',
    recreated: {
      kind: "user",
      id: "33333333-3333-4333-8333-333333333333",
      label: "recreated-user",
      resourceUrl: null,
    },
    recreatedMarkdown:
      '<user id="33333333-3333-4333-8333-333333333333" notify>recreated-user</user>',
  },
  ...(["issue", "project", "document", "cycle", "milestone", "view", "initiative"] as const).map(
    (kind) => {
      const initialLabel = `initial-${kind}`
      const editedLabel = `edited-${kind}`
      const recreatedLabel = `recreated-${kind}`
      const route = kind === "milestone" ? "project-milestone" : kind
      const initialUrl = `https://linear.app/e2e/${route}/${initialLabel}`
      const editedUrl = `https://linear.app/e2e/${route}/${editedLabel}`
      const recreatedUrl = `https://linear.app/e2e/${route}/${recreatedLabel}`
      const editedId = "22222222-2222-4222-8222-222222222222"
      const recreatedId = "33333333-3333-4333-8333-333333333333"

      return {
        kind,
        initial:
          kind === "issue"
            ? `<issue id="11111111-1111-4111-8111-111111111111" href="${initialUrl}">${initialLabel}</issue>`
            : initialUrl,
        edited: {
          kind,
          id: editedId,
          label: editedLabel,
          resourceUrl: editedUrl,
        },
        editedMarkdown:
          kind === "issue"
            ? `<issue id="${editedId}" href="${editedUrl}">${editedLabel}</issue>`
            : editedUrl,
        recreated: {
          kind,
          id: recreatedId,
          label: recreatedLabel,
          resourceUrl: recreatedUrl,
        },
        recreatedMarkdown:
          kind === "issue"
            ? `<issue id="${recreatedId}" href="${recreatedUrl}">${recreatedLabel}</issue>`
            : recreatedUrl,
      }
    },
  ),
]

for (const mentionCase of mentionCases) {
  test(`uses, edits, deletes, and recreates a ${mentionCase.kind} mention`, async ({ page }) => {
    const harness = await openIssueWebview(page, {
      initialDescription: mentionCase.initial,
      mentionResults: [mentionCase.edited, mentionCase.recreated],
    })
    const editor = page.getByRole("textbox", { name: "Issue description" })

    await expect(page.locator('[data-type="mention"]')).toHaveCount(1)
    await replaceWithMention(page, editor, "edited", mentionCase.edited.label)
    let count = await expectDescriptionSave(page, 0, `${mentionCase.editedMarkdown} `)

    await clearEditor(editor)
    count = await expectDescriptionSave(page, count, "")

    await replaceWithMention(page, editor, "recreated", mentionCase.recreated.label)
    await expectDescriptionSave(page, count, `${mentionCase.recreatedMarkdown} `)

    expect(await getDescriptionUpdates(page)).toHaveLength(3)
    await harness.assertClean()
  })
}

test("uses, edits, deletes, and recreates a Unicode emoji from the picker", async ({ page }) => {
  const harness = await openIssueWebview(page, "Emoji 🙂")
  const editor = page.getByRole("textbox", { name: "Issue description" })

  await editor.click()
  await editor.press("End")
  await editor.press("Shift+ArrowLeft")
  await page.getByLabel("Insert emoji").click()
  await page.locator('.EmojiPickerReact button[aria-label="grinning"]').click()
  let count = await expectDescriptionSave(page, 0, "Emoji 😀")

  await clearEditor(editor)
  count = await expectDescriptionSave(page, count, "")
  await expect
    .poll(
      async () =>
        (await getIpcRequests(page, "setIssueDescriptionDraft")).filter(
          (request) => request.value === null,
        ).length,
    )
    .toBe(2)

  await editor.click()
  await editor.pressSequentially("🚀")
  await expectDescriptionSave(page, count, "🚀")

  expect(await getDescriptionUpdates(page)).toHaveLength(3)
  await harness.assertClean()
})

for (const imageCase of [
  {
    kind: "remote",
    source: "https://images.example.test/remote.png",
    uploadAsset: {
      url: "https://images.example.test/remote.png",
      contentType: "image/png",
      bodyBase64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
    },
  },
  {
    kind: "data URI",
    source:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
  },
] as const) {
  test(`uses, replaces, deletes, and recreates a ${imageCase.kind} image by pasting Markdown`, async ({
    page,
  }) => {
    const harness = await openIssueWebview(page, {
      initialDescription: `![initial ${imageCase.kind}](${imageCase.source})`,
      uploadAsset: "uploadAsset" in imageCase ? imageCase.uploadAsset : undefined,
    })
    const editor = page.getByRole("textbox", { name: "Issue description" })

    await expect(page.getByRole("img", { name: `initial ${imageCase.kind}` })).toBeVisible()
    await clearEditor(editor)
    await pasteMarkdown(editor, `![edited ${imageCase.kind}](${imageCase.source})`)
    let count = await expectDescriptionSave(
      page,
      0,
      `![edited ${imageCase.kind}](<${imageCase.source}>)`,
    )
    await expect(page.getByRole("img", { name: `edited ${imageCase.kind}` })).toBeVisible()

    await clearEditor(editor)
    count = await expectDescriptionSave(page, count, "")

    await pasteMarkdown(editor, `![recreated ${imageCase.kind}](${imageCase.source})`)
    await expectDescriptionSave(
      page,
      count,
      `![recreated ${imageCase.kind}](<${imageCase.source}>)`,
    )
    await expect(page.getByRole("img", { name: `recreated ${imageCase.kind}` })).toBeVisible()

    expect(await getDescriptionUpdates(page)).toHaveLength(3)
    expect(await getIpcRequests(page, "uploadLinearFile")).toEqual([])
    await harness.assertClean()
  })
}

const tinyMp4 =
  "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMVbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAACgAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAj90cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAAoAAAAAAABAAAAAAG3bWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAyAAAAAgBVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABYm1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAASJzdGJsAAAAvnN0c2QAAAAAAAAAAQAAAK5hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2Mi4yOC4xMDAgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAANGF2Y0MBZAAK/+EAF2dkAAqs2V7ARAAAAwAEAAADAMg8SJZYAQAGaOvjyyLA/fj4AAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAAinoAAAAAAAAABhzdHRzAAAAAAAAAAEAAAABAAACAAAAABxzdHNjAAAAAAAAAAEAAAABAAAAAQAAAAEAAAAUc3RzegAAAAAAAALFAAAAAQAAABRzdGNvAAAAAAAAAAEAAANFAAAAYnVkdGEAAABabWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAtaWxzdAAAACWpdG9vAAAAHWRhdGEAAAABAAAAAExhdmY2Mi4xMi4xMDAAAAAIZnJlZQAAAs1tZGF0AAACrgYF//+q3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NSByMzIyMiBiMzU2MDVhIC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyNSAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBiX2JpYXM9MCBkaXJlY3Q9MSB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRfbWluPTI1IHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAAD2WIhAAr//72c3wKa22xgQ=="

const uploadCases = [
  {
    kind: "image",
    extension: "png",
    mimeType: "image/png",
    bodyBase64:
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
    initialMarkdown: (url: string) => `![original](${url})`,
    markdown: (url: string, name: string) => `![${name.replace(/\.[^.]+$/, "")}](<${url}>)\n\n`,
    assertRendered: async (page: Page, name: string) => {
      await expect(page.getByRole("img", { name: name.replace(/\.[^.]+$/, "") })).toBeVisible()
    },
  },
  {
    kind: "audio",
    extension: "wav",
    mimeType: "audio/wav",
    bodyBase64: "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
    initialMarkdown: (url: string) =>
      `<linear-embed node-type="audio">{"uploadState":"finished","uploadId":null,"src":"${url}","title":"original.wav","size":44,"mimetype":"audio/wav","controls":true}</linear-embed>`,
    markdown: (url: string, name: string) =>
      `<linear-embed node-type="audio">{"uploadState":"finished","uploadId":null,"src":"${url}","title":"${name}","size":44,"mimetype":"audio/wav","controls":true}</linear-embed>`,
    assertRendered: async (page: Page, name: string) => {
      await expect(page.locator(`audio[aria-label="${name}"]`)).toBeVisible()
    },
  },
  {
    kind: "video",
    extension: "mp4",
    mimeType: "video/mp4",
    bodyBase64: tinyMp4,
    initialMarkdown: (url: string) =>
      `<linear-embed node-type="video">{"uploadState":"finished","uploadId":null,"src":"${url}","title":"original.mp4","size":1546,"mimetype":"video/mp4","controls":true,"height":null,"width":null,"metadataId":null}</linear-embed>`,
    markdown: (url: string, name: string) =>
      `<linear-embed node-type="video">{"uploadState":"finished","uploadId":null,"src":"${url}","title":"${name}","size":1546,"mimetype":"video/mp4","controls":true,"height":null,"width":null,"metadataId":null}</linear-embed>`,
    assertRendered: async (page: Page, name: string) => {
      await expect(page.getByRole("group", { name })).toBeVisible()
    },
  },
  {
    kind: "file",
    extension: "pdf",
    mimeType: "application/pdf",
    bodyBase64: Buffer.from("E2E PDF fixture").toString("base64"),
    initialMarkdown: (url: string) =>
      `<linear-embed node-type="file">{"uploadState":"finished","href":"${url}","name":"original.pdf","size":1,"mimetype":"application/pdf"}</linear-embed>`,
    markdown: (url: string, name: string) =>
      `<linear-embed node-type="file">{"uploadState":"finished","href":"${url}","name":"${name}","size":15,"mimetype":"application/pdf"}</linear-embed>`,
    assertRendered: async (page: Page, name: string) => {
      await expect(page.getByLabel(`Download ${name}`)).toBeVisible()
    },
  },
] as const

async function uploadThroughEditor(
  page: Page,
  editor: Locator,
  uploadCase: (typeof uploadCases)[number],
  name: string,
) {
  const chooserPromise = page.waitForEvent("filechooser")
  if (uploadCase.kind === "image") {
    await runSlashCommand(page, editor, "image", "Image")
    await page.getByRole("button", { name: "Upload image" }).click()
  } else {
    await runSlashCommand(page, editor, "file", "File")
  }
  const chooser = await chooserPromise
  await chooser.setFiles({
    name,
    mimeType: uploadCase.mimeType,
    buffer: Buffer.from(uploadCase.bodyBase64, "base64"),
  })
}

async function dispatchFile(
  editor: Locator,
  eventType: "paste" | "drop",
  file: { name: string; mimeType: string; bodyBase64?: string; size?: number },
) {
  await editor.click()
  await editor.evaluate(
    (element, input) => {
      const bytes = input.bodyBase64
        ? Uint8Array.from(atob(input.bodyBase64), (character) => character.charCodeAt(0))
        : new Uint8Array(input.size ?? 0)
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(new File([bytes], input.name, { type: input.mimeType }))
      const event =
        input.eventType === "paste"
          ? new ClipboardEvent("paste", {
              bubbles: true,
              cancelable: true,
              clipboardData: dataTransfer,
            })
          : new DragEvent("drop", {
              bubbles: true,
              cancelable: true,
              clientX: element.getBoundingClientRect().left + 8,
              clientY: element.getBoundingClientRect().top + 8,
              dataTransfer,
            })
      element.dispatchEvent(event)
    },
    { ...file, eventType },
  )
}

for (const uploadCase of uploadCases) {
  test(`uses, replaces, deletes, and recreates an uploaded ${uploadCase.kind}`, async ({
    page,
  }) => {
    const url = `https://uploads.linear.app/e2e/asset.${uploadCase.extension}`
    const harness = await openIssueWebview(page, {
      initialDescription: uploadCase.initialMarkdown(url),
      uploadAsset: { url, contentType: uploadCase.mimeType, bodyBase64: uploadCase.bodyBase64 },
    })
    const editor = page.getByRole("textbox", { name: "Issue description" })
    const editedName = `edited.${uploadCase.extension}`
    const recreatedName = `recreated.${uploadCase.extension}`

    await uploadCase.assertRendered(page, `original.${uploadCase.extension}`)
    if (uploadCase.kind === "file") {
      const downloadPromise = page.waitForEvent("download")
      await page.getByLabel("Download original.pdf").click()
      expect((await downloadPromise).suggestedFilename()).toBe("original.pdf")
      expect(await getIpcRequests(page, "openExternalUrl")).toEqual([])
    }
    await clearEditor(editor)
    await uploadThroughEditor(page, editor, uploadCase, editedName)
    let count = await expectDescriptionSave(page, 0, uploadCase.markdown(url, editedName))
    await uploadCase.assertRendered(page, editedName)

    await clearEditor(editor)
    count = await expectDescriptionSave(page, count, "")

    await uploadThroughEditor(page, editor, uploadCase, recreatedName)
    await expectDescriptionSave(page, count, uploadCase.markdown(url, recreatedName))
    await uploadCase.assertRendered(page, recreatedName)

    expect(await getDescriptionUpdates(page)).toHaveLength(3)
    expect(await getIpcRequests(page, "uploadLinearFile")).toHaveLength(2)
    await harness.assertClean()
  })
}

for (const kind of ["file", "image"] as const) {
  test(`keeps the ${kind} picker pending when focus returns before the file selection`, async ({
    page,
  }) => {
    const uploadCase = uploadCases.find((entry) => entry.kind === kind)!
    const name = `selected.${uploadCase.extension}`
    const url = `https://uploads.linear.app/e2e/${name}`
    const harness = await openIssueWebview(page, {
      initialDescription: "",
      uploadAsset: { url, contentType: uploadCase.mimeType, bodyBase64: uploadCase.bodyBase64 },
    })
    const editor = page.getByRole("textbox", { name: "Issue description" })
    const chooserPromise = page.waitForEvent("filechooser")
    await runSlashCommand(page, editor, kind, kind === "file" ? "File" : "Image")
    if (kind === "image") await page.getByRole("button", { name: "Upload image" }).click()
    const chooser = await chooserPromise

    await page.evaluate(async () => {
      window.dispatchEvent(new Event("focus"))
      await new Promise((resolve) => window.setTimeout(resolve))
    })
    await chooser.setFiles({
      name,
      mimeType: uploadCase.mimeType,
      buffer: Buffer.from(uploadCase.bodyBase64, "base64"),
    })

    await expectDescriptionSave(page, 0, uploadCase.markdown(url, name))
    await uploadCase.assertRendered(page, name)
    expect(await getIpcRequests(page, "uploadLinearFile")).toHaveLength(1)
    await harness.assertClean()
  })

  test(`cancels the ${kind} picker and allows a later upload`, async ({ page }) => {
    const uploadCase = uploadCases.find((entry) => entry.kind === kind)!
    const name = `selected.${uploadCase.extension}`
    const url = `https://uploads.linear.app/e2e/${name}`
    const harness = await openIssueWebview(page, {
      initialDescription: "",
      uploadAsset: { url, contentType: uploadCase.mimeType, bodyBase64: uploadCase.bodyBase64 },
    })
    const editor = page.getByRole("textbox", { name: "Issue description" })
    const chooserPromise = page.waitForEvent("filechooser")
    await runSlashCommand(page, editor, kind, kind === "file" ? "File" : "Image")
    if (kind === "image") await page.getByRole("button", { name: "Upload image" }).click()
    const chooser = await chooserPromise
    await chooser.element().dispatchEvent("cancel")

    await expect(editor).toHaveAttribute("contenteditable", "true")
    await expect(editor.locator(".tiptap-image-upload")).toHaveCount(0)
    expect(await getIpcRequests(page, "uploadLinearFile")).toEqual([])
    expect(await getDescriptionUpdates(page)).toEqual([])
    await clearEditor(editor)
    await uploadThroughEditor(page, editor, uploadCase, name)
    await expect
      .poll(async () => (await getDescriptionUpdates(page)).at(-1)?.fields.description)
      .toBe(uploadCase.markdown(url, name))
    await uploadCase.assertRendered(page, name)
    await harness.assertClean()
  })
}

test("retries a failed file upload and saves only the successful result", async ({ page }) => {
  const fileCase = uploadCases.find(({ kind }) => kind === "file")!
  const url = "https://uploads.linear.app/e2e/retried.pdf"
  const harness = await openIssueWebview(page, {
    initialDescription: "",
    uploadAsset: { url, contentType: fileCase.mimeType, bodyBase64: fileCase.bodyBase64 },
    uploadFailures: 1,
  })
  const editor = page.getByRole("textbox", { name: "Issue description" })

  await uploadThroughEditor(page, editor, fileCase, "retried.pdf")
  const uploadAlert = page.locator('.linear-editor-upload-status[role="alert"]')
  await expect(uploadAlert).toContainText("E2E upload failure")
  expect(await getDescriptionUpdates(page)).toEqual([])
  expect(await getIpcRequests(page, "uploadLinearFile")).toHaveLength(1)

  await uploadAlert.getByRole("button", { name: "Retry" }).click()
  await expectDescriptionSave(page, 0, fileCase.markdown(url, "retried.pdf"))
  await fileCase.assertRendered(page, "retried.pdf")
  expect(await getIpcRequests(page, "uploadLinearFile")).toHaveLength(2)
  await harness.assertClean()
})

for (const eventType of ["paste", "drop"] as const) {
  test(`uploads and saves a file from a ${eventType} event`, async ({ page }) => {
    const fileCase = uploadCases.find(({ kind }) => kind === "file")!
    const name = `${eventType}d.pdf`
    const url = `https://uploads.linear.app/e2e/${name}`
    const harness = await openIssueWebview(page, {
      initialDescription: "",
      uploadAsset: { url, contentType: fileCase.mimeType, bodyBase64: fileCase.bodyBase64 },
    })
    const editor = page.getByRole("textbox", { name: "Issue description" })

    await dispatchFile(editor, eventType, {
      name,
      mimeType: fileCase.mimeType,
      bodyBase64: fileCase.bodyBase64,
    })
    await expectDescriptionSave(page, 0, fileCase.markdown(url, name))
    await fileCase.assertRendered(page, name)
    expect(await getIpcRequests(page, "uploadLinearFile")).toHaveLength(1)
    await harness.assertClean()
  })
}

for (const invalidFile of [
  { name: "empty.pdf", size: 0, description: "an empty file" },
  {
    name: "too-large.pdf",
    size: 10 * 1024 * 1024 + 1,
    description: "file larger than 10 MB",
  },
] as const) {
  test(`rejects ${invalidFile.description} before upload`, async ({ page }) => {
    const harness = await openIssueWebview(page, "")
    const editor = page.getByRole("textbox", { name: "Issue description" })

    await dispatchFile(editor, "paste", {
      name: invalidFile.name,
      mimeType: "application/pdf",
      size: invalidFile.size,
    })
    await expect(page.getByRole("alert")).toContainText("Files must be between 1 byte and 10 MB")
    await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0)
    await expect(editor).toHaveAttribute("contenteditable", "true")
    expect(await getIpcRequests(page, "uploadLinearFile")).toEqual([])
    expect(await getDescriptionUpdates(page)).toEqual([])
    await harness.assertClean()
  })
}

test("cancels a pending upload without saving or disabling the editor", async ({ page }) => {
  const url = "https://uploads.linear.app/e2e/cancelled.pdf"
  const harness = await openIssueWebview(page, {
    initialDescription: "",
    uploadAsset: {
      url,
      contentType: "application/pdf",
      bodyBase64: Buffer.from("cancel me").toString("base64"),
    },
    uploadDelayMs: 5_000,
  })
  const editor = page.getByRole("textbox", { name: "Issue description" })

  await uploadThroughEditor(
    page,
    editor,
    uploadCases.find(({ kind }) => kind === "file")!,
    "cancelled.pdf",
  )
  await expect(page.getByRole("status")).toContainText("Uploading file… 20%")
  await page.getByRole("button", { name: "Cancel" }).click()
  await expect(page.getByRole("alert")).toContainText("Upload cancelled")
  await expect
    .poll(async () => (await getIpcRequests(page, "cancelLinearFileUpload")).length)
    .toBe(1)
  await expect(editor).toHaveAttribute("contenteditable", "true")
  expect(await getDescriptionUpdates(page)).toEqual([])
  await harness.assertClean()
})

test("keeps an extensionless uploaded audio URL as audio", async ({ page }) => {
  const url =
    "https://uploads.linear.app/00000000-0000-4000-8000-000000000000/11111111-1111-4111-8111-111111111111/asset-uuid"
  await openIssueWebview(page, {
    initialDescription: `![recreated-tone.mp3](${url}?signature=fixture-token)`,
    uploadAsset: {
      url,
      contentType: "audio/mpeg",
      bodyBase64: "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
    },
  })
  await expect(page.locator("audio")).toBeVisible()
})

test("plays an extensionless uploaded video link", async ({ page }) => {
  const url =
    "https://uploads.linear.app/00000000-0000-4000-8000-000000000000/11111111-1111-4111-8111-111111111111/video-uuid"
  await openIssueWebview(page, {
    initialDescription: `[linear-markdown-video.mp4](<${url}?signature=fixture-token>)`,
    uploadAsset: { url, contentType: "video/mp4", bodyBase64: tinyMp4 },
  })

  await expect(page.locator("video")).toBeVisible()
})

test("plays an uploaded asset labelled after its own URL and keeps other media as a link", async ({
  page,
}) => {
  const url =
    "https://uploads.linear.app/00000000-0000-4000-8000-000000000000/11111111-1111-4111-8111-111111111111/asset-uuid"
  const description = `[asset-uuid?signature=stale-token](<${url}?signature=fresh-token>)`

  await openIssueWebview(page, {
    initialDescription: description,
    uploadAsset: { url, contentType: "video/mp4", bodyBase64: tinyMp4 },
  })
  await expect(page.locator("video")).toBeVisible()

  await openIssueWebview(page, {
    initialDescription: description,
    uploadAsset: { url, contentType: "application/pdf", bodyBase64: "RTJFIFBERg==" },
  })
  await expect(page.locator("video")).toHaveCount(0)
  await expect(page.getByRole("link", { name: "asset-uuid?signature=stale-token" })).toBeVisible()
})

test("plays an unnamed provider link and keeps a named one as a link", async ({ page }) => {
  const url = "https://www.loom.com/share/unnamed_link_123"
  const harness = await openIssueWebview(page, {
    initialDescription: `[unnamed_link_123](<${url}>)\n\nNamed: [Loom link](<${url}>).`,
    mockEmbedDocuments: ["https://www.loom.com/embed/unnamed_link_123"],
    mockMediaRequests: [url],
  })

  await expect(
    page.getByRole("group", { name: "unnamed_link_123" }).locator("iframe"),
  ).toHaveAttribute("src", "https://www.loom.com/embed/unnamed_link_123")
  await expect(page.getByRole("link", { name: "Loom link" })).toBeVisible()
  expect(await getDescriptionUpdates(page)).toEqual([])
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

for (const providerCase of [
  {
    provider: "YouTube",
    initialUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    editedUrl: "https://www.youtube.com/watch?v=M7lc1UVf-VE",
    embedUrl: (url: string) => getYouTubeEmbedUrl(new URL(url).searchParams.get("v")!),
    iframe: (page: Page) => page.locator("youtube-video iframe"),
    mockYouTubeIframeApi: true,
  },
  {
    provider: "Loom",
    initialUrl: "https://www.loom.com/share/initial_loom_123",
    editedUrl: "https://www.loom.com/share/edited_loom_456",
    embedUrl: (url: string) => url.replace("/share/", "/embed/"),
    iframe: (page: Page) => page.locator('.videoPlayerWrapper iframe[title="Loom video"]'),
    mockYouTubeIframeApi: false,
  },
] as const) {
  test(`uses, replaces, deletes, and recreates a ${providerCase.provider} embed by pasting Markdown`, async ({
    page,
  }) => {
    const initialEmbed = providerCase.embedUrl(providerCase.initialUrl)
    const editedEmbed = providerCase.embedUrl(providerCase.editedUrl)
    const harness = await openIssueWebview(page, {
      initialDescription: `![](${providerCase.initialUrl})`,
      mockEmbedDocuments: [initialEmbed, editedEmbed],
      mockMediaRequests: [providerCase.initialUrl, providerCase.editedUrl],
      mockYouTubeIframeApi: providerCase.mockYouTubeIframeApi,
    })
    const editor = page.getByRole("textbox", { name: "Issue description" })

    await expect(page.getByRole("group", { name: "Video" })).toBeVisible()
    await expect(providerCase.iframe(page)).toHaveAttribute("src", initialEmbed)

    await clearEditor(editor)
    await pasteMarkdown(editor, `![](${providerCase.editedUrl})`)
    let count = await expectDescriptionSave(page, 0, `![](<${providerCase.editedUrl}>)`)
    await expect(providerCase.iframe(page)).toHaveAttribute("src", editedEmbed)

    await clearEditor(editor)
    count = await expectDescriptionSave(page, count, "")

    await pasteMarkdown(editor, `![](${providerCase.initialUrl})`)
    await expectDescriptionSave(page, count, `![](<${providerCase.initialUrl}>)`)
    await expect(providerCase.iframe(page)).toHaveAttribute("src", initialEmbed)

    await expect
      .poll(() => Promise.resolve(harness.mockedEmbedRequests))
      .toEqual(expect.arrayContaining([initialEmbed, editedEmbed]))
    if (providerCase.mockYouTubeIframeApi) {
      expect(harness.mockedEmbedRequests).toContain("https://www.youtube.com/iframe_api")
    }
    expect(await getDescriptionUpdates(page)).toHaveLength(3)
    await harness.assertClean()
  })
}

for (const [name, source] of [
  ["raw HTML", "<div>Keep this source byte for byte</div>"],
  ["an unsafe command link", "[unsafe](command:workbench.action.closeWindow)"],
  ["malformed details", "+++ Missing close\n\nContent"],
  ["an invalid table", "| A |\n| --- |\n| x | y |"],
  ["a link destination title", '[link](https://example.com "Not portable")'],
  ["an image destination title", '![image](https://example.com/image.png "Not portable")'],
  ["a linked image", "[![image](https://example.com/image.png)](https://example.com)"],
  ["table alignment", "| A | B |\n| :-- | --: |\n| left | right |"],
  ["an escaped table pipe", "| A | B |\n| -- | -- |\n| escaped \\| pipe | value |"],
  ["an ordered checklist", "1. [ ] First\n2. [x] Second"],
  [
    "an expiring private URL",
    "![private](https://uploads.linear.app/image.png?X-Goog-Expires=60&X-Goog-Signature=secret)",
  ],
] as const) {
  test(`preserves ${name} and blocks every save`, async ({ page }) => {
    const harness = await openIssueWebview(page, {
      initialDescription: source,
      expectUnsupported: true,
    })

    await expect(page.getByRole("alert")).toContainText("read-only")
    await expect(page.getByRole("document", { name: "Issue description" })).toHaveText(source)
    await expect(page.getByRole("textbox", { name: "Issue description" })).toHaveCount(0)
    await page.waitForTimeout(1_000)
    expect(await getDescriptionUpdates(page)).toEqual([])
    expect(await getIpcRequests(page, "linearUpdateIssue")).toEqual([])
    await harness.assertClean()
  })
}

test("offers image options anchored inside the webview and deletes the image", async ({ page }) => {
  // A data URI keeps the assertion about the menu, not about a network fetch.
  const source = `![Screenshot](data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7)`
  const harness = await openIssueWebview(page, source)

  // Linear centres an image and rings the picture, not the whole text column.
  const editor = page.getByRole("textbox", { name: "Issue description" })
  const wrapper = page.locator(".linear-image")
  const editorBox = await editor.boundingBox()
  const wrapperBox = await wrapper.boundingBox()
  expect(editorBox && wrapperBox).toBeTruthy()
  if (editorBox && wrapperBox) {
    expect(wrapperBox.width).toBeLessThan(editorBox.width)
    const leftGap = wrapperBox.x - editorBox.x
    const rightGap = editorBox.x + editorBox.width - (wrapperBox.x + wrapperBox.width)
    expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(2)
  }

  const trigger = page.getByRole("button", { name: "Image options" })
  await trigger.click()

  const menu = page.getByRole("menu")
  await expect(menu).toBeVisible()
  for (const label of ["View image", "Download", "Copy image", "Copy link", "Delete"]) {
    await expect(menu.getByRole("menuitem", { name: label, exact: true })).toBeVisible()
  }
  // Linear offers "Add comment" here; the extension deliberately does not.
  await expect(menu.getByRole("menuitem", { name: "Add comment" })).toHaveCount(0)

  const triggerBox = await trigger.boundingBox()
  const menuBox = await menu.boundingBox()
  const viewport = page.viewportSize()
  expect(triggerBox && menuBox && viewport).toBeTruthy()
  if (!triggerBox || !menuBox || !viewport) return

  // Anchored to its trigger, and never spilling out of the webview.
  expect(Math.abs(menuBox.x + menuBox.width - (triggerBox.x + triggerBox.width))).toBeLessThan(8)
  expect(menuBox.x).toBeGreaterThanOrEqual(0)
  expect(menuBox.y).toBeGreaterThanOrEqual(0)
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(viewport.width)
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(viewport.height)

  await menu.getByRole("menuitem", { name: "Delete", exact: true }).click()
  await expectDescriptionSave(page, 0, "")
  await harness.assertClean()
})

test("selects a file card on click and downloads only from its download button", async ({
  page,
}) => {
  const url = "https://uploads.linear.app/e2e/select.pdf"
  const harness = await openIssueWebview(page, {
    initialDescription: `<linear-embed node-type="file">{"uploadState":"finished","href":"${url}","name":"select.pdf","size":1,"mimetype":"application/pdf"}</linear-embed>`,
    uploadAsset: {
      url,
      contentType: "application/pdf",
      bodyBase64: Buffer.from("PDF").toString("base64"),
    },
  })
  const downloads: string[] = []
  page.on("download", (download) => downloads.push(download.suggestedFilename()))

  await page.getByRole("group", { name: "select.pdf" }).getByText("select.pdf").click()
  await expect(page.locator(".react-renderer.ProseMirror-selectednode")).toHaveCount(1)
  expect(downloads).toEqual([])

  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download select.pdf" }).click()
  expect((await downloadPromise).suggestedFilename()).toBe("select.pdf")
  expect(await getIpcRequests(page, "openExternalUrl")).toEqual([])
  await harness.assertClean()
})
