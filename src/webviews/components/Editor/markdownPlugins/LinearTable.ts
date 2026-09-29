import { Editor } from "@tiptap/core"
import { renderTableToMarkdown, Table, TableCell, TableHeader } from "@tiptap/extension-table"
import { EditorState, Selection, TextSelection, Transaction } from "@tiptap/pm/state"

export const LinearTableCell = TableCell.extend({ content: "paragraph" })
export const LinearTableHeader = TableHeader.extend({ content: "paragraph" })

function isEscaped(value: string, index: number): boolean {
  let backslashes = 0
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    backslashes += 1
  }
  return backslashes % 2 === 1
}

export function escapeLinearTableCellPipes(markdown: string): string {
  let result = ""
  let codeDelimiterLength = 0

  for (let index = 0; index < markdown.length; index += 1) {
    if (markdown[index] === "`" && !isEscaped(markdown, index)) {
      let length = 1
      while (markdown[index + length] === "`") length += 1
      if (codeDelimiterLength === 0) codeDelimiterLength = length
      else if (codeDelimiterLength === length) codeDelimiterLength = 0
      result += markdown.slice(index, index + length)
      index += length - 1
      continue
    }

    result += markdown[index] === "|" && codeDelimiterLength === 0 ? "\\|" : markdown[index]
  }

  return result
}

/** The caret's position in a table cell (paragraph > cell > row > table), when nothing is selected. */
function caretInTableCell(state: EditorState) {
  const { empty, $head } = state.selection
  if (!empty || $head.depth < 3) return null

  const tableDepth = $head.depth - 3
  const table = $head.node(tableDepth)
  if (table.type.name !== "table") return null

  const row = $head.node(tableDepth + 1)
  const rowIndex = $head.index(tableDepth)
  const cellIndex = $head.index(tableDepth + 1)
  return {
    table: { from: $head.before(tableDepth), to: $head.after(tableDepth) },
    row: { from: $head.before(tableDepth + 1), to: $head.after(tableDepth + 1) },
    rowIndex,
    columnCount: row.childCount,
    isOnlyRow: table.childCount === 1,
    isLastRow: rowIndex === table.childCount - 1,
    inFirstColumnOfEmptyRow:
      cellIndex === 0 && row.children.every((cell) => cell.firstChild?.content.size === 0),
    cellFrom: $head.before(tableDepth + 2),
    inEmptyCell: $head.parent.content.size === 0,
    inFirstCell: rowIndex === 0 && cellIndex === 0,
    inEmptyFirstCell: rowIndex === 0 && cellIndex === 0 && $head.parent.content.size === 0,
    atStartOfFirstCell: rowIndex === 0 && cellIndex === 0 && $head.parentOffset === 0,
    atEndOfLastCell:
      rowIndex === table.childCount - 1 &&
      cellIndex === row.childCount - 1 &&
      $head.parentOffset === $head.parent.content.size,
  }
}

/**
 * Cells hold one line, so Enter moves through the table: at the end of the last cell it adds a row
 * and moves to its first cell, and in the first cell of that row, still empty, it replaces the row
 * with a paragraph below the table. At the start of the first cell it adds a paragraph above.
 */
export function handleEnterInTable(state: EditorState): Transaction | null {
  const caret = caretInTableCell(state)
  if (!caret) return null
  const { paragraph, tableCell, tableRow } = state.schema.nodes

  if (caret.atStartOfFirstCell) {
    const tr = state.tr.insert(caret.table.from, paragraph.create())
    return tr.setSelection(TextSelection.create(tr.doc, caret.table.from + 1)).scrollIntoView()
  }

  if (caret.isLastRow && caret.inFirstColumnOfEmptyRow) {
    const pos = caret.table.to - (caret.row.to - caret.row.from)
    const tr = state.tr.delete(caret.row.from, caret.row.to).insert(pos, paragraph.create())
    return tr.setSelection(TextSelection.create(tr.doc, pos + 1)).scrollIntoView()
  }

  if (caret.atEndOfLastCell) {
    const cells = Array.from({ length: caret.columnCount }, () =>
      tableCell.create(null, paragraph.create()),
    )
    const tr = state.tr.insert(caret.row.to, tableRow.create(null, cells))
    // row > cell > paragraph
    return tr.setSelection(TextSelection.create(tr.doc, caret.row.to + 3)).scrollIntoView()
  }

  return null
}

function deleteTable(state: EditorState, table: { from: number; to: number }): Transaction {
  const tr = state.tr.delete(table.from, table.to)
  return tr.setSelection(Selection.near(tr.doc.resolve(table.from))).scrollIntoView()
}

/** Backspace or Delete in an empty first cell removes the whole table (Undo restores it). */
export function deleteTableFromEmptyFirstCell(state: EditorState): Transaction | null {
  const caret = caretInTableCell(state)
  return caret?.inEmptyFirstCell ? deleteTable(state, caret.table) : null
}

/**
 * Backspace in the first column of an empty row removes the row, then moves the caret to the end
 * of the row above (or into the new first row). A table's only row takes the table with it.
 */
export function deleteEmptyRowOnBackspace(state: EditorState): Transaction | null {
  const caret = caretInTableCell(state)
  if (!caret?.inFirstColumnOfEmptyRow) return null
  if (caret.isOnlyRow) return deleteTable(state, caret.table)

  const tr = state.tr.delete(caret.row.from, caret.row.to)
  const bias = caret.rowIndex > 0 ? -1 : 1
  return tr.setSelection(Selection.near(tr.doc.resolve(caret.row.from), bias)).scrollIntoView()
}

/** Backspace in an empty cell moves to the end of the previous cell, wrapping to the row above. */
export function moveToPreviousCellOnBackspace(state: EditorState): Transaction | null {
  const caret = caretInTableCell(state)
  if (!caret?.inEmptyCell || caret.inFirstCell) return null

  const tr = state.tr
  return tr.setSelection(Selection.near(tr.doc.resolve(caret.cellFrom), -1)).scrollIntoView()
}

function runOnState(getTransaction: (state: EditorState) => Transaction | null) {
  return ({ editor }: { editor: Editor }) => {
    const tr = getTransaction(editor.state)
    if (tr) editor.view.dispatch(tr)
    return !!tr
  }
}

export const LinearTable = Table.extend({
  addKeyboardShortcuts() {
    const parent = this.parent?.()
    const deleteRow = runOnState(deleteEmptyRowOnBackspace)
    const deleteTable = runOnState(deleteTableFromEmptyFirstCell)
    const moveToPreviousCell = runOnState(moveToPreviousCellOnBackspace)

    return {
      ...parent,
      "|": () => this.editor.isActive("table") && !this.editor.isActive("code"),
      Enter: runOnState(handleEnterInTable),
      Backspace: (props) =>
        deleteRow(props) ||
        deleteTable(props) ||
        moveToPreviousCell(props) ||
        !!parent?.Backspace?.(props),
      Delete: (props) => deleteTable(props) || !!parent?.Delete?.(props),
    }
  },

  renderMarkdown(node, helpers) {
    const renderChildren = helpers.renderChildren

    return renderTableToMarkdown(node, {
      ...helpers,
      renderChildren: (children, separator) =>
        escapeLinearTableCellPipes(renderChildren(children, separator)),
    })
  },
}).configure({ resizable: false })
