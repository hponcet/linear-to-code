import * as assert from "assert"
import { readFileSync } from "fs"
import { resolve } from "path"

import { getSchema } from "@tiptap/core"
import { Markdown, MarkdownManager } from "@tiptap/markdown"
import { StarterKit } from "@tiptap/starter-kit"

import {
  createLinearMarkdownExtensions,
  getCanonicalLinearMarkdown,
  inspectEditorDocument,
  inspectLinearMarkdown,
  trimDocumentEnd,
  trimTableCellWhitespace,
} from "../../webviews/components/Editor/linearMarkdown"
import { serializeLinearInlineCode } from "../../webviews/components/Editor/markdownPlugins/LinearInlineCode"
import {
  findVideoMarkdown,
  isSupportedVideoUrl,
  parseVideoMarkdown,
} from "../../webviews/components/Editor/markdownPlugins/VideosPlugin/videoMarkdownDetection"

import type { JSONContent } from "@tiptap/core"

const fixtures = [
  {
    name: "core blocks and marks",
    markdown:
      "# Heading\n\nParagraph with **bold**, *italic*, ~~strike~~, `code`, and [a link](https://example.com).\n\n> Quote\n\n3. Third\n4. Fourth\n\n```ts\nconst value = 1\n```",
  },
  {
    name: "Linear table",
    markdown: "| Name | Value | Empty |\n| -- | -- | -- |\n| A | `B|C` |  |",
    nodeType: "table",
  },
  {
    name: "H5 and H6 headings observed on DES-538",
    markdown: "##### Heading five\n\n###### Heading six",
  },
  {
    name: "task list",
    markdown: "- [ ] Pending\n- [x] Done",
    nodeType: "taskList",
  },
  {
    name: "Linear list continuation links",
    markdown:
      "* repository:\n    [first/file.ts](<https://example.com/first/file.ts>)\n    [second/file.ts](<https://example.com/second/file.ts>)",
  },
  {
    name: "Linear indented list continuation text",
    markdown: "* onepoint-app:\n    and 14 more",
  },
  {
    name: "inline code containing a code fence",
    markdown: "```` ```powershell ````",
  },
  {
    name: "horizontal rule",
    markdown: "Before\n\n---\n\nAfter",
    nodeType: "horizontalRule",
  },
  {
    name: "data URI image",
    markdown: "![Pixel](data:image/png;base64,AAAA)",
    nodeType: "image",
  },
  {
    name: "standalone image",
    markdown: "![Logo](https://cdn.example.com/logo_(dark).png)",
    nodeType: "image",
  },
  {
    name: "complex named link",
    markdown: "[Complex](<https://example.com/a path_(dark)>)",
  },
  {
    name: "details",
    markdown: "+++ More information\n\nInside **details**.\n\n+++",
    nodeType: "details",
  },
  {
    name: "nested details",
    markdown: "+++ Outer\n\nOuter content.\n\n+++ Inner\n\nInner content.\n\n+++\n\n+++",
    nodeType: "details",
  },
  {
    name: "Linear mention",
    markdown: "Ask https://linear.app/acme/profiles/julie about this issue.",
    nodeType: "mention",
  },
  {
    name: "provider embed",
    markdown: "![](https://www.youtube.com/watch?v=dQw4w9WgXcQ)",
    nodeType: "video",
  },
  {
    name: "audio embed",
    markdown: "![Theme](https://uploads.linear.app/theme.mp3)",
    nodeType: "audio",
  },
  {
    name: "direct video link",
    markdown: "![Demo](https://uploads.linear.app/demo.mp4?token=abc)",
    nodeType: "video",
  },
  {
    name: "Mermaid code",
    markdown: "```mermaid\ngraph TD\n  A --> B\n```",
    nodeType: "codeBlock",
  },
  {
    name: "downloadable file link",
    markdown: "[Download report](https://uploads.linear.app/report.pdf)",
  },
  {
    name: "Linear video embed without a title",
    markdown:
      '<linear-embed node-type="video">{"uploadState":"finished","uploadId":null,"src":"https://uploads.linear.app/demo.mp4","title":null,"size":null,"mimetype":null,"controls":true,"height":null,"width":null,"metadataId":null}</linear-embed>',
    nodeType: "video",
  },
  {
    name: "Linear HTML comment",
    markdown: "<!-- Solution considered -->",
    nodeType: "linearOpaqueBlock",
  },
  {
    name: "Linear Figma embed",
    markdown:
      '<linear-embed node-type="figma">{"href":"https://figma.com/file/one","title":"Design"}</linear-embed>',
    nodeType: "linearOpaqueBlock",
  },
  {
    name: "Linear placeholder file",
    markdown:
      '<linear-embed node-type="file">{"uploadState":"finished","href":null,"name":"","size":0,"mimetype":null}</linear-embed>',
    nodeType: "linearOpaqueBlock",
  },
  {
    name: "legacy Linear superscript",
    markdown: "\\[<sup>Archive one.zip\\]\n\\[</sup>Archive two.zip\\]",
    nodeType: "linearOpaqueBlock",
  },
]

