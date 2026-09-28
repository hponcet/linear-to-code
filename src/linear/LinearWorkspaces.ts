import { LinearClient } from "@linear/sdk"

import { LinearService } from "./LinearService"

import type { Memento, SecretStorage } from "vscode"

export type LinearWorkspace = {
  id: string
  name: string
  urlKey: string
  userId: string
  userName: string
}

const WORKSPACE_KEY = "linearToCode.workspace."
export const WORKSPACE_SECRET_PREFIX = "linearToCode.token."
export const LEGACY_LINEAR_TOKEN = "linearAccessToken"

function createClient(accessToken: string) {
  return new LinearClient({ accessToken, headers: { "public-file-urls-expire-in": "60" } })
}

/** Credentials are shared by editor windows; active navigation is stored separately. */
export class LinearWorkspaces {
  private clients = new Map<string, LinearClient>()
  private services = new Map<string, LinearService>()

  constructor(
    private metadata: Memento,
    private secrets: Pick<SecretStorage, "get" | "store" | "delete">,
    private makeClient = createClient,
  ) {}

  list(): LinearWorkspace[] {
    return this.metadata
      .keys()
      .filter((key) => key.startsWith(WORKSPACE_KEY))
      .map((key) => this.metadata.get<LinearWorkspace>(key)!)
      .filter((item) => item?.id && item.name)
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  get(id: string): LinearWorkspace {
    const workspace = this.metadata.get<LinearWorkspace>(WORKSPACE_KEY + id)
    if (!workspace) throw new Error("This Linear workspace is not connected. Connect it again.")
    return workspace
  }

  async load(): Promise<void> {
    for (const workspace of this.list()) await this.reload(workspace.id)
    const legacy = await this.secrets.get(LEGACY_LINEAR_TOKEN)
    if (legacy) {
      try {
        await this.connect(legacy)
        await this.secrets.delete(LEGACY_LINEAR_TOKEN)
      } catch (error) {
        // Keep an unverified legacy credential for a later migration attempt.
        if (!this.list().length) throw error
      }
    }
  }

  async connectWithProvider(
    getToken: () => Promise<string | undefined>,
    resetSharedSession: () => PromiseLike<unknown>,
    expectedId?: string,
  ): Promise<LinearWorkspace | undefined> {
    // Linear Connect 1.0.3 reuses its only session even with forceNewSession.
    await resetSharedSession()
    const token = await getToken()
    return token ? this.connect(token, expectedId) : undefined
  }

  async connect(token: string, expectedId?: string): Promise<LinearWorkspace> {
    const client = this.makeClient(token)
    const [organization, viewer] = await Promise.all([client.organization, client.viewer])
    const workspace: LinearWorkspace = {
      id: organization.id,
      name: organization.name,
      urlKey: organization.urlKey,
      userId: viewer.id,
      userName: viewer.displayName || viewer.name,
    }
    if (!workspace.id || !workspace.userId)
      throw new Error("Unable to verify the Linear workspace and user.")
    if (expectedId && workspace.id !== expectedId) {
      throw new Error(
        `Choose the original workspace when reconnecting; received ${workspace.name}.`,
      )
    }
    await this.secrets.store(WORKSPACE_SECRET_PREFIX + workspace.id, token)
    await this.metadata.update(WORKSPACE_KEY + workspace.id, workspace)
    await this.reload(workspace.id)
    return workspace
  }

  async disconnect(id: string): Promise<void> {
    await this.secrets.delete(WORKSPACE_SECRET_PREFIX + id)
    await this.metadata.update(WORKSPACE_KEY + id, undefined)
    await this.reload(id)
  }

  async reload(id: string): Promise<void> {
    const token = await this.token(id)
    if (token) this.clients.set(id, this.makeClient(token))
    else this.clients.delete(id)
    this.services.get(id)?.invalidateAll()
  }

  token(id: string): Thenable<string | undefined> {
    return this.secrets.get(WORKSPACE_SECRET_PREFIX + id)
  }

  service(id: string): LinearService {
    let service = this.services.get(id)
    if (!service) {
      service = new LinearService(() => this.clients.get(id) ?? null)
      this.services.set(id, service)
    }
    return service
  }
}
