import * as assert from "assert"

import { getSchema } from "@tiptap/core"
import { EditorState, TextSelection } from "@tiptap/pm/state"

import { createLinearMarkdownExtensions } from "../../webviews/components/Editor/linearMarkdown"
import {
  deleteEmptyRowOnBackspace,
  deleteTableFromEmptyFirstCell,
  moveToPreviousCellOnBackspace,
  handleEnterInTable,
} from "../../webviews/components/Editor/markdownPlugins/LinearTable"

const schema = getSchema(createLinearMarkdownExtensions())
const cell = (text: string) => ({
  type: "tableCell",
  content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }],
})
const tableDoc = (...rows: string[][]) =>
  schema.nodeFromJSON({
    type: "doc",
    content: [
      {
        type: "table",
        content: rows.map((row) => ({ type: "tableRow", content: row.map(cell) })),
      },
    ],
  })
const doc = schema.nodeFromJSON({
  type: "doc",
  content: [
    {
      type: "table",
      content: [
        { type: "tableRow", content: [cell("a"), cell("b")] },
        { type: "tableRow", content: [cell("c"), cell("d")] },
      ],
    },
  ],
})

function stateAtEndOf(text: string, offset = 1) {
  let pos = -1
  doc.descendants((node, nodePos) => {
    if (node.isText && node.text === text) pos = nodePos + offset
  })
  return EditorState.create({ doc, selection: TextSelection.create(doc, pos) })
}

const emptyFirstCellDoc = schema.nodeFromJSON({
  type: "doc",
  content: [
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [{ type: "tableCell", content: [{ type: "paragraph" }] }, cell("b")],
        },
      ],
    },
  ],
})
// doc(0) > table(1) > row(2) > cell(3) > paragraph(4)
const inEmptyFirstCell = () =>
  EditorState.create({
    doc: emptyFirstCellDoc,
    selection: TextSelection.create(emptyFirstCellDoc, 4),
  })

suite("handleEnterInTable", () => {
  test("adds a row from the end of the last cell, then leaves the table from that empty row", () => {
    const withRow = handleEnterInTable(stateAtEndOf("d"))

    assert.ok(withRow)
    withRow.doc.check()
    const table = withRow.doc.firstChild
    assert.strictEqual(table?.childCount, 3)
    assert.strictEqual(withRow.selection.$head.parent, table?.lastChild?.firstChild?.firstChild)

    const exited = handleEnterInTable(
      EditorState.create({ doc: withRow.doc, selection: withRow.selection }),
    )

    assert.ok(exited)
    exited.doc.check()
    assert.strictEqual(exited.doc.firstChild?.childCount, 2)
    assert.strictEqual(exited.doc.lastChild?.type.name, "paragraph")
    assert.strictEqual(exited.selection.$head.parent, exited.doc.lastChild)
  })

  test("keeps an empty row that is not the last one", () => {
    const document = tableDoc(["a", "b"], ["", ""], ["e", "f"])
    const state = EditorState.create({
      doc: document,
      selection: TextSelection.create(document, 16),
    })
    assert.strictEqual(handleEnterInTable(state), null)
  })

  test("leaves Enter to other handlers elsewhere in the table", () => {
    assert.strictEqual(handleEnterInTable(stateAtEndOf("a")), null)
    assert.strictEqual(handleEnterInTable(stateAtEndOf("b")), null)
    assert.strictEqual(handleEnterInTable(stateAtEndOf("c")), null)
    assert.strictEqual(handleEnterInTable(stateAtEndOf("d", 0)), null)
  })

  test("adds a paragraph above the table from the start of the first cell", () => {
    for (const state of [stateAtEndOf("a", 0), inEmptyFirstCell()]) {
      const tr = handleEnterInTable(state)

      assert.ok(tr)
      assert.strictEqual(tr.doc.firstChild?.type.name, "paragraph")
      assert.strictEqual(tr.doc.lastChild?.type.name, "table")
      assert.strictEqual(tr.selection.$head.parent, tr.doc.firstChild)
    }
  })
})

suite("deleteTableFromEmptyFirstCell", () => {
  test("removes the table and keeps a valid document", () => {
    const tr = deleteTableFromEmptyFirstCell(inEmptyFirstCell())

    assert.ok(tr)
    tr.doc.check()
    let hasTable = false
    tr.doc.descendants((node) => {
      if (node.type.name === "table") hasTable = true
    })
    assert.strictEqual(hasTable, false)
  })

  test("ignores a first cell with text", () => {
    assert.strictEqual(deleteTableFromEmptyFirstCell(stateAtEndOf("a")), null)
  })
})

suite("deleteEmptyRowOnBackspace", () => {
  // The empty row's first cell starts its paragraph at 16, its second cell at 20.
  const withEmptyRow = tableDoc(["a", "b"], ["", ""], ["e", "f"])
  const at = (document: typeof withEmptyRow, pos: number) =>
    EditorState.create({ doc: document, selection: TextSelection.create(document, pos) })

  test("removes an empty row from its first column and moves to the row above", () => {
    const tr = deleteEmptyRowOnBackspace(at(withEmptyRow, 16))

    assert.ok(tr)
    tr.doc.check()
    assert.strictEqual(tr.doc.firstChild?.childCount, 2)
    assert.strictEqual(tr.selection.$head.parent.textContent, "b")
    assert.strictEqual(tr.selection.$head.parentOffset, 1)
  })

  test("moves into the new first row when the first row is removed", () => {
    const document = tableDoc(["", ""], ["c", "d"])
    const tr = deleteEmptyRowOnBackspace(at(document, 4))

    assert.ok(tr)
    assert.strictEqual(tr.doc.firstChild?.childCount, 1)
    assert.strictEqual(tr.selection.$head.parent.textContent, "c")
  })

  test("removes the table with its only row", () => {
    const tr = deleteEmptyRowOnBackspace(at(tableDoc(["", ""]), 4))

    assert.ok(tr)
    tr.doc.check()
    assert.strictEqual(tr.doc.firstChild?.type.name, "paragraph")
  })

  test("ignores other columns and rows with text", () => {
    assert.strictEqual(deleteEmptyRowOnBackspace(at(withEmptyRow, 20)), null)
    assert.strictEqual(deleteEmptyRowOnBackspace(inEmptyFirstCell()), null)
  })
})

suite("moveToPreviousCellOnBackspace", () => {
  // Rows [a, ""] and ["", d]: the empty cells' paragraphs start at 9 and 15.
  const document = tableDoc(["a", ""], ["", "d"])
  const at = (pos: number) =>
    EditorState.create({ doc: document, selection: TextSelection.create(document, pos) })

  test("moves to the end of the previous cell in the row", () => {
    const tr = moveToPreviousCellOnBackspace(at(9))

    assert.ok(tr)
    assert.strictEqual(tr.selection.$head.parent.textContent, "a")
    assert.strictEqual(tr.selection.$head.parentOffset, 1)
  })

  test("wraps to the last cell of the row above", () => {
    const tr = moveToPreviousCellOnBackspace(at(15))

    assert.ok(tr)
    assert.strictEqual(tr.selection.head, 9)
  })

  test("ignores cells with text and the first cell", () => {
    assert.strictEqual(moveToPreviousCellOnBackspace(stateAtEndOf("d")), null)
    assert.strictEqual(moveToPreviousCellOnBackspace(inEmptyFirstCell()), null)
  })
})
