import { Controller } from "src/controller"
import { isExtensionSession } from "src/extensionSession"
import { ExtensionContext, authentication, commands, EventEmitter, window } from "vscode"

import { LinearWorkspaces, WORKSPACE_SECRET_PREFIX } from "./LinearWorkspaces"

import { CommandContext, setCommandContext } from "../commandsContext"
import { notifyLinearMcpDefinitionsChanged } from "../mcp/registerLinearMcpServer"

export const ACTIVE_WORKSPACE_KEY = "linearToCode.activeWorkspace"
export const workspaceChanges = new EventEmitter<void>()
export let linearWorkspaces: LinearWorkspaces
let extensionContext: ExtensionContext
let extensionSessionId: number | undefined
let activeWorkspaceId: string | undefined
let connectionTask: Promise<void> | undefined
let switchTask = Promise.resolve()

export function getActiveWorkspaceId(): string | undefined {
  return activeWorkspaceId
}

export function getConnectedWorkspaces() {
  return linearWorkspaces?.list() ?? []
}

export function switchLinearWorkspace(id: string): Promise<void> {
  const run = async () => {
    if (extensionSessionId !== undefined && !isExtensionSession(extensionSessionId)) return
    linearWorkspaces.get(id)
    activeWorkspaceId = id
    await extensionContext.workspaceState.update(ACTIVE_WORKSPACE_KEY, id)
    await setCommandContext(CommandContext.linearAccountConnected, true)
    workspaceChanges.fire()
    await Controller.initialize(extensionContext, extensionSessionId)
  }
  switchTask = switchTask.then(run, run)
  return switchTask
}

export async function initLinearClient(
  context: ExtensionContext,
  sessionId?: number,
): Promise<void> {
  extensionContext = context
  extensionSessionId = sessionId
  activeWorkspaceId = undefined
  linearWorkspaces = new LinearWorkspaces(context.globalState, context.secrets)
  context.subscriptions.push(
    context.secrets.onDidChange(async ({ key }) => {
      if (!key.startsWith(WORKSPACE_SECRET_PREFIX)) return
      await linearWorkspaces.reload(key.slice(WORKSPACE_SECRET_PREFIX.length))
      workspaceChanges.fire()
      notifyLinearMcpDefinitionsChanged()
    }),
  )
  try {
    await linearWorkspaces.load()
  } catch (error) {
    void window.showErrorMessage(`Reconnect Linear to restore your connection: ${String(error)}`)
  }
  if (sessionId !== undefined && !isExtensionSession(sessionId)) return
  const saved = context.workspaceState.get<string>(ACTIVE_WORKSPACE_KEY)
  const selected =
    getConnectedWorkspaces().find(({ id }) => id === saved) ?? getConnectedWorkspaces()[0]
  if (selected) await switchLinearWorkspace(selected.id)
  else await setCommandContext(CommandContext.linearAccountConnected, false)
  workspaceChanges.fire()
  notifyLinearMcpDefinitionsChanged()
}

export function linearConnect(context: ExtensionContext, reconnectId?: string): Promise<void> {
  if (connectionTask) return connectionTask
  connectionTask = (async () => {
    try {
      const connected = await linearWorkspaces.connectWithProvider(
        async () =>
          (await authentication.getSession("linear", ["read", "write"], { createIfNone: true }))
            ?.accessToken,
        () => {
          void window.showInformationMessage(
            "Linear Connect will restart its shared editor session to choose a workspace. Other extensions using Linear Connect share this session. Your saved workspace connections and open tickets remain available.",
          )
          return commands.executeCommand("linear-connect.logout")
        },
        reconnectId,
      )
      if (!connected) return
      workspaceChanges.fire()
      notifyLinearMcpDefinitionsChanged()
      if (!reconnectId || !activeWorkspaceId || activeWorkspaceId === reconnectId) {
        await switchLinearWorkspace(connected.id)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/cancel|did not consent/i.test(message))
        void window.showErrorMessage(`Failed to connect to Linear: ${message}`)
    }
  })().finally(() => {
    connectionTask = undefined
  })
  return connectionTask
}

export async function linearDisconnect(context: ExtensionContext, id = activeWorkspaceId) {
  if (!id) return
  await linearWorkspaces.disconnect(id)
  if (id === activeWorkspaceId) {
    Controller.deactivateWorkspace()
    activeWorkspaceId = undefined
    await context.workspaceState.update(ACTIVE_WORKSPACE_KEY, undefined)
    await setCommandContext(CommandContext.linearAccountConnected, false)
    const next = getConnectedWorkspaces()[0]
    if (next) await switchLinearWorkspace(next.id)
  }
  workspaceChanges.fire()
  notifyLinearMcpDefinitionsChanged()
}
