import { getActiveWorkspaceId, linearWorkspaces } from "src/linear/auth"
import { SettingsVscState, VscStateKeys } from "src/vscStates"
import { cursor, ExtensionContext, McpStdioServerDefinition, workspace } from "vscode"

import { buildGitProviderEnv, type McpServerEnv } from "./resolveMcpGitEnv"

import type { LinearWorkspace } from "src/linear/LinearWorkspaces"

export const MCP_PROVIDER_ID = "linearToCode.mcp"
export const MCP_SERVER_LABEL = "Linear to Code"
export const MCP_CURSOR_SERVER_NAME = MCP_SERVER_LABEL

export function workspaceMcpName(connection: Pick<LinearWorkspace, "id" | "name">): string {
  return `${MCP_SERVER_LABEL} - ${connection.name} (${connection.id})`
}

export type { McpServerEnv } from "./resolveMcpGitEnv"

export async function buildLinearMcpServerEnv(
  context: ExtensionContext,
  workspaceId = getActiveWorkspaceId(),
): Promise<McpServerEnv | null> {
  const linearAccessToken = workspaceId ? await linearWorkspaces.token(workspaceId) : undefined
  if (!linearAccessToken) {
    return null
  }

  const env: McpServerEnv = {
    LINEAR_ACCESS_TOKEN: linearAccessToken,
    LINEAR_WORKSPACE_ID: workspaceId!,
    LINEAR_WORKSPACE_NAME: linearWorkspaces.get(workspaceId!).name,
  }

  const workspaceFolder = workspace.workspaceFolders?.[0]?.uri.fsPath
  if (workspaceFolder) {
    env.WORKSPACE_FOLDER = workspaceFolder
  }

  const settings = context.globalState.get<SettingsVscState>(VscStateKeys.branchesSettings) ?? {}
  const gitEnv = await buildGitProviderEnv(context, settings.gitProvider)
  return { ...env, ...gitEnv }
}

export function createLinearMcpServerDefinition(
  context: ExtensionContext,
  env: McpServerEnv,
  connection?: LinearWorkspace,
): McpStdioServerDefinition {
  const serverPath = context.asAbsolutePath("dist/linearToCodeMcpServer.js")
  return new McpStdioServerDefinition(
    connection ? workspaceMcpName(connection) : MCP_SERVER_LABEL,
    "node",
    [serverPath],
    env,
  )
}

export function createCursorMcpServerConfig(
  context: ExtensionContext,
  env: McpServerEnv,
  connection?: LinearWorkspace,
): cursor.mcp.StdioServerConfig {
  const serverPath = context.asAbsolutePath("dist/linearToCodeMcpServer.js")
  return {
    name: connection ? workspaceMcpName(connection) : MCP_CURSOR_SERVER_NAME,
    server: {
      command: "node",
      args: [serverPath],
      env: { ...env },
    },
  }
}
