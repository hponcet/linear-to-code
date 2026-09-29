import { expect, test } from "@playwright/test"

import type { Page } from "@playwright/test"

type IpcRequest = { type: string; _ipcReqId: string } & Record<string, unknown>

type MockOptions = {
  /** Number of times each request type fails before it succeeds. */
  failures?: Record<string, number>
  /** Response delays in milliseconds, keyed by request type and optional team, e.g. "getTeamMetadata:eng". */
  delays?: Record<string, number>
}

const workflowState = (id: string, name: string) => ({
  id,
  name,
  color: "#888888",
  type: "unstarted",
  position: 0,
  stateProgress: 0,
  stateTypeLength: 1,
})

const fixtures = {
  props: {
    connection: {
      id: "workspace-e2e",
      name: "E2E Workspace",
      urlKey: "e2e",
      userId: "user-e2e",
      userName: "E2E User",
    },
    teams: [
      { id: "eng", name: "Engineering" },
      { id: "design", name: "Design" },
      { id: "ops", name: "Ops" },
    ],
    draft: { teamId: "eng", projectId: "eng-project", assigneeId: "user-e2e" },
  },
  teams: {
    eng: { id: "eng", name: "Engineering", key: "ENG", defaultIssueStateId: "eng-todo" },
    design: { id: "design", name: "Design", key: "DES", defaultIssueStateId: "design-todo" },
    // No default status: the user has to pick one.
    ops: { id: "ops", name: "Ops", key: "OPS" },
  },
  metadata: {
    eng: {
      labels: [],
      cycles: [],
      workflowStates: [workflowState("eng-todo", "Eng Todo")],
      projects: [{ id: "eng-project", name: "Eng project", color: "#5e6ad2" }],
    },
    design: {
      labels: [],
      cycles: [],
      workflowStates: [workflowState("design-todo", "Design Todo")],
      projects: [],
    },
    ops: {
      labels: [],
      cycles: [],
      workflowStates: [workflowState("ops-backlog", "Ops Backlog")],
      projects: [],
    },
  },
  users: [{ id: "user-e2e", name: "E2E User", email: "e2e@example.com", initials: "EU" }],
  priorities: [{ priority: 0, label: "No priority" }],
}

async function openCreateIssue(page: Page, options: MockOptions = {}) {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.addInitScript(
    ({ fixtures, options }) => {
      const failures: Record<string, number> = { ...options.failures }
      const requests: IpcRequest[] = []
      const responded: string[] = []
      const unexpected: string[] = []

      function payloadFor(message: IpcRequest): unknown {
        const teamId = message.teamId as keyof typeof fixtures.teams
        switch (message.type) {
          case "props":
            return fixtures.props
          case "getTeam":
            return fixtures.teams[teamId]
          case "getTeamMetadata":
            return fixtures.metadata[teamId]
          case "getProjectLabels":
            return []
          case "getWorkspaceUsers":
            return fixtures.users
          case "getPriorities":
            return fixtures.priorities
          case "createIssue":
            return { id: "created", identifier: "ENG-1", title: "Created issue" }
          case "openIssue":
          case "closePanel":
            return undefined
          default:
            unexpected.push(message.type)
            throw new Error(`Unexpected request ${message.type}`)
        }
      }

      Object.assign(window, {
        __createIssueE2E: { requests, responded, unexpected },
        acquireVsCodeApi: () => ({
          postMessage(message: IpcRequest) {
            requests.push(message)
            const key = message.teamId ? `${message.type}:${message.teamId}` : message.type
            setTimeout(() => {
              let data: Record<string, unknown>
              if (failures[message.type]) {
                failures[message.type] -= 1
                data = { type: `${message.type}_error`, error: "E2E failure" }
              } else {
                try {
                  data = { type: `${message.type}_response`, payload: payloadFor(message) }
                } catch (error) {
                  data = { type: `${message.type}_error`, error: String(error) }
                }
              }
              window.dispatchEvent(
                new MessageEvent("message", { data: { ...data, _ipcReqId: message._ipcReqId } }),
              )
              responded.push(key)
            }, options.delays?.[key] ?? 0)
          },
          getState: () => ({}),
          setState: () => undefined,
        }),
      })
    },
    { fixtures, options },
  )
  await page.goto("/e2e/createIssue.html")

  return {
    requests: (type: string) =>
      page.evaluate(
        (type) =>
          (
            window as unknown as { __createIssueE2E: { requests: IpcRequest[] } }
          ).__createIssueE2E.requests.filter((request) => request.type === type),
        type,
      ),
    /** Request types of the create flow, in the order the webview sent them. */
    flow: () =>
      page.evaluate(() =>
        (
          window as unknown as { __createIssueE2E: { requests: IpcRequest[] } }
        ).__createIssueE2E.requests
          .map(({ type }) => type)
          .filter((type) => ["createIssue", "openIssue", "closePanel"].includes(type)),
      ),
    assertClean: async () => {
      expect(errors).toEqual([])
      expect(
        await page.evaluate(
          () =>
            (window as unknown as { __createIssueE2E: { unexpected: string[] } }).__createIssueE2E
              .unexpected,
        ),
      ).toEqual([])
    },
  }
}

