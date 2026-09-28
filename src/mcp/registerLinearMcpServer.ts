import { isExtensionActive } from "src/extensionSession"
import { getConnectedWorkspaces } from "src/linear/auth"
import { ExtensionContext, EventEmitter, lm, window, workspace } from "vscode"

import {
  isCursorMcpRegistrationAvailable,
  syncCursorMcpServerRegistration,
  unregisterCursorMcpServer,
} from "./cursorMcpRegistration"
import {
  buildLinearMcpServerEnv,
  createLinearMcpServerDefinition,
  MCP_PROVIDER_ID,
  workspaceMcpName,
} from "./mcpEnvBuilder"

const didChangeMcpServerDefinitions = new EventEmitter<void>()

let extensionContext: ExtensionContext | undefined

async function syncMcpRegistrations(): Promise<void> {
  if (!extensionContext || !isExtensionActive()) {
    return
  }

  await syncCursorMcpServerRegistration(extensionContext)
}

export function notifyLinearMcpDefinitionsChanged(): void {
  if (!isExtensionActive()) {
    return
  }

  try {
    didChangeMcpServerDefinitions.fire()
  } catch {
    // MCP listeners may already be disposed during extension shutdown.
  }

  void syncMcpRegistrations()
}

export function registerLinearMcpServer(context: ExtensionContext): void {
  extensionContext = context

  context.subscriptions.push({
    dispose: () => {
      unregisterCursorMcpServer()
      extensionContext = undefined
    },
  })

  context.subscriptions.push(
    workspace.onDidChangeWorkspaceFolders(() => {
      void syncMcpRegistrations()
    }),
  )

  if (typeof lm?.registerMcpServerDefinitionProvider === "function") {
    try {
      context.subscriptions.push(
        lm.registerMcpServerDefinitionProvider(MCP_PROVIDER_ID, {
          onDidChangeMcpServerDefinitions: didChangeMcpServerDefinitions.event,
          provideMcpServerDefinitions: async () => {
            const definitions = await Promise.all(
              getConnectedWorkspaces().map(async (connection) => {
                const env = await buildLinearMcpServerEnv(context, connection.id)
                return env ? createLinearMcpServerDefinition(context, env, connection) : undefined
              }),
            )
            return definitions.filter((definition) => definition !== undefined)
          },
          resolveMcpServerDefinition: async (definition) => {
            const connection = getConnectedWorkspaces().find(
              (item) => workspaceMcpName(item) === definition.label,
            )
            const env = connection && (await buildLinearMcpServerEnv(context, connection.id))
            if (!connection || !env)
              throw new Error("Reconnect this Linear workspace before starting its MCP server.")
            return createLinearMcpServerDefinition(context, env, connection)
          },
        }),
      )
    } catch (error) {
      console.warn("[Linear to Code] Failed to register MCP server provider:", error)
      if (!isCursorMcpRegistrationAvailable()) {
        void window.showWarningMessage(
          "Linear to Code could not register its MCP server. You may need a newer VS Code or Cursor version.",
        )
      }
    }
  } else if (!isCursorMcpRegistrationAvailable()) {
    console.warn("[Linear to Code] MCP registration API is unavailable in this editor.")
  }

  void syncMcpRegistrations()
}
