import * as assert from "assert"

import { getSchema } from "@tiptap/core"

import {
  createLinearMarkdownExtensions,
  inspectLinearMarkdown,
} from "../../webviews/components/Editor/linearMarkdown"
import { getImageDragSelection } from "../../webviews/components/Editor/markdownPlugins/LinearImage"

suite("Image drag selection", () => {
  const schema = getSchema(createLinearMarkdownExtensions())
  const image = schema.nodes.image.create({
    src: "https://uploads.linear.app/workspace/image",
    alt: "Picture",
    linkHref: "https://example.com",
  })

  test("moves the entire standalone image paragraph with all image attributes", () => {
    const paragraph = schema.nodes.paragraph.create(null, image)
    const document = schema.nodes.doc.create(null, [paragraph, schema.nodes.paragraph.create()])
    const selection = getImageDragSelection(document, 1)

    assert.ok(selection)
    assert.strictEqual(selection.from, 0)
    assert.strictEqual(selection.to, paragraph.nodeSize)
    assert.ok(selection.node.eq(paragraph))
  })

  test("leaves inline images, other nodes and drags outside the document to native handling", () => {
    const paragraph = schema.nodes.paragraph.create(null, [image, schema.text(" caption")])
    const document = schema.nodes.doc.create(null, paragraph)

    assert.strictEqual(getImageDragSelection(document, 1), null)
    assert.strictEqual(getImageDragSelection(document, 2), null)
    assert.strictEqual(getImageDragSelection(document, 0), null)
    assert.strictEqual(getImageDragSelection(document, -1), null)
  })

  test("selects only the image paragraph inside a quote", () => {
    const source = "> Before\n>\n> ![Picture](<https://uploads.linear.app/workspace/image>)"
    const inspection = inspectLinearMarkdown(source)
    assert.ok(inspection.ok)
    const document = schema.nodeFromJSON(inspection.document)
    let imagePosition = -1
    document.descendants((node, position) => {
      if (node.type.name === "image") imagePosition = position
    })

    const selection = getImageDragSelection(document, imagePosition)
    assert.ok(selection)
    assert.strictEqual(selection.node.type.name, "paragraph")
    assert.strictEqual(selection.node.childCount, 1)
    assert.strictEqual(selection.node.firstChild?.type.name, "image")
  })
})
