import { readAgentSettings } from "src/cursor/agentPromptSettings"
import { PullRequestInfo } from "src/gitProviders/types"
import { linearWorkspaces } from "src/linear/auth"
import { workspaceMcpName } from "src/mcp/mcpEnvBuilder"
import { ExtensionContext, env, window } from "vscode"

import { buildPullRequestReviewPrompt } from "./buildPullRequestReviewPrompt"
import { ensureCursorEnvironment } from "./detectCursorEnvironment"
import { openCursorAgentWithPrompt } from "./openCursorAgent"

import type { LinearWorkspace } from "src/linear/LinearWorkspaces"

export async function launchCursorAgentForPullRequest(
  pullRequest: PullRequestInfo,
  context: ExtensionContext,
  connection: LinearWorkspace,
): Promise<void> {
  if (!(await ensureCursorEnvironment())) {
    void window.showInformationMessage("Review with agent is available in Cursor only.")
    return
  }

  connection = linearWorkspaces.get(connection.id)
  const agentSettings = readAgentSettings(context)
  const prompt = buildPullRequestReviewPrompt(pullRequest, agentSettings, {
    editorLanguageLocale: env.language,
  })
  await openCursorAgentWithPrompt(
    `${prompt}\n\nLinear workspace: ${connection.name} (${connection.id}). Use the MCP server ${workspaceMcpName(connection)} for linked issues.`,
  )
}
