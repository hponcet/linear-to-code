import { expect, test } from "@playwright/test"

import type { NavigationSnapshot } from "../src/types/Navigation"

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
    { id: "cycle", label: "No cycle" },
    { id: "status", label: "In progress", color: "#ddaa00", description: "Engineering" },
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
    await workspace.focus()
    await page.keyboard.press("Enter")
    await page.getByRole("button", { name: "Team: All teams", exact: true }).focus()
    await page.keyboard.press("Enter")
    await page.getByRole("button", { name: "Remove No cycle", exact: true }).click()
    await expect(page.getByRole("button", { name: "Remove No cycle", exact: true })).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: "Remove In progress", exact: true }),
    ).toBeVisible()
    await expect(page.getByRole("button", { name: "Filters (1)", exact: true })).toBeVisible()
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
    ])
    await page.screenshot({ path: `test-results/navigation-${theme}.png` })
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
    expect(errors).toEqual([])
  })
}
