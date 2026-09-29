import * as assert from "assert"

import { getSchema } from "@tiptap/core"
import { Markdown, MarkdownManager } from "@tiptap/markdown"
import { NodeSelection } from "@tiptap/pm/state"
import { StarterKit } from "@tiptap/starter-kit"

import {
  canonicalizeLinearFileHref,
  LinearFile,
  parseLinearFileEmbed,
  serializeLinearFileEmbed,
} from "../../webviews/components/Editor/markdownPlugins/FilePlugin/LinearFile"

import type { JSONContent, MarkdownToken } from "@tiptap/core"

const signedHref =
  "https://uploads.linear.app/workspace/path/asset?download=1&signature=anonymized.jwt&name=a%20b.png"
const canonicalHref = "https://uploads.linear.app/workspace/path/asset?download=1&name=a%20b.png"
const observedPayload = {
  uploadState: "finished",
  uploadId: null,
  href: signedHref,
  name: "markdown-parity-image.png",
  size: 21504,
  mimetype: "image/png",
  contentAttribution: {
    userId: "11111111-1111-4111-8111-111111111111",
    actorType: "user_with_agent",
  },
}
const observedSource = `<linear-embed node-type="file">${JSON.stringify(observedPayload)}</linear-embed>`
const canonicalSource =
  '<linear-embed node-type="file">{"uploadState":"finished","href":"https://uploads.linear.app/workspace/path/asset?download=1&name=a%20b.png","name":"markdown-parity-image.png","size":21504,"mimetype":"image/png"}</linear-embed>'

function findTokens(tokens: MarkdownToken[], type: string): MarkdownToken[] {
  return tokens.flatMap((token) => [
    ...(token.type === type ? [token] : []),
    ...findTokens((token.tokens as MarkdownToken[] | undefined) ?? [], type),
  ])
}

function findNodes(node: JSONContent, type: string): JSONContent[] {
  return [
    ...(node.type === type ? [node] : []),
    ...(node.content?.flatMap((child) => findNodes(child, type)) ?? []),
  ]
}

suite("Linear file embeds", () => {
  const manager = new MarkdownManager({
    extensions: [Markdown, StarterKit, LinearFile],
  })

  test("allows native dragging of the complete file node with its portable metadata", () => {
    const schema = getSchema([StarterKit, LinearFile])
    const document = schema.nodeFromJSON(manager.parse(observedSource))
    const selection = NodeSelection.create(document, 0)

    assert.strictEqual(selection.node.type.spec.draggable, true)
    assert.strictEqual(
      manager.serialize({ type: "doc", content: selection.content().content.toJSON() }),
      canonicalSource,
    )
  })

  test("extracts only portable fields and strips only the Linear signature", () => {
    const parsed = parseLinearFileEmbed(observedSource)

    assert.deepStrictEqual(parsed, {
      raw: observedSource,
      uploadState: "finished",
      href: canonicalHref,
      name: "markdown-parity-image.png",
      size: 21504,
      mimetype: "image/png",
      syntax: "linearEmbed",
    })
    assert.strictEqual(serializeLinearFileEmbed(parsed), canonicalSource)
    assert.strictEqual(
      canonicalizeLinearFileHref(
        "https://uploads.linear.app/file?Signature=keep&signature=drop&token=a%20b#page",
      ),
      "https://uploads.linear.app/file?Signature=keep&token=a%20b#page",
    )
    assert.strictEqual(
      canonicalizeLinearFileHref("https://cdn.example.com/file?signature=keep"),
      "https://cdn.example.com/file?signature=keep",
    )
  })

  test("tokenizes and round-trips an observed file as deterministic minimal JSON", () => {
    const tokens = manager.instance.lexer(observedSource) as MarkdownToken[]
    assert.strictEqual(findTokens(tokens, "linearFile").length, 1)

    const document = manager.parse(observedSource)
    const file = findNodes(document, "linearFile")[0]
    assert.deepStrictEqual(file.attrs, {
      uploadState: "finished",
      href: canonicalHref,
      name: "markdown-parity-image.png",
      size: 21504,
      mimetype: "image/png",
      syntax: "linearEmbed",
    })
    assert.strictEqual(manager.serialize(document), canonicalSource)
  })

  test("leaves malformed and unsafe embeds to the default lexer", () => {
    const invalidPayloads = [
      { ...observedPayload, href: "file:///tmp/private.png" },
      { ...observedPayload, size: -1 },
      { ...observedPayload, mimetype: "image" },
      { ...observedPayload, uploadState: "" },
    ]
    const unsupported = [
      '<linear-embed node-type="video">{}</linear-embed>',
      "<linear-embed node-type='file'>{}</linear-embed>",
      '<linear-embed node-type="file">not-json</linear-embed>',
      ...invalidPayloads.map(
        (payload) => `<linear-embed node-type="file">${JSON.stringify(payload)}</linear-embed>`,
      ),
    ]

    for (const source of unsupported) {
      assert.strictEqual(parseLinearFileEmbed(source), null)
      const tokens = manager.instance.lexer(source) as MarkdownToken[]
      assert.strictEqual(findTokens(tokens, "linearFile").length, 0)
    }

    const code = manager.instance.lexer(`\`\`\`html\n${observedSource}\n\`\`\``) as MarkdownToken[]
    assert.strictEqual(findTokens(code, "linearFile").length, 0)
    assert.strictEqual(findTokens(code, "code").length, 1)
  })
})

