import * as assert from "assert"

import {
  LEGACY_LINEAR_TOKEN,
  LinearWorkspaces,
  WORKSPACE_SECRET_PREFIX,
} from "../../linear/LinearWorkspaces"
import { workspaceHarness } from "../support/linearWorkspaces"

suite("Linear workspace connections", () => {
  test("migrates and restores the legacy connection with secrets outside metadata", async () => {
    const h = workspaceHarness()
    h.tokens.set(LEGACY_LINEAR_TOKEN, "a:original")
    await h.registry.load()
    assert.strictEqual(h.tokens.has(LEGACY_LINEAR_TOKEN), false)
    assert.strictEqual(await h.registry.token("a"), "a:original")
    assert.deepStrictEqual(h.metadata.keys(), ["linearToCode.workspace.a"])
    assert.doesNotMatch(JSON.stringify(h.registry.list()), /original/)
    const restarted = new LinearWorkspaces(h.metadata, h.secrets, h.makeClient)
    await restarted.load()
    assert.strictEqual((await restarted.service("a").getIssue("issue-a")).title, "a")
  })

  test("preserves a legacy token if verification fails", async () => {
    const h = workspaceHarness()
    h.tokens.set(LEGACY_LINEAR_TOKEN, "expired:original")
    await assert.rejects(h.registry.load(), /expired/)
    assert.strictEqual(h.tokens.get(LEGACY_LINEAR_TOKEN), "expired:original")
    assert.deepStrictEqual(h.registry.list(), [])
  })

  test("can connect after an expired legacy session without blocking saved workspaces", async () => {
    const h = workspaceHarness()
    h.tokens.set(LEGACY_LINEAR_TOKEN, "expired:original")
    let reset = false
    await h.registry.connectWithProvider(
      async () => {
        assert.ok(reset)
        return "a:renewed"
      },
      async () => {
        reset = true
      },
    )
    await h.registry.load()
    assert.strictEqual(await h.registry.token("a"), "a:renewed")
    assert.strictEqual(h.tokens.get(LEGACY_LINEAR_TOKEN), "expired:original")
  })

  test("resets only the provider session when adding another organization", async () => {
    const h = workspaceHarness()
    const order: string[] = []
    await h.registry.connectWithProvider(
      async () => "a:original",
      async () => {
        order.push("initial logout")
      },
    )
    await h.registry.connectWithProvider(
      async () => {
        order.push("authorize")
        return "b:new"
      },
      async () => {
        order.push("logout")
        assert.strictEqual(await h.registry.token("a"), "a:original")
      },
    )
    assert.deepStrictEqual(order, ["initial logout", "logout", "authorize"])
    assert.deepStrictEqual(
      h.registry.list().map(({ id }) => id),
      ["a", "b"],
    )
  })

  test("cancellation, provider failures and the wrong organization leave saved connections intact", async () => {
    const h = workspaceHarness()
    await h.registry.connect("a:original")
    const reset = async () => undefined
    assert.strictEqual(
      await h.registry.connectWithProvider(async () => undefined, reset),
      undefined,
    )
    await assert.rejects(
      h.registry.connectWithProvider(async () => {
        throw new Error("Cancelled")
      }, reset),
      /Cancelled/,
    )
    await assert.rejects(
      h.registry.connectWithProvider(async () => "b:wrong", reset, "a"),
      /original workspace/,
    )
    assert.strictEqual(await h.registry.token("a"), "a:original")
    assert.strictEqual(await h.registry.token("b"), undefined)
    assert.deepStrictEqual(
      h.registry.list().map(({ id }) => id),
      ["a"],
    )
  })

  test("reconnection invalidates caches while keeping services bound to their organizations", async () => {
    const h = workspaceHarness()
    await h.registry.connect("a:original")
    await h.registry.connect("b:original")
    const serviceA = h.registry.service("a")
    const serviceB = h.registry.service("b")
    await serviceA.getIssue("same-id")
    await serviceB.getIssue("same-id")
    await h.registry.connectWithProvider(
      async () => "a:renewed",
      async () => undefined,
      "a",
    )
    assert.strictEqual(serviceA, h.registry.service("a"))
    await serviceA.getIssue("same-id")
    await serviceB.getIssue("same-id")
    assert.deepStrictEqual(
      h.calls.map(({ token }) => token),
      ["a:original", "b:original", "a:renewed"],
    )
    await h.registry.disconnect("a")
    await assert.rejects(serviceA.getIssue("same-id"), /not available/)
    assert.strictEqual(await h.registry.token("b"), "b:original")
    assert.strictEqual(h.tokens.has(WORKSPACE_SECRET_PREFIX + "a"), false)
  })
})
