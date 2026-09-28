import { Controller } from "src/controller"
import { Ipc } from "src/types/ActionMessage"

import type { LinearService } from "src/linear/LinearService"

type GitProviderIpcResult =
  | { handled: true; payload: unknown }
  | { handled: false; payload?: undefined }

export async function handleGitProviderIpcMessage(
  msg: Ipc<"req">,
  linearService: LinearService,
): Promise<GitProviderIpcResult> {
  const service = Controller.gitProviderService
  if (!service) {
    return { handled: false }
  }

  switch (msg.type) {
    case "getGitProviderStatus": {
      const status = await service.getStatus()
      return { handled: true, payload: status }
    }
    case "getGitProviderOAuthSetup": {
      const setup = service.getOAuthSetup(msg.provider, {
        bitbucketAuthMethod: msg.bitbucketAuthMethod,
      })
      if (!setup) {
        return { handled: true, payload: { signInLabel: "Sign in", instructions: "" } }
      }
      return { handled: true, payload: setup }
    }
    case "connectGitProvider": {
      await service.connect({
        bitbucketApiToken: msg.bitbucketApiToken,
        bitbucketOAuthClientSecret: msg.bitbucketOAuthClientSecret,
      })
      const status = await service.getStatus()
      return { handled: true, payload: status }
    }
    case "disconnectGitProvider": {
      await service.disconnect()
      const status = await service.getStatus()
      return { handled: true, payload: status }
    }
    case "getPullRequestStatus": {
      const status = await service.getPullRequestStatus(msg.sourceBranch)
      return { handled: true, payload: status }
    }
    case "openPullRequest": {
      const issue = await linearService.getIssue(msg.issueId)
      const result = await service.openPullRequestForIssue(
        {
          identifier: issue.identifier,
          title: issue.title,
          url: issue.url,
        },
        msg.sourceBranch,
      )
      return { handled: true, payload: result }
    }
    default:
      return { handled: false }
  }
}