test("creates a pre-filled issue, then opens it and closes the form", async ({ page }) => {
  const harness = await openCreateIssue(page)
  const createButton = page.getByRole("button", { name: "Create Issue" })

  await expect(page.getByText("E2E Workspace - Engineering")).toBeVisible()
  await expect(page.getByText("Eng Todo")).toBeVisible()
  await expect(page.getByText("Eng project")).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Issue title" })).toBeFocused()
  await expect(createButton).toBeDisabled()

  await page.getByRole("textbox", { name: "Issue title" }).fill("Add a create issue view")
  await createButton.click()

  await expect.poll(harness.flow).toEqual(["createIssue", "openIssue", "closePanel"])
  const [create] = await harness.requests("createIssue")
  expect(create.teamId).toBe("eng")
  expect(create.fields).toMatchObject({
    teamId: "eng",
    title: "Add a create issue view",
    description: "",
    stateId: "eng-todo",
    projectId: "eng-project",
    assigneeId: "user-e2e",
    priority: 0,
  })
  expect((await harness.requests("openIssue"))[0].issueId).toBe("created")
  await harness.assertClean()
})

test("switching team ignores the previous team's late data and clears its fields", async ({
  page,
}) => {
  const harness = await openCreateIssue(page, { delays: { "getTeamMetadata:eng": 1500 } })

  await page.getByRole("combobox").filter({ hasText: "Engineering" }).click()
  await page.getByRole("option", { name: "Design" }).click()
  await expect(page.getByText("E2E Workspace - Design")).toBeVisible()
  await expect(page.getByText("Design Todo")).toBeVisible()

  await page.waitForFunction(() =>
    (
      window as unknown as { __createIssueE2E: { responded: string[] } }
    ).__createIssueE2E.responded.includes("getTeamMetadata:eng"),
  )
  await expect(page.getByText("Design Todo")).toBeVisible()

  await page.getByRole("textbox", { name: "Issue title" }).fill("Design review")
  await page.getByRole("button", { name: "Create Issue" }).click()

  await expect.poll(harness.flow).toEqual(["createIssue", "openIssue", "closePanel"])
  const [create] = await harness.requests("createIssue")
  expect(create.teamId).toBe("design")
  expect(create.fields).toMatchObject({ stateId: "design-todo", assigneeId: "user-e2e" })
  expect(create.fields).not.toHaveProperty("projectId")
  await harness.assertClean()
})

test("failed requests keep the form and a retry never creates the issue twice", async ({
  page,
}) => {
  const harness = await openCreateIssue(page, { failures: { createIssue: 1, openIssue: 1 } })
  const title = page.getByRole("textbox", { name: "Issue title" })

  await title.fill("Flaky network")
  await page.getByRole("button", { name: "Create Issue" }).click()
  await expect(page.getByText(/Failed to create issue/)).toBeVisible()
  await expect(title).toHaveValue("Flaky network")
  await expect.poll(harness.flow).toEqual(["createIssue"])

  await page.getByRole("button", { name: "Create Issue" }).click()
  await expect(page.getByRole("button", { name: "Open ENG-1" })).toBeEnabled()
  await expect(page.getByText(/Failed to open issue/)).toBeVisible()

  await page.getByRole("button", { name: "Open ENG-1" }).click()
  await expect
    .poll(harness.flow)
    .toEqual(["createIssue", "createIssue", "openIssue", "openIssue", "closePanel"])
  await harness.assertClean()
})

test("enables Create Issue only once a title and a status are set", async ({ page }) => {
  const harness = await openCreateIssue(page)
  const createButton = page.getByRole("button", { name: "Create Issue" })

  await expect(page.getByText("Eng Todo")).toBeVisible()
  await expect(createButton).toBeDisabled()
  await page.getByRole("textbox", { name: "Issue title" }).fill("Needs a status")
  await expect(createButton).toBeEnabled()

  // Ops has no default status, so switching to it leaves the status empty.
  await page.getByRole("combobox").filter({ hasText: "Engineering" }).click()
  await page.getByRole("option", { name: "Ops" }).click()
  await expect(page.getByText("E2E Workspace - Ops")).toBeVisible()
  await expect(createButton).toBeDisabled()

  await page.getByRole("combobox").filter({ hasText: "Select" }).click()
  await page.getByRole("option", { name: "Ops Backlog" }).click()
  await expect(createButton).toBeEnabled()
  await harness.assertClean()
})

test("an empty line at the end of the description keeps Create Issue enabled", async ({ page }) => {
  const harness = await openCreateIssue(page)
  const createButton = page.getByRole("button", { name: "Create Issue" })

  await page.getByRole("textbox", { name: "Issue title" }).fill("Trailing line")
  await page.getByRole("textbox", { name: "Issue description" }).click()
  // Markdown can't keep an empty line after a heading, nor a line break at the very end.
  await page.keyboard.type("# Heading")
  await page.keyboard.press("Enter")
  await expect(createButton).toBeEnabled()
  await page.keyboard.type("First line")
  await page.keyboard.press("Shift+Enter")
  await expect(createButton).toBeEnabled()

  await createButton.click()
  await expect.poll(harness.flow).toEqual(["createIssue", "openIssue", "closePanel"])
  const [create] = await harness.requests("createIssue")
  expect(create.fields).toMatchObject({ description: "# Heading\n\nFirst line" })
  await harness.assertClean()
})