type DocumentNode = { type?: string; attrs?: Record<string, unknown>; content?: DocumentNode[] }

function containsNodeType(node: DocumentNode, type: string): boolean {
  return node.type === type || node.content?.some((child) => containsNodeType(child, type)) === true
}

function findNodes(node: DocumentNode, type: string): DocumentNode[] {
  return [
    ...(node.type === type ? [node] : []),
    ...(node.content?.flatMap((child) => findNodes(child, type)) ?? []),
  ]
}

suite("Linear Markdown", () => {
  for (const filename of ["des-538-description.graphql.md", "des-538-comment.graphql.md"]) {
    test(`round-trips anonymized live fixture ${filename}`, () => {
      const source = readFileSync(
        resolve(__dirname, "../../../src/test/fixtures/linearMarkdown", filename),
        "utf8",
      ).trimEnd()

      assert.doesNotMatch(source, /signature=eyJ/i)

      const inspection = inspectLinearMarkdown(source)
      assert.strictEqual(
        inspection.ok,
        true,
        inspection.ok ? undefined : JSON.stringify(inspection.diagnostics, null, 2),
      )
      if (!inspection.ok) return

      assert.ok(inspection.markdown.trim())
      assert.doesNotMatch(inspection.markdown, /[?&]signature=/)
      if (filename.startsWith("des-538-description")) {
        const json = JSON.stringify(inspection.document)
        for (const nodeType of [
          "table",
          "details",
          "mention",
          "audio",
          "video",
          "image",
          "linearFile",
        ]) {
          assert.strictEqual(containsNodeType(inspection.document, nodeType), true, nodeType)
        }
        assert.match(json, /"text":"a\|b"/)
        assert.match(json, /"id":"11111111-1111-4111-8111-111111111111"/)
      }
      const reparsed = inspectLinearMarkdown(inspection.markdown)
      assert.strictEqual(reparsed.ok, true)
      if (reparsed.ok) assert.deepStrictEqual(reparsed.document, inspection.document)
    })
  }

  fixtures.forEach(({ name, markdown, nodeType }) => {
    test(`round-trips ${name}`, () => {
      const inspection = inspectLinearMarkdown(markdown)

      assert.strictEqual(
        inspection.ok,
        true,
        inspection.ok ? undefined : inspection.diagnostics[0]?.message,
      )
      if (!inspection.ok) {
        return
      }

      assert.ok(inspection.markdown.length > 0)
      const reparsed = inspectLinearMarkdown(inspection.markdown)
      assert.strictEqual(reparsed.ok, true)
      if (reparsed.ok) {
        assert.deepStrictEqual(reparsed.document, inspection.document)
      }
      if (nodeType) {
        assert.strictEqual(containsNodeType(inspection.document, nodeType), true)
      }
    })
  })

  test("keeps Linear URLs in code and link destinations out of mention nodes", () => {
    const markdown =
      "`https://linear.app/acme/profiles/julie` [profile](https://linear.app/acme/profiles/julie)"
    const inspection = inspectLinearMarkdown(markdown)

    assert.strictEqual(inspection.ok, true)
    if (!inspection.ok) {
      return
    }

    assert.strictEqual(containsNodeType(inspection.document, "mention"), false)
  })

  test("recognizes Linear's canonicalized bare URL links as mentions", () => {
    const resourceUrl = "https://linear.app/acme/project/markdown-parity-123"
    const inspection = inspectLinearMarkdown(`[${resourceUrl}](<${resourceUrl}>)`)

    assert.strictEqual(inspection.ok, true)
    if (!inspection.ok) return

    const mention = findNodes(inspection.document, "mention")[0]?.attrs
    assert.strictEqual(mention?.id, "markdown-parity-123")
    assert.strictEqual(mention?.label, "markdown-parity-123")
    assert.strictEqual(mention?.kind, "project")
    assert.strictEqual(mention?.resourceUrl, resourceUrl)
    assert.strictEqual(inspection.markdown, resourceUrl)
  })

  test("recognizes canonical issue links as mentions", () => {
    const resourceUrl = "https://linear.app/acme/issue/ENG-42/example"
    const inspection = inspectLinearMarkdown(`[ENG-42](<${resourceUrl}>)`)

    assert.strictEqual(inspection.ok, true)
    if (!inspection.ok) return
    assert.strictEqual(findNodes(inspection.document, "mention")[0]?.attrs?.kind, "issue")
    assert.strictEqual(inspection.markdown, resourceUrl)
  })

  test("keeps punctuation outside Linear mentions and ignores URLs inside words", () => {
    const quoted = inspectLinearMarkdown('"https://linear.app/acme/issue/ABC-1"')

    assert.strictEqual(quoted.ok, true)
    if (quoted.ok) {
      assert.strictEqual(
        findNodes(quoted.document, "mention")[0]?.attrs?.resourceUrl,
        "https://linear.app/acme/issue/ABC-1",
      )
      assert.ok(quoted.markdown.startsWith('"https://'))
      assert.ok(quoted.markdown.endsWith('ABC-1"'))
    }

    const embedded = inspectLinearMarkdown("foohttps://linear.app/acme/issue/ABC-1")
    assert.strictEqual(embedded.ok, true)
    if (embedded.ok) {
      assert.strictEqual(containsNodeType(embedded.document, "mention"), false)
    }
  })

  test("keeps details delimiters inside code blocks as code", () => {
    const markdown = "```text\n+++ Not details\n+++\n```"
    const inspection = inspectLinearMarkdown(markdown)

    assert.strictEqual(inspection.ok, true)
    if (inspection.ok) {
      assert.strictEqual(containsNodeType(inspection.document, "details"), false)
    }
  })

  test("keeps details delimiters and indented code inside details", () => {
    for (const markdown of [
      "+++ More\n\n```text\n+++\n```\n\nAfter\n\n+++",
      "+++ More\n\n    const value = 1\n\n+++",
    ]) {
      const inspection = inspectLinearMarkdown(markdown)
      assert.strictEqual(
        inspection.ok,
        true,
        inspection.ok ? undefined : inspection.diagnostics[0]?.message,
      )
      if (inspection.ok) {
        assert.strictEqual(containsNodeType(inspection.document, "codeBlock"), true)
      }
    }
  })

  test("keeps TeX-like delimiters inside code", () => {
    for (const markdown of ["`\\(x + y\\)`", "```text\n\\[x + y\\]\n```"]) {
      const inspection = inspectLinearMarkdown(markdown)
      assert.strictEqual(
        inspection.ok,
        true,
        inspection.ok ? undefined : inspection.diagnostics[0]?.message,
      )
    }
  })

  test("keeps ordinary provider links as links", () => {
    for (const markdown of [
      "[YouTube](https://www.youtube.com/watch?v=abc123)",
      "[Download](https://uploads.linear.app/demo.mp4)",
    ]) {
      const inspection = inspectLinearMarkdown(markdown)

      assert.strictEqual(inspection.ok, true)
      if (inspection.ok) {
        assert.strictEqual(containsNodeType(inspection.document, "video"), false)
      }
    }
  })

  test("preserves portable list, checklist, and table attributes", () => {
    const inspection = inspectLinearMarkdown(
      "3. Third\n4. Fourth\n\n- [ ] Pending\n- [x] Done\n\n| Left | Right |\n| -- | -- |\n| A | 1 |",
    )

    assert.strictEqual(inspection.ok, true)
    if (!inspection.ok) return

    assert.strictEqual(findNodes(inspection.document, "orderedList")[0]?.attrs?.start, 3)
    assert.deepStrictEqual(
      findNodes(inspection.document, "taskItem").map((node) => node.attrs?.checked),
      [false, true],
    )
    assert.deepStrictEqual(
      findNodes(inspection.document, "tableHeader").map((node) => node.attrs?.align),
      [null, null],
    )

    const codePipe = inspectLinearMarkdown("| Code |\n| -- |\n| `a|b` |")
    assert.strictEqual(codePipe.ok, true)
    if (codePipe.ok) {
      assert.match(codePipe.markdown, /`a\|b`/)
      assert.doesNotMatch(codePipe.markdown, /`a\\\|b`/)
    }
  })

  test("canonicalizes Markdown hard breaks to Linear soft breaks", () => {
    for (const source of ["First line  \nSecond line", "First line\\\nSecond line"]) {
      const inspection = inspectLinearMarkdown(source)

      assert.strictEqual(inspection.ok, true)
      if (!inspection.ok) continue
      assert.strictEqual(inspection.markdown, "First line\nSecond line")
      assert.strictEqual(containsNodeType(inspection.document, "hardBreak"), true)
    }
  })

  test("decodes escaped punctuation in media labels and titles", () => {
    const sources = [
      ["![A \\* image](https://example.com/a.png)", "image", "A * image"],
      ["![A \\* song](https://uploads.linear.app/a.mp3)", "audio", "A * song"],
      ["![A \\* video](https://uploads.linear.app/a.mp4)", "video", "A * video"],
    ] as const

    for (const [source, type, expected] of sources) {
      const inspection = inspectLinearMarkdown(source)
      assert.strictEqual(
        inspection.ok,
        true,
        inspection.ok ? undefined : inspection.diagnostics[0]?.message,
      )
      if (inspection.ok) {
        const attributes = findNodes(inspection.document, type)[0]?.attrs
        assert.strictEqual(attributes?.[type === "image" ? "alt" : "title"], expected)
      }
    }
  })

  test("emits idempotent canonical Markdown for ordinary HTML punctuation", () => {
    for (const source of ["A & B", "A < B > C", "[A & B](https://example.com)"]) {
      const inspection = inspectLinearMarkdown(source)
      assert.strictEqual(inspection.ok, true)
      if (!inspection.ok) continue

      const canonicalInspection = inspectLinearMarkdown(inspection.markdown)
      assert.strictEqual(
        canonicalInspection.ok,
        true,
        canonicalInspection.ok ? undefined : canonicalInspection.diagnostics[0]?.message,
      )
      if (!canonicalInspection.ok) continue

      assert.deepStrictEqual(canonicalInspection.document, inspection.document)
      assert.strictEqual(canonicalInspection.markdown, inspection.markdown)
    }
  })

  test("rejects marks and outer links around atomic nodes", () => {
    const user = '<user id="11111111-1111-4111-8111-111111111111">Alice</user>'
    const issue =
      '<issue id="33333333-3333-4333-8333-333333333333" href="https://linear.app/example/issue/EX-538/example">EX-538</issue>'
    const file =
      '<linear-embed node-type="file">{"uploadState":"finished","href":"https://uploads.linear.app/report.pdf","name":"report.pdf","size":1,"mimetype":"application/pdf"}</linear-embed>'

    for (const source of [
      `**${user}**`,
      `**${issue}**`,
      "**![Image](https://example.com/image.png)**",
      "[![Audio](https://uploads.linear.app/audio.mp3)](https://example.com)",
      "~~![](https://www.youtube.com/watch?v=dQw4w9WgXcQ)~~",
      `**${file}**`,
    ]) {
      const inspection = inspectLinearMarkdown(source)
      assert.strictEqual(inspection.ok, false, source)
      if (!inspection.ok) assert.strictEqual(inspection.source, source)
    }
  })

  test("canonicalizes confirmed signatures on Linear asset nodes and links", () => {
    for (const source of [
      "![Image](https://uploads.linear.app/image.png?signature=secret)",
      "![Audio](https://uploads.linear.app/audio.mp3?signature=secret)",
      "![Video](https://uploads.linear.app/video.mp4?signature=secret)",
      "[Download](https://uploads.linear.app/report.pdf?signature=secret)",
      '<linear-embed node-type="file">{"uploadState":"finished","href":"https://uploads.linear.app/report.pdf?signature=secret","name":"report.pdf","size":1,"mimetype":"application/pdf"}</linear-embed>',
    ]) {
      const inspection = inspectLinearMarkdown(source)
      assert.strictEqual(
        inspection.ok,
        true,
        inspection.ok ? undefined : inspection.diagnostics[0]?.message,
      )
      if (inspection.ok) assert.doesNotMatch(inspection.markdown, /[?&]signature=/)
    }

    for (const source of ["![Image](https://uploads.linear.app/image.png?Signature=secret)"]) {
      const inspection = inspectLinearMarkdown(source)
      assert.strictEqual(inspection.ok, false)
      if (!inspection.ok) {
        assert.ok(inspection.diagnostics.some(({ code }) => code === "expiring-url"))
      }
    }
  })
  ;[
    { markdown: "<div>Unsupported HTML</div>", code: "unsupported-token" },
    { markdown: "[reference][id]\n\n[id]: https://example.com", code: "unsupported-token" },
    { markdown: "+++ Missing close\n\nContent", code: "malformed-details" },
    { markdown: "---\ntitle: demo\n---\nBody", code: "unsupported-syntax" },
    { markdown: "H~2~O", code: "unsupported-syntax" },
    { markdown: "&nbsp;", code: "lossy-round-trip" },
    { markdown: "[x](https://example.com/?a=1&amp;b=2)", code: "unsupported-syntax" },
    { markdown: '[x](https://example.com "Title")', code: "unsupported-syntax" },
    {
      markdown: "![A &copy;](https://example.com/a.png)",
      code: "unsupported-syntax",
    },
    {
      markdown: '![Image](https://example.com/a.png "Title")',
      code: "unsupported-syntax",
    },
    {
      markdown: "[![Image](https://example.com/a.png)](https://example.com)",
      code: "unsupported-syntax",
    },
    {
      markdown: "Before ![Image](https://example.com/a.png) after",
      code: "unsupported-syntax",
    },
    {
      markdown: "Watch ![](https://www.youtube.com/watch?v=dQw4w9WgXcQ) now",
      code: "unsupported-syntax",
    },
    {
      markdown: "| A | B |\n| :-- | --: |\n| 1 | 2 |",
      code: "unsupported-syntax",
    },
    {
      markdown: "![x](https://example.com/a.png){width=100}",
      code: "unsupported-syntax",
    },
    { markdown: "1. [x] Ordered task", code: "unsupported-syntax" },
    { markdown: "[unsafe](command:workbench.action.closeWindow)", code: "unsafe-url" },
    { markdown: "![unsafe](http://example.com/image.png)", code: "unsafe-url" },
    { markdown: "![](https://cdn.example.com/demo.mp4)", code: "unsupported-media" },
    { markdown: "![](https://uploads.linear.app/ambiguous.ogg)", code: "unsupported-media" },
    {
      markdown:
        "![private](https://uploads.linear.app/image.png?X-Goog-Expires=60&X-Goog-Signature=secret)",
      code: "expiring-url",
    },
    { markdown: "| A |\n| --- |\n| x | y |", code: "invalid-table" },
    {
      markdown: "| A | B |\n| --- | --- |\n| a \\| b | `x|y` |",
      code: "unsupported-syntax",
    },
    { markdown: "| A |\n| --- |\n| x | y \\|", code: "unsupported-syntax" },
    {
      markdown: "| H1 | H2 |\n| -- | -- |\n| \\`a|b\\` | c |",
      code: "invalid-table",
    },
    {
      markdown: "| A | B |\n| --- | --- | --- |\n| 1 | 2 | 3 |",
      code: "invalid-table",
    },
  ].forEach(({ markdown, code }) => {
    test(`preserves rejected source for ${code}`, () => {
      const inspection = inspectLinearMarkdown(markdown)

      assert.strictEqual(inspection.ok, false)
      if (inspection.ok) {
        return
      }

      assert.strictEqual(inspection.source, markdown)
      assert.ok(inspection.diagnostics.some((diagnostic) => diagnostic.code === code))
    })
  })

  test("rejects syntax when its extensions are missing", () => {
    const extensions = [Markdown, StarterKit.configure({ horizontalRule: false, gapcursor: false })]

    for (const markdown of ["| A |\n| --- |\n| B |", "- [x] Done", "---"]) {
      const inspection = inspectLinearMarkdown(markdown, extensions)

      assert.strictEqual(inspection.ok, false)
      if (!inspection.ok) {
        assert.ok(
          inspection.diagnostics.some((diagnostic) => diagnostic.code === "missing-extension"),
        )
      }
    }
  })

  test("keeps unsupported-looking syntax inside code", () => {
    for (const markdown of [
      "`![x](https://example.com/a.png =100x200)`",
      "`&copy;`",
      "```text\n| A | B |\n| --- | --- | --- |\n**unclosed\n```",
      "```markdown\n| A |\n| -- |\n| `a|b` |\n```",
    ]) {
      const inspection = inspectLinearMarkdown(markdown)
      assert.strictEqual(
        inspection.ok,
        true,
        inspection.ok ? undefined : inspection.diagnostics[0]?.message,
      )
      if (inspection.ok && markdown.includes("`a|b`")) {
        assert.match(JSON.stringify(inspection.document), /a\|b/)
        assert.doesNotMatch(JSON.stringify(inspection.document), /a\\\\\|b/)
      }
    }
  })

  test("preserves literal punctuation as text", () => {
    for (const markdown of [
      "Build fails in C++",
      "2 * 3",
      "Use ** literally",
      "*unclosed",
      "_unclosed",
      "__unclosed",
      "[array]",
      "Use ` literally",
      "~~unclosed",
      "==highlight==",
      "Math $x^2$",
      "Math \\(x + y\\)",
      "Math \\[x + y\\]",
      "x^2^",
      "Paragraph {#id}",
      "&copy;",
      "&#169;",
      "# Heading {data-x=y}",
      "![x](https://example.com/a.png =100x200)",
      "![alt](https://example.com/a.png",
      "[label](https://example.com",
      "![alt][missing]",
      "5. `$$$-",
      "\\[^FILENAME.mov\\]",
      "{panel:bgColor=#deebff}",
    ]) {
      const inspection = inspectLinearMarkdown(markdown)
      assert.strictEqual(
        inspection.ok,
        true,
        inspection.ok ? undefined : inspection.diagnostics[0]?.message,
      )
    }
  })

  test("serializes inline code with a delimiter longer than its content", () => {
    assert.strictEqual(serializeLinearInlineCode("```powershell"), "```` ```powershell ````")
    assert.strictEqual(serializeLinearInlineCode(" foo "), "`  foo  `")
  })

  test("canonicalizes an empty Linear heading without blocking the document", () => {
    const inspection = inspectLinearMarkdown("Body\n\n## ")

    assert.strictEqual(inspection.ok, true)
    if (inspection.ok) assert.strictEqual(inspection.markdown, "Body")
  })

  test("exposes one pure extension factory for editor and headless use", () => {
    const extensions = createLinearMarkdownExtensions()
    const names = extensions.map((extension) => extension.name)

    assert.ok(names.includes("markdown"))
    assert.ok(names.includes("tableKit"))
    assert.ok(names.includes("taskList"))
    assert.ok(names.includes("mention"))
    assert.ok(names.includes("linearFile"))
    assert.strictEqual(
      extensions.find((extension) => extension.name === "starterKit")?.options.trailingNode,
      false,
    )
  })

  test("does not call a save callback for rejected source", () => {
    const source = "<div>Keep this source byte for byte</div>"
    let calls = 0
    const markdown = getCanonicalLinearMarkdown(source)
    if (markdown !== undefined) calls += 1

    assert.strictEqual(markdown, undefined)
    assert.strictEqual(calls, 0)
    const inspection = inspectLinearMarkdown(source)
    assert.strictEqual(inspection.ok, false)
    if (!inspection.ok) assert.strictEqual(inspection.source, source)
  })
})

