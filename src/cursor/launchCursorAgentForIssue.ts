import { Issue } from "@linear/sdk"
import { readAgentSettings } from "src/cursor/agentPromptSettings"
import { buildIssueAgentPrompt } from "src/cursor/buildIssueAgentPrompt"
import { ensureCursorEnvironment } from "src/cursor/detectCursorEnvironment"
import { openCursorAgentWithPrompt } from "src/cursor/openCursorAgent"
import { linearWorkspaces } from "src/linear/auth"
import { workspaceMcpName } from "src/mcp/mcpEnvBuilder"
import { ExtensionContext, env, window } from "vscode"

import type { LinearWorkspace } from "src/linear/LinearWorkspaces"

export async function launchCursorAgentForIssue(
  issue: Pick<Issue, "id" | "identifier">,
  context: ExtensionContext,
  connection: LinearWorkspace,
): Promise<void> {
  if (!(await ensureCursorEnvironment())) {
    void window.showInformationMessage("Start work with agent is available in Cursor only.")
    return
  }

  let identifier = issue.identifier?.trim()
  if (!identifier) {
    const loadedIssue = await linearWorkspaces.service(connection.id).getIssue(issue.id)
    identifier = loadedIssue.identifier
  }

  connection = linearWorkspaces.get(connection.id)
  const agentSettings = readAgentSettings(context)
  const prompt = buildIssueAgentPrompt(identifier, agentSettings, {
    editorLanguageLocale: env.language,
  })
  await openCursorAgentWithPrompt(
    `${prompt}\n\nLinear workspace: ${connection.name} (${connection.id}). Use the MCP server ${workspaceMcpName(connection)} for issue ${issue.id}.`,
  )
}

export async function launchCursorAgentForIssueId(
  issueId: string,
  context: ExtensionContext,
  connection: LinearWorkspace,
): Promise<void> {
  const issue = await linearWorkspaces.service(connection.id).getIssue(issueId)
  await launchCursorAgentForIssue(issue, context, connection)
}
