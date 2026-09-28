import { Controller } from "src/controller"
import {
  activateExtensionSession,
  deactivateExtensionSession,
  isExtensionSession,
} from "src/extensionSession"
import { ExtensionContext, window } from "vscode"

import { registerCommands } from "./commands"
import { CommandContext, setCommandContext } from "./commandsContext"
import { refreshCursorCommandContext } from "./cursor/detectCursorEnvironment"
import { linearToCodeUriHandler } from "./gitProviders/linearToCodeUriHandler"
import { initLinearClient } from "./linear/auth"
import { registerLinearMcpServer } from "./mcp/registerLinearMcpServer"
import { NavigationView } from "./views/NavigationView"

export async function activate(context: ExtensionContext) {
  const sessionId = activateExtensionSession()

  try {
    await setCommandContext(CommandContext.linearExtensionLoaded, false)
    await setCommandContext(CommandContext.gitProviderAuthenticated, false)

    await refreshCursorCommandContext()

    context.subscriptions.push(
      window.onDidChangeWindowState((state) => {
        if (state.focused) {
          void refreshCursorCommandContext()
        }
      }),
    )

    context.subscriptions.push(window.registerUriHandler(linearToCodeUriHandler))

    context.subscriptions.push(new NavigationView(context))
    registerCommands(context)
    registerLinearMcpServer(context)
    await initLinearClient(context, sessionId)
  } catch (error) {
    console.error("[Linear to Code] Activation failed:", error)
    void window.showErrorMessage(
      `Linear to Code failed to activate: ${error instanceof Error ? error.message : String(error)}`,
    )
  } finally {
    if (isExtensionSession(sessionId)) {
      await setCommandContext(CommandContext.linearExtensionLoaded, true)
    }
  }
}

export function deactivate() {
  deactivateExtensionSession()
  Controller.dispose()
}
