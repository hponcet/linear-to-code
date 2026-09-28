import * as assert from "assert"
import { readFileSync } from "fs"
import * as path from "path"

import { WorkflowState } from "@linear/sdk"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ExtensionContext } from "vscode"

import { Controller } from "../../controller"
import { filterWorkflowStatesByType } from "../../panels/commons/worflowStates"
import { Resources } from "../../resources"
import { SerializedWorkflowState } from "../../types/SerializedLinear"
import { createWorkflowStateTreeItem } from "../../views/myIssues/treeItems"
import { WorkflowStateIcon } from "../../webviews/components/WorklfowStatePicker/WorkflowStateIcon"

const duplicate: SerializedWorkflowState = {
  id: "duplicate",
  name: "Duplicate",
  type: "duplicate",
  color: "#95a2b3",
  position: 0,
  stateProgress: 0,
  stateTypeLength: 1,
}
const extensionRoot = path.resolve(__dirname, "../../..")

suite("Duplicate workflow icon", () => {
  test("renders the supplied SVG with the configured size and status color", () => {
    const svg = readFileSync(
      path.join(extensionRoot, "resources/images/statues/duplicate.svg"),
      "utf8",
    )
    const shape = svg.match(/\bd="([^"]+)"/)?.[1]
    assert.ok(shape)
    const markup = renderToStaticMarkup(
      createElement(WorkflowStateIcon, {
        workflowState: { ...duplicate, color: "#123456" },
        size: 20,
        className: "statusIcon",
        style: { marginRight: 8 },
      }),
    )
    assert.ok(markup.includes(`d="${shape}"`))
    assert.match(markup, /fill="#123456"/)
    assert.match(markup, /width="20" height="20"/)
    assert.match(markup, /class="statusIcon"/)
    assert.match(markup, /fill-rule="evenodd" clip-rule="evenodd"/)
    assert.match(markup, /aria-hidden="true"/)
    assert.doesNotMatch(markup, /❓/)
  })

  test("recognizes duplicate statuses and resolves their icon in the native tree", () => {
    const original = Controller.resources
    Controller.resources = new Resources({
      asAbsolutePath: (relative: string) => path.join(extensionRoot, relative),
    } as ExtensionContext)
    try {
      const states = filterWorkflowStatesByType([
        duplicate,
        { ...duplicate, id: "canceled", type: "canceled", position: 1 },
      ] as unknown as WorkflowState[])
      assert.deepStrictEqual(
        states.map(({ type }) => type),
        ["canceled", "duplicate"],
      )
      const item = createWorkflowStateTreeItem(states[1], 1)
      assert.strictEqual(
        item.iconPath?.toString(),
        Controller.resources.icons.get("duplicate")?.toString(),
      )
      assert.ok(Controller.resources.icons.get("duplicate")?.fsPath.endsWith("duplicate.svg"))
    } finally {
      Controller.resources = original
    }
  })
})
