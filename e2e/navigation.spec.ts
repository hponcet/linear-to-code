import { expect, test } from "@playwright/test"

import { UNASSIGNED_ASSIGNEE_ID } from "../src/constants"

import type { NavigationSnapshot } from "../src/types/Navigation"

const longAssigneeName = "Robert Alexander Montgomery"

const initial: NavigationSnapshot = {
  workspace: {
    id: "a",
    name: "A workspace with a very long name",
    urlKey: "a",
    userId: "user",
    userName: "User",
  },
  team: "All teams",
  project: "Shared project spanning several teams with a long name",
  projectColor: "#8585ff",
  projectIcon: "🚀",
  view: "All issues",
  filters: [
    { id: "cycle", kind: "cycle", label: "No cycle", cycle: null },
    {
      id: `assignee:${UNASSIGNED_ASSIGNEE_ID}`,
      kind: "assignee",
      label: "Unassigned",
      description: "Assignee",
      user: null,
    },
    {
      id: "status",
      kind: "status",
      label: "In progress",
      description: "Engineering",
      workflowState: {
        id: "status",
        name: "In progress",
        color: "#ddaa00",
        type: "started",
        position: 0,
        stateProgress: 0,
        stateTypeLength: 2,
      },
    },
    {
      id: "assignee:alice",
      kind: "assignee",
      label: "Alice",
      description: "Assignee: alice@example.com",
      user: {
        id: "alice",
        name: "Alice",
        email: "alice@example.com",
        initials: "AL",
        avatarBackgroundColor: "#446699",
      },
    },
    {
      id: "assignee:bob",
      kind: "assignee",
      label: longAssigneeName,
      description: "Assignee: bob@example.com",
      user: {
        id: "bob",
        name: longAssigneeName,
        email: "bob@example.com",
        initials: "RM",
        avatarBackgroundColor: "#886633",
      },
    },
  ],
  busy: false,
}

