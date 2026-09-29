import * as assert from "assert"

import { UNASSIGNED_ASSIGNEE_ID } from "../../constants"
import {
  buildNavigationIssueFilter,
  defaultNavigationFilters,
  NavigationFilters,
  NavigationMetadata,
  normalizeNavigationFilters,
  restoreNavigationFilters,
} from "../../linear/navigation"

/** The unfiltered workspace view, which these tests use as their neutral starting point. */
const allIssuesFilters = (): NavigationFilters => ({
  ...defaultNavigationFilters(),
  view: "allIssues",
  cycle: "any",
})

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
    {
      id: "todo",
      name: "Todo",
      teamId: "team",
      color: "#888888",
      type: "unstarted",
      position: 0,
      stateProgress: 0,
      stateTypeLength: 1,
    },
    {
      id: "design-todo",
      name: "Todo",
      teamId: "design",
      color: "#444444",
      type: "unstarted",
      position: 0,
      stateProgress: 0,
      stateTypeLength: 1,
    },
  ],
  users: [
    { id: "alice", name: "Alice", email: "alice@example.com" },
    { id: "bob", name: "Bob", email: "bob@example.com" },
  ],
}

suite("Linear navigation filters", () => {
  test("defaults to my issues in the current cycle and composes every API filter", () => {
    assert.deepStrictEqual(buildNavigationIssueFilter(defaultNavigationFilters(), "me"), {
      assignee: { id: { eq: "me" } },
      cycle: { isActive: { eq: true } },
    })
    assert.deepStrictEqual(
      buildNavigationIssueFilter(
        {
          teamId: "team",
          projectId: "shared",
          view: "myIssues",
          cycle: "current",
          stateIds: ["todo", "done"],
          assigneeIds: [],
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
      buildNavigationIssueFilter({ ...allIssuesFilters(), projectId: null, cycle: "none" }, "me"),
      { project: { null: true }, cycle: { null: true } },
    )
    assert.deepStrictEqual(
      buildNavigationIssueFilter({ ...allIssuesFilters(), cycle: { id: "cycle" } }, "me"),
      { cycle: { id: { eq: "cycle" } } },
    )
  })

  test("combines multiple assignees with other filters and keeps My issues exclusive", () => {
    const filters = {
      ...allIssuesFilters(),
      teamId: "team",
      projectId: "shared",
      cycle: "none" as const,
      stateIds: ["todo"],
      assigneeIds: ["alice", "bob"],
    }
    assert.deepStrictEqual(buildNavigationIssueFilter(filters, "me"), {
      team: { id: { eq: "team" } },
      project: { id: { eq: "shared" } },
      cycle: { null: true },
      state: { id: { in: ["todo"] } },
      assignee: { id: { in: ["alice", "bob"] } },
    })
    const personal = { ...filters, view: "myIssues" as const }
    assert.deepStrictEqual(buildNavigationIssueFilter(personal, "me").assignee, {
      id: { eq: "me" },
    })
    assert.deepStrictEqual(normalizeNavigationFilters(personal, navigationMetadata).assigneeIds, [])
  })

  test("filters unassigned tickets alone or alongside users without sending the marker as a user ID", () => {
    const filters = {
      ...allIssuesFilters(),
      assigneeIds: [UNASSIGNED_ASSIGNEE_ID],
      projectId: "shared",
    }
    assert.deepStrictEqual(buildNavigationIssueFilter(filters, "me"), {
      project: { id: { eq: "shared" } },
      assignee: { null: true },
    })
    filters.assigneeIds.push("alice", "bob")
    assert.deepStrictEqual(buildNavigationIssueFilter(filters, "me").assignee, {
      or: [{ null: true }, { id: { in: ["alice", "bob"] } }],
    })
    assert.deepStrictEqual(
      normalizeNavigationFilters(restoreNavigationFilters(filters), {
        ...navigationMetadata,
        users: [],
      }).assigneeIds,
      [UNASSIGNED_ASSIGNEE_ID],
    )
    assert.deepStrictEqual(
      buildNavigationIssueFilter({ ...filters, view: "myIssues" }, "me").assignee,
      {
        id: { eq: "me" },
      },
    )
  })

  test("keeps cross-team projects and clears incompatible or inaccessible filters", () => {
    const filters = {
      ...allIssuesFilters(),
      projectId: "shared",
      stateIds: ["todo", "design-todo", "removed"],
      cycle: { id: "cycle" },
      assigneeIds: ["alice", "bob", "removed"],
    }
    assert.deepStrictEqual(normalizeNavigationFilters(filters, navigationMetadata).stateIds, [
      "todo",
      "design-todo",
    ])
    const scoped = normalizeNavigationFilters({ ...filters, teamId: "design" }, navigationMetadata)
    assert.strictEqual(scoped.projectId, "shared")
    assert.deepStrictEqual(scoped.stateIds, ["design-todo"])
    assert.deepStrictEqual(scoped.assigneeIds, ["alice", "bob"])
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
      users: [],
    })
    assert.strictEqual(removed.projectId, undefined)
    assert.strictEqual(removed.cycle, "any")
    assert.deepStrictEqual(removed.stateIds, [])
    assert.deepStrictEqual(removed.assigneeIds, [])
  })

  test("restores recognized stored values and tolerates old or malformed state", () => {
    assert.deepStrictEqual(
      restoreNavigationFilters({
        cycle: null,
        stateIds: "invalid",
        assigneeIds: "invalid",
        view: "currentCycle",
      }),
      defaultNavigationFilters(),
    )
    assert.deepStrictEqual(
      restoreNavigationFilters({ assigneeIds: ["alice", "alice", "bob", 1, null, ""] }).assigneeIds,
      ["alice", "bob"],
    )
    assert.deepStrictEqual(
      restoreNavigationFilters({
        view: "myIssues",
        stateIds: ["todo", "todo", 1],
        projectId: null,
      }),
      { ...defaultNavigationFilters(), view: "myIssues", stateIds: ["todo"], projectId: null },
    )
    // An explicit choice of the whole workspace survives a restart instead of reverting to the default.
    assert.deepStrictEqual(restoreNavigationFilters({ view: "allIssues", cycle: "any" }), {
      ...defaultNavigationFilters(),
      view: "allIssues",
      cycle: "any",
    })
  })
})
