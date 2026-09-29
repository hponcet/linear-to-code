import * as assert from "assert"

import { LinearClient } from "@linear/sdk"

import { LinearService } from "../../linear/LinearService"
import { defaultNavigationFilters, NavigationFilters } from "../../linear/navigation"
import { createLinearConnection } from "../support/linearConnection"

/** The unfiltered workspace view, which these tests use as their neutral starting point. */
const allIssuesFilters = (): NavigationFilters => ({
  ...defaultNavigationFilters(),
  view: "allIssues",
  cycle: "any",
})

suite("Linear navigation API", () => {
  test("loads 100 issues per page and invalidates every page after membership changes", async () => {
    const requests: Record<string, unknown>[] = []
    const service = new LinearService(
      () =>
        ({
          viewer: Promise.resolve({ id: "me" }),
          issues: async (options: Record<string, unknown>) => {
            requests.push(options)
            return {
              nodes: [{ id: options.after ? "second" : "first" }],
              pageInfo: { hasNextPage: !options.after, endCursor: "next" },
            }
          },
          updateIssue: async () => ({ issue: Promise.resolve({ id: "first" }) }),
        }) as unknown as LinearClient,
    )
    const filters = {
      ...allIssuesFilters(),
      projectId: "project",
      assigneeIds: ["alice", "bob"],
    }
    const first = await service.getNavigationIssues(filters)
    const second = await service.getNavigationIssues(filters, first.nextCursor ?? undefined)
    assert.strictEqual(first.nextCursor, "next")
    assert.strictEqual(second.nextCursor, undefined)
    assert.deepStrictEqual(
      second.issues.map(({ id }) => id),
      ["second"],
    )
    assert.strictEqual(requests[0].first, 100)
    assert.deepStrictEqual(requests[0].filter, {
      project: { id: { eq: "project" } },
      assignee: { id: { in: ["alice", "bob"] } },
    })
    assert.deepStrictEqual(requests[1].filter, requests[0].filter)
    assert.strictEqual(requests[1].after, "next")
    for (const field of ["projectId", "cycleId", "teamId", "stateId", "assigneeId"]) {
      const before = requests.length
      await service.getNavigationIssues(filters)
      assert.strictEqual(requests.length, before)
      await service.updateIssue("first", { [field]: "changed" })
      await service.getNavigationIssues(filters)
      await service.getNavigationIssues(filters, "next")
      assert.strictEqual(requests.length, before + 2)
    }
  })

  test("metadata includes accessible teams, all pages and cross-team projects", async () => {
    const connection = <T>(nodes: T[], rest: T[] = []) =>
      createLinearConnection(rest.length ? [nodes, rest] : [nodes])
    let projectReads = 0
    const service = new LinearService(
      () =>
        ({
          teams: async () =>
            connection([{ id: "team-a", name: "Desktop" }], [{ id: "team-b", name: "Mobile" }]),
          projects: async () => {
            projectReads++
            return connection([
              {
                id: "shared",
                name: "Shared",
                teams: async () => connection([{ id: "team-a" }], [{ id: "team-b" }]),
              },
            ])
          },
          cycles: async () => connection([]),
          users: async () =>
            connection(
              [
                {
                  id: "alice",
                  name: "Alice",
                  displayName: "Ali",
                  email: "alice@example.com",
                  avatarUrl: "https://example.com/alice.png",
                  avatarBackgroundColor: "#123456",
                  initials: "AL",
                },
              ],
              [{ id: "bob", name: "Bob", displayName: "", email: "bob@example.com" }],
            ),
          workflowStates: async () =>
            connection(
              [
                {
                  id: "desktop-progress",
                  name: "In progress",
                  teamId: "team-a",
                  type: "started",
                  position: 0,
                  color: "#ddaa00",
                },
                {
                  id: "desktop-review",
                  name: "Review",
                  teamId: "team-a",
                  type: "started",
                  position: 1,
                  color: "#ddaa00",
                },
              ],
              [
                {
                  id: "mobile-progress",
                  name: "In progress",
                  teamId: "team-b",
                  type: "started",
                  position: 0,
                  color: "#ddaa00",
                },
              ],
            ),
        }) as unknown as LinearClient,
    )
    const metadata = await service.getNavigationMetadata()
    assert.deepStrictEqual(
      metadata.teams.map(({ id }) => id),
      ["team-a", "team-b"],
    )
    assert.deepStrictEqual(metadata.projects[0].teamIds, ["team-a", "team-b"])
    assert.deepStrictEqual(metadata.cycles, [])
    assert.deepStrictEqual(
      metadata.users.map(({ id, name, email }) => ({ id, name, email })),
      [
        { id: "alice", name: "Ali", email: "alice@example.com" },
        { id: "bob", name: "Bob", email: "bob@example.com" },
      ],
    )
    assert.strictEqual(metadata.users[0].avatarUrl, "https://example.com/alice.png")
    assert.strictEqual(metadata.users[0].avatarBackgroundColor, "#123456")
    assert.strictEqual(metadata.users[0].initials, "AL")
    assert.deepStrictEqual(
      metadata.states.map(({ id, name, teamId }) => ({
        id,
        name,
        team: metadata.teams.find((team) => team.id === teamId)?.name,
      })),
      [
        { id: "desktop-progress", name: "In progress", team: "Desktop" },
        { id: "desktop-review", name: "Review", team: "Desktop" },
        { id: "mobile-progress", name: "In progress", team: "Mobile" },
      ],
    )
    assert.deepStrictEqual(
      metadata.states.map(({ type, stateProgress, stateTypeLength }) => [
        type,
        stateProgress,
        stateTypeLength,
      ]),
      [
        ["started", 0, 2],
        ["started", 1, 2],
        ["started", 0, 1],
      ],
    )
    await service.getNavigationMetadata()
    assert.strictEqual(projectReads, 1)
    service.invalidateAll()
    await service.getNavigationMetadata()
    assert.strictEqual(projectReads, 2)
  })
})
