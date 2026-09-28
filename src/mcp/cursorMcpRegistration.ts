import { getConnectedWorkspaces } from "src/linear/auth"
import { ExtensionContext, cursor } from "vscode"

import {
  buildLinearMcpServerEnv,
  createCursorMcpServerConfig,
  MCP_CURSOR_SERVER_NAME,
} from "./mcpEnvBuilder"

const registeredNames = new Set<string>([MCP_CURSOR_SERVER_NAME])
let generation = 0

export function isCursorMcpRegistrationAvailable(): boolean {
  return typeof cursor?.mcp?.registerServer === "function"
}

export function unregisterCursorMcpServer(): void {
  if (typeof cursor?.mcp?.unregisterServer !== "function") {
    return
  }

  generation += 1
  registeredNames.forEach((name) => cursor.mcp.unregisterServer(name))
  registeredNames.clear()
}

export async function syncCursorMcpServerRegistration(context: ExtensionContext): Promise<void> {
  if (!isCursorMcpRegistrationAvailable()) {
    return
  }

  const current = ++generation
  const connections = getConnectedWorkspaces()
  const configs = await Promise.all(
    connections.map(async (connection) => {
      const env = await buildLinearMcpServerEnv(context, connection.id)
      return env ? createCursorMcpServerConfig(context, env, connection) : undefined
    }),
  )
  if (current !== generation) return
  const names = new Set(configs.flatMap((config) => (config ? [config.name] : [])))
  for (const name of registeredNames) {
    if (!names.has(name)) {
      cursor.mcp.unregisterServer(name)
      registeredNames.delete(name)
    }
  }
  for (const config of configs) {
    if (!config) continue
    cursor.mcp.registerServer(config)
    registeredNames.add(config.name)
  }
}