suite("video Markdown detection", () => {
  test("detects providers and direct video URLs", () => {
    assert.strictEqual(isSupportedVideoUrl("https://youtu.be/dQw4w9WgXcQ"), true)
    assert.strictEqual(isSupportedVideoUrl("https://www.loom.com/share/abc123"), true)
    assert.strictEqual(isSupportedVideoUrl("https://share.descript.com/view/abc123"), false)
    assert.strictEqual(isSupportedVideoUrl("https://www.figma.com/file/abc123"), false)
    assert.strictEqual(isSupportedVideoUrl("https://uploads.linear.app/demo.webm?token=1"), true)
    assert.strictEqual(isSupportedVideoUrl("https://uploads.linear.app/demo.ogv"), true)
    assert.strictEqual(isSupportedVideoUrl("https://uploads.linear.app/ambiguous.ogg"), false)
    assert.strictEqual(isSupportedVideoUrl("https://cdn.example.com/demo.webm"), false)
    assert.strictEqual(isSupportedVideoUrl("https://img.youtube.com/vi/dQw4w9WgXcQ/0.jpg"), false)
  })

  test("parses embed and existing link syntax", () => {
    assert.deepStrictEqual(parseVideoMarkdown("![](https://youtu.be/dQw4w9WgXcQ)"), {
      raw: "![](https://youtu.be/dQw4w9WgXcQ)",
      src: "https://youtu.be/dQw4w9WgXcQ",
      title: "",
      destinationTitle: null,
      syntax: "embed",
    })
    assert.strictEqual(parseVideoMarkdown("[Demo](https://uploads.linear.app/demo.mp4)"), null)
    assert.deepStrictEqual(
      parseVideoMarkdown('![Demo](https://uploads.linear.app/demo.mp4 "Destination title")'),
      {
        raw: '![Demo](https://uploads.linear.app/demo.mp4 "Destination title")',
        src: "https://uploads.linear.app/demo.mp4",
        title: "Demo",
        destinationTitle: "Destination title",
        syntax: "embed",
      },
    )
    assert.strictEqual(
      parseVideoMarkdown("![Demo](https://uploads.linear.app/demo.mp4 \"mismatch')"),
      null,
    )
  })

  test("finds a video token after plain text", () => {
    assert.strictEqual(findVideoMarkdown("Watch ![](https://youtu.be/dQw4w9WgXcQ)"), 6)
  })

  test("a table cell with surrounding spaces matches the document it saves as", () => {
    const extensions = createLinearMarkdownExtensions()
    const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] })
    const cell = (type: string, text: string) => ({ type, content: [paragraph(text)] })
    const editorDocument = getSchema(extensions)
      .nodeFromJSON({
        type: "doc",
        content: [
          paragraph("kept "),
          {
            type: "table",
            content: [
              { type: "tableRow", content: [cell("tableHeader", " a "), cell("tableHeader", "b")] },
              { type: "tableRow", content: [cell("tableCell", "c "), cell("tableCell", " ")] },
            ],
          },
        ],
      })
      .toJSON()

    const markdown = new MarkdownManager({ extensions }).serialize(editorDocument)
    const inspection = inspectLinearMarkdown(markdown, extensions)

    assert.strictEqual(inspection.ok, true)
    if (inspection.ok) {
      assert.deepStrictEqual(trimTableCellWhitespace(editorDocument), inspection.document)
    }
  })

  test("an editor document ending with empty lines or line breaks saves without them", () => {
    const extensions = createLinearMarkdownExtensions()
    const schema = getSchema(extensions)
    const manager = new MarkdownManager({ extensions })
    const toDocument = (content: object[]) =>
      schema.nodeFromJSON({ type: "doc", content }).toJSON() as JSONContent
    const save = (content: object[]) =>
      inspectEditorDocument(
        toDocument(content),
        (document) => manager.serialize(document),
        extensions,
      )?.markdown
    const text = (value: string, ...marks: object[]) =>
      marks.length ? { type: "text", text: value, marks } : { type: "text", text: value }
    const paragraph = (...content: object[]) =>
      content.length ? { type: "paragraph", content } : { type: "paragraph" }
    const heading = (...content: object[]) => ({ type: "heading", attrs: { level: 1 }, content })
    const hardBreak = { type: "hardBreak" }
    const link = { type: "link", attrs: { href: "https://example.com" } }
    // A Unicode space character with a visible glyph.
    const ogham = String.fromCodePoint(0x1680)
    const table = (...cell: object[]) => ({
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [{ type: "tableHeader", content: [paragraph(text("Name"))] }],
        },
        { type: "tableRow", content: [{ type: "tableCell", content: [paragraph(...cell)] }] },
      ],
    })

    // A document that could already be saved keeps exactly the same Markdown.
    assert.strictEqual(save([paragraph(text("First line")), paragraph()]), "First line\n\n")

    const saved: [string, object[], string][] = [
      ["an empty line after a heading", [heading(text("Title")), paragraph()], "# Title"],
      [
        "two empty lines after a heading",
        [heading(text("Title")), paragraph(), paragraph()],
        "# Title",
      ],
      ["only empty lines", [paragraph(), paragraph()], ""],
      ["a trailing line break", [paragraph(text("Line"), hardBreak, hardBreak)], "Line"],
      ["a heading line break", [heading(text("Title"), hardBreak)], "# Title"],
      ["a line of spaces", [paragraph(text("Line")), paragraph(text("   "))], "Line"],
      [
        "a line of bold spaces",
        [paragraph(text("Line")), paragraph(text("  ", { type: "bold" }))],
        "Line",
      ],
      ["a line break then spaces", [paragraph(text("Line"), hardBreak, text("  "))], "Line"],
      ["an empty heading", [paragraph(text("Line")), heading()], "Line"],
      [
        "a line break in the last list item",
        [
          {
            type: "bulletList",
            content: [{ type: "listItem", content: [paragraph(text("Item"), hardBreak)] }],
          },
        ],
        "- Item",
      ],
    ]
    for (const [name, content, expected] of saved) assert.strictEqual(save(content), expected, name)

    // Refused rather than saved without something the user can see.
    const refused: [string, object[]][] = [
      ["an empty line between blocks", [heading(text("Title")), paragraph(), paragraph(text("A"))]],
      [
        "inline code on a space at the end",
        [paragraph(text("Line")), paragraph(text(" ", { type: "code" }))],
      ],
      ["a link on a space in a table cell", [table(text(" ", link))]],
      ["a link on a space ending the last cell", [table(text(" ", link), hardBreak)]],
      ["a glyph space at the edge of a table cell", [table(text(`A${ogham}`))]],
    ]
    for (const [name, content] of refused) assert.strictEqual(save(content), undefined, name)

    const glyphLine = toDocument([paragraph(text("Line")), paragraph(text(ogham))])
    assert.deepStrictEqual(trimDocumentEnd(glyphLine), glyphLine)
  })
})
