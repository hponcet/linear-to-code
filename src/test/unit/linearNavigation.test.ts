import * as assert from "assert"

import {
  buildNavigationIssueFilter,
  defaultNavigationFilters,
  NavigationMetadata,
  normalizeNavigationFilters,
  restoreNavigationFilters,
} from "../../linear/navigation"

export const navigationMetadata: NavigationMetadata = {
  teams: [
    { id: "team", name: "Engineering" },
    { id: "design", name: "Design" },
  ],
  projects: [
    { id: "shared", name: "Shared project", teamIds: ["team", "design"] },
    { id: "design-only", name: "Design project", teamIds: ["design"] },
  ],
  cycles: [{ id: "cycle", name: "Cycle 1", teamId: "team" }],
  states: [
    { id: "todo", name: "Todo", teamId: "team", color: "#888888" },
    { id: "design-todo", name: "Todo", teamId: "design", color: "#444444" },
  ],
}

suite("Linear navigation filters", () => {
  test("defaults to all issues and composes every API filter", () => {
    assert.deepStrictEqual(buildNavigationIssueFilter(defaultNavigationFilters(), "me"), {})
    assert.deepStrictEqual(
      buildNavigationIssueFilter(
        {
          teamId: "team",
          projectId: "shared",
          view: "myIssues",
          cycle: "current",
          stateIds: ["todo", "done"],
        },
        "me",
      ),
      {
        team: { id: { eq: "team" } },
        project: { id: { eq: "shared" } },
        assignee: { id: { eq: "me" } },
        cycle: { isActive: { eq: true } },
        state: { id: { in: ["todo", "done"] } },
      },
    )
    assert.deepStrictEqual(
      buildNavigationIssueFilter(
        { ...defaultNavigationFilters(), projectId: null, cycle: "none" },
        "me",
      ),
      { project: { null: true }, cycle: { null: true } },
    )
    assert.deepStrictEqual(
      buildNavigationIssueFilter({ ...defaultNavigationFilters(), cycle: { id: "cycle" } }, "me"),
      { cycle: { id: { eq: "cycle" } } },
    )
  })

  test("keeps cross-team projects and clears incompatible or inaccessible filters", () => {
    const filters = {
      ...defaultNavigationFilters(),
      projectId: "shared",
      stateIds: ["todo", "design-todo", "removed"],
      cycle: { id: "cycle" },
    }
    assert.deepStrictEqual(normalizeNavigationFilters(filters, navigationMetadata).stateIds, [
      "todo",
      "design-todo",
    ])
    const scoped = normalizeNavigationFilters({ ...filters, teamId: "design" }, navigationMetadata)
    assert.strictEqual(scoped.projectId, "shared")
    assert.deepStrictEqual(scoped.stateIds, ["design-todo"])
    assert.strictEqual(scoped.cycle, "any")
    assert.strictEqual(
      normalizeNavigationFilters(
        { ...filters, teamId: "team", projectId: "design-only" },
        navigationMetadata,
      ).projectId,
      undefined,
    )
    const removed = normalizeNavigationFilters(filters, {
      teams: [],
      projects: [],
      cycles: [],
      states: [],
    })
    assert.strictEqual(removed.projectId, undefined)
    assert.strictEqual(removed.cycle, "any")
    assert.deepStrictEqual(removed.stateIds, [])
  })

  test("restores recognized stored values and tolerates old or malformed state", () => {
    assert.deepStrictEqual(
      restoreNavigationFilters({ cycle: null, stateIds: "invalid", view: "currentCycle" }),
      defaultNavigationFilters(),
    )
    assert.deepStrictEqual(
      restoreNavigationFilters({
        view: "myIssues",
        stateIds: ["todo", "todo", 1],
        projectId: null,
      }),
      { ...defaultNavigationFilters(), view: "myIssues", stateIds: ["todo"], projectId: null },
    )
  })
})
