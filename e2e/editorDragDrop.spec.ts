import { expect, test } from "@playwright/test"

import { getDescriptionUpdates, getIpcRequests, openIssueWebview } from "./support/issueWebview"

const undo = process.platform === "darwin" ? "Meta+z" : "Control+z"

for (const { kind, layout } of [
  { kind: "image", layout: "block" },
  { kind: "image", layout: "quoted" },
  { kind: "file", layout: "block" },
  { kind: "file", layout: "linked" },
] as const) {
  test(`moves an existing ${layout} ${kind} without uploading it again and supports undo`, async ({
    page,
  }) => {
    const url = `https://uploads.linear.app/e2e/drag-${kind}`
    let asset =
      kind === "image"
        ? `![Picture](<${url}>)`
        : `<linear-embed node-type="file">${JSON.stringify({
            uploadState: "finished",
            href: url,
            name: "report.pdf",
            size: 4,
            mimetype: "application/pdf",
          })}</linear-embed>`
    if (layout === "linked") {
      asset = `[report.pdf](<${url}>)`
    }
    const original =
      layout === "quoted"
        ? `> Before\n>\n> ${asset}\n\nMiddle\n\nDestination`
        : `Before\n\n${asset}\n\nMiddle\n\nDestination`
    const harness = await openIssueWebview(page, {
      initialDescription: original,
      uploadAsset: {
        url,
        contentType: kind === "image" ? "image/svg+xml" : "application/pdf",
        bodyBase64: Buffer.from(
          kind === "image"
            ? '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80"><rect width="160" height="80" fill="#667788"/></svg>'
            : "file",
        ).toString("base64"),
      },
    })
    const editor = page.getByRole("textbox", { name: "Issue description" })
    const source =
      kind === "image"
        ? editor.getByRole("img", { name: "Picture" })
        : editor.getByRole("group", { name: "report.pdf" })
    await expect(source).toBeVisible()
    const downloads: string[] = []
    page.on("download", (download) => downloads.push(download.suggestedFilename()))

    await source.dragTo(editor.getByText("Destination", { exact: true }), {
      targetPosition: { x: 2, y: 2 },
    })

    await expect
      .poll(async () => {
        const markdown = (await getDescriptionUpdates(page)).at(-1)?.fields.description
        return Boolean(
          markdown &&
          markdown.indexOf("Middle") < markdown.indexOf(url) &&
          markdown.indexOf(url) < markdown.indexOf("Destination"),
        )
      })
      .toBe(true)
    await expect(source).toHaveCount(1)
    const moved = (await getDescriptionUpdates(page)).at(-1)!.fields.description
    expect(moved.split(url)).toHaveLength(2)
    expect(moved).not.toContain("blob:")
    expect(moved).toContain(asset)
    expect(moved).toContain("Before")
    expect(await getIpcRequests(page, "uploadLinearFile")).toEqual([])
    expect(await getIpcRequests(page, "openExternalUrl")).toEqual([])
    expect(downloads).toEqual([])

    await page.keyboard.press(undo)
    await expect
      .poll(async () => (await getDescriptionUpdates(page)).at(-1)?.fields.description)
      .toBe(original)
    await expect(source).toHaveCount(1)
    await harness.assertClean()
  })
}
