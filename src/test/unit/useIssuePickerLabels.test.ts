import * as assert from "assert"

import { resolveIssuePickerLabels } from "../../webviews/hooks/useIssuePickerLabels"

suite("Issue picker labels", () => {
  const teamLabels = [
    { id: "team-bug", name: "Bug", color: "#ff0000" },
    { id: "workspace-feature", name: "Feature", color: "#00ff00" },
  ]

  test("keeps issue labels when the project has no labels or is still loading", () => {
    for (const projectLabels of [undefined, []]) {
      const { issueLabels } = resolveIssuePickerLabels(teamLabels, projectLabels)

      assert.deepStrictEqual(issueLabels, teamLabels)
    }
  })

  test("uses project labels only for branch prefixes, not issue assignment", () => {
    const projectLabels = [{ id: "project-platform", name: "Platform", color: "#0000ff" }]
    const { issueLabels, branchPrefixLabels } = resolveIssuePickerLabels(teamLabels, projectLabels)

    assert.deepStrictEqual(issueLabels, teamLabels)
    assert.deepStrictEqual(branchPrefixLabels, [...teamLabels, ...projectLabels])
  })
})