suite("Linear file embed escaping", () => {
  test("parses an embed whose signature Linear escaped as Markdown", () => {
    // Linear runs its Markdown escaper over the raw embed payload, and asset signatures are
    // base64url, so `_` routinely comes back as `\_`. Before this was handled the JSON failed
    // to parse and the whole block fell through to a plain link.
    const source = String.raw`<linear-embed node-type="file">{"uploadState":"finished","href":"https://uploads.linear.app/a/b/c?signature=LBr-\_apGWB4","name":"report.json","size":22014,"mimetype":"application/json"}</linear-embed>`

    const parsed = parseLinearFileEmbed(source)

    assert.ok(parsed, "the escaped payload must still be recognised as a file embed")
    assert.strictEqual(parsed.name, "report.json")
    assert.strictEqual(parsed.size, 22014)
    assert.strictEqual(parsed.href, "https://uploads.linear.app/a/b/c")
  })
})

suite("Linear file link form", () => {
  const manager = new MarkdownManager({
    extensions: [Markdown, StarterKit, LinearFile],
  })
  const assetUrl = "https://uploads.linear.app/workspace/path/asset"
  const linkSource = `[report.json](<${assetUrl}>)`

  test("treats a link to an uploaded attachment as a file and round-trips it unchanged", () => {
    // Linear serialises an attachment either as a `<linear-embed>` block or as a plain link
    // whose label carries the file name, because the asset URL has no extension.
    const document = manager.parse(linkSource)
    const file = findNodes(document, "linearFile")[0]

    assert.ok(file, "the link must become a file node, not an ordinary link")
    assert.deepStrictEqual(file.attrs, {
      uploadState: "finished",
      href: assetUrl,
      name: "report.json",
      size: null,
      mimetype: null,
      syntax: "markdownLink",
    })
    // The save gate compares documents, so the link must come back exactly as Linear sent it.
    assert.strictEqual(manager.serialize(document), linkSource)
  })

  test("leaves ordinary links alone", () => {
    for (const source of [
      `[Download video](<${assetUrl}>)`, // prose label, no extension
      "[report.json](<https://example.com/report.json>)", // not a Linear asset
      `Inline [report.json](<${assetUrl}>) inside a sentence`, // not a block of its own
    ]) {
      assert.strictEqual(
        findNodes(manager.parse(source), "linearFile").length,
        0,
        `must stay a link: ${source}`,
      )
    }
  })
})