for (const theme of ["vscode-light", "vscode-dark", "vscode-high-contrast"]) {
  test(`navigation fits narrow sidebars and supports keyboard actions in ${theme}`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.setViewportSize({ width: 240, height: 360 })
    await page.addInitScript((initial) => {
      let snapshot = initial
      const requests: unknown[] = []
      Object.assign(window, {
        __navigationRequests: requests,
        acquireVsCodeApi: () => ({
          postMessage(message: { type: string; _ipcReqId: string; id?: string }) {
            requests.push(message)
            if (message.type === "clearNavigationFilter")
              snapshot = {
                ...snapshot,
                filters: snapshot.filters.filter(({ id }) => id !== message.id),
              }
            queueMicrotask(() => {
              window.dispatchEvent(
                new MessageEvent("message", {
                  data: {
                    type: `${message.type}_response`,
                    _ipcReqId: message._ipcReqId,
                    payload: message.type === "getNavigation" ? snapshot : undefined,
                  },
                }),
              )
              window.dispatchEvent(
                new MessageEvent("message", {
                  data: { action: "navigationChanged", payload: snapshot },
                }),
              )
            })
          },
          getState: () => ({}),
          setState: () => undefined,
        }),
      })
    }, initial)
    await page.goto("/e2e/navigation.html")
    await page.evaluate((theme) => {
      document.body.className = theme
      const light = theme === "vscode-light"
      const contrast = theme === "vscode-high-contrast"
      const vars: Record<string, string> = {
        "--vscode-foreground": light ? "#333333" : "#eeeeee",
        "--vscode-sideBar-background": light ? "#f3f3f3" : contrast ? "#000000" : "#252526",
        "--vscode-focusBorder": "#007fd4",
        "--vscode-descriptionForeground": light ? "#616161" : contrast ? "#ffffff" : "#aaaaaa",
        "--vscode-widget-border": contrast ? "#ffffff" : "#777777",
        "--vscode-badge-background": light ? "#dddddd" : "#444444",
        "--vscode-badge-foreground": light ? "#222222" : "#ffffff",
      }
      Object.entries(vars).forEach(([key, value]) =>
        document.documentElement.style.setProperty(key, value),
      )
    }, theme)
    const workspace = page.getByRole("button", {
      name: `Workspace: ${initial.workspace!.name}`,
      exact: true,
    })
    await expect(workspace).toBeVisible()
    const disclosure = page.getByRole("button", { name: /^Active filters \(/ })
    await expect(disclosure).toHaveAttribute("aria-expanded", "false")
    await expect(page.getByRole("button", { name: "Remove Alice", exact: true })).toHaveCount(0)
    await page.screenshot({ path: `test-results/navigation-collapsed-${theme}.png` })
    await workspace.focus()
    await page.keyboard.press("Enter")
    await page.getByRole("button", { name: "Team: All teams", exact: true }).focus()
    await page.keyboard.press("Enter")
    await expect(disclosure).toHaveAttribute("aria-expanded", "false")
    await disclosure.focus()
    await page.keyboard.press("Enter")
    await expect(disclosure).toHaveAttribute("aria-expanded", "true")
    await expect(page.locator(".navigationFilters .rs-anim-collapse")).toHaveClass(/rs-anim-in/)
    for (const name of ["Cycle", "Statuses", "Assignees"]) {
      await expect(page.getByRole("group", { name, exact: true })).toBeVisible()
    }
    await expect(
      page.getByRole("group", { name: "Statuses" }).locator('svg[aria-label="started"]'),
    ).toBeVisible()
    await expect(
      page.getByRole("group", { name: "Assignees" }).getByText("AL", { exact: true }),
    ).toBeVisible()
    await expect(page.getByRole("button", { name: "Remove Unassigned", exact: true })).toBeVisible()
    await expect(
      page.getByRole("group", { name: "Assignees" }).locator(".navigationFilterIcon svg"),
    ).toHaveCount(1)
    await page.screenshot({ path: `test-results/navigation-expanded-${theme}.png` })
    await page.getByRole("button", { name: "Remove No cycle", exact: true }).click()
    await expect(page.getByRole("button", { name: "Remove No cycle", exact: true })).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: "Remove In progress", exact: true }),
    ).toBeVisible()
    await expect(page.getByRole("button", { name: "Filters (4)", exact: true })).toBeVisible()
    const alice = page.getByRole("button", { name: "Remove Alice", exact: true })
    await expect(
      page.getByTitle("Assignee: alice@example.com: Alice", { exact: true }),
    ).toBeVisible()
    await alice.focus()
    await page.keyboard.press("Enter")
    await expect(alice).toHaveCount(0)
    await page.getByRole("button", { name: "Remove Unassigned", exact: true }).click()
    await expect(page.getByRole("button", { name: "Remove Unassigned", exact: true })).toHaveCount(
      0,
    )
    await expect(
      page.getByRole("button", { name: `Remove ${longAssigneeName}`, exact: true }),
    ).toBeVisible()
    await expect(disclosure).toHaveAttribute("aria-expanded", "true")
    await expect(page.getByRole("group", { name: "Cycle", exact: true })).toHaveCount(0)
    await page.getByRole("button", { name: "Filters (2)", exact: true }).click()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    const requests = await page.evaluate(
      () =>
        (window as unknown as { __navigationRequests: { selector?: string }[] })
          .__navigationRequests,
    )
    expect(requests.filter(({ selector }) => selector).map(({ selector }) => selector)).toEqual([
      "workspace",
      "team",
      "filters",
    ])
    await page.screenshot({ path: `test-results/navigation-${theme}.png` })
    await disclosure.focus()
    await page.keyboard.press("Space")
    await expect(disclosure).toHaveAttribute("aria-expanded", "false")
    await expect(
      page.getByRole("button", { name: `Remove ${longAssigneeName}`, exact: true }),
    ).toHaveCount(0)
    await page.keyboard.press("Tab")
    await expect(page.locator(".navigationFilterRemove:focus")).toHaveCount(0)
    await page.evaluate((snapshot) => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            action: "navigationChanged",
            payload: {
              ...snapshot,
              team: "All teams",
              project: "All projects",
              filters: [],
              error: "Authentication expired",
            },
          },
        }),
      )
    }, initial)
    await expect(page.getByRole("button", { name: "Reconnect", exact: true })).toBeVisible()
    await expect(disclosure).toHaveCount(0)
    await page.evaluate((snapshot) => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            action: "navigationChanged",
            payload: { ...snapshot, busy: true, error: undefined },
          },
        }),
      )
    }, initial)
    await expect(workspace).toBeDisabled()
    await disclosure.click()
    await expect(page.getByRole("button", { name: "Remove Alice", exact: true })).toBeDisabled()
    await page.evaluate((snapshot) => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            action: "navigationChanged",
            payload: { ...snapshot, workspace: { ...snapshot.workspace, id: "b" } },
          },
        }),
      )
    }, initial)
    await expect(disclosure).toHaveAttribute("aria-expanded", "false")
    expect(errors).toEqual([])
  })
}
