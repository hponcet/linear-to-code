import * as assert from "assert"

import { Disposable, ExtensionContext } from "vscode"

import { Controller } from "../../controller"
import * as auth from "../../linear/auth"
import { PullRequestsView } from "../../views/pullRequests"

suite("Pull requests view", () => {
  test("a failing first listing cannot abort initialization after commands are registered", async () => {
    const getActiveWorkspaceId = auth.getActiveWorkspaceId
    const gitProviderService = Controller.gitProviderService
    Object.assign(auth, { getActiveWorkspaceId: () => "workspace" })
    Controller.gitProviderService = {
      onAuthContextChanged: () => new Disposable(() => undefined),
      listOpenPullRequests: () => Promise.reject(new Error("offline")),
    } as unknown as typeof Controller.gitProviderService
    const context = {} as ExtensionContext
    try {
      const first = new PullRequestsView()
      await first.initialize(context)
      first.dispose()
      // A retried connection must be able to register the same commands again.
      const retry = new PullRequestsView()
      await assert.doesNotReject(retry.initialize(context))
      retry.dispose()
    } finally {
      Object.assign(auth, { getActiveWorkspaceId })
      Controller.gitProviderService = gitProviderService
    }
  })
})
