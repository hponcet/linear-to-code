import * as assert from "assert"

import { LinearClient } from "@linear/sdk"

import { LinearService } from "../../linear/LinearService"
import { defaultNavigationFilters } from "../../linear/navigation"

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
    const filters = { ...defaultNavigationFilters(), projectId: "project" }
    const first = await service.getNavigationIssues(filters)
    const second = await service.getNavigationIssues(filters, first.nextCursor ?? undefined)
    assert.strictEqual(first.nextCursor, "next")
    assert.strictEqual(second.nextCursor, undefined)
    assert.deepStrictEqual(
      second.issues.map(({ id }) => id),
      ["second"],
    )
    assert.strictEqual(requests[0].first, 100)
    assert.deepStrictEqual(requests[0].filter, { project: { id: { eq: "project" } } })
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
    const connection = <T>(nodes: T[], rest: T[] = []) => ({
      nodes,
      pageInfo: { hasPreviousPage: false, hasNextPage: rest.length > 0 },
      fetchNext: async () => ({
        nodes: rest,
        pageInfo: { hasPreviousPage: false, hasNextPage: false },
      }),
    })
    let projectReads = 0
    const service = new LinearService(
      () =>
        ({
          teams: async () =>
            connection([{ id: "team-a", name: "A" }], [{ id: "team-b", name: "B" }]),
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
          workflowStates: async () => connection([{ id: "state", name: "Todo", teamId: "team-a" }]),
        }) as unknown as LinearClient,
    )
    const metadata = await service.getNavigationMetadata()
    assert.deepStrictEqual(
      metadata.teams.map(({ id }) => id),
      ["team-a", "team-b"],
    )
    assert.deepStrictEqual(metadata.projects[0].teamIds, ["team-a", "team-b"])
    assert.deepStrictEqual(metadata.cycles, [])
    await service.getNavigationMetadata()
    assert.strictEqual(projectReads, 1)
    service.invalidateAll()
    await service.getNavigationMetadata()
    assert.strictEqual(projectReads, 2)
  })
})
