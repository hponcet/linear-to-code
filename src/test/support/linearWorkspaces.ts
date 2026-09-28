import { LinearClient } from "@linear/sdk"
import { Memento } from "vscode"

import { LinearWorkspaces } from "../../linear/LinearWorkspaces"

export function memoryState(): Memento {
  const values = new Map<string, unknown>()
  return {
    keys: () => [...values.keys()],
    get: <T>(key: string, fallback?: T) => (values.has(key) ? values.get(key) : fallback) as T,
    update: async (key: string, value: unknown) => {
      if (value === undefined) values.delete(key)
      else values.set(key, value)
    },
  }
}

export function workspaceHarness() {
  const metadata = memoryState()
  const tokens = new Map<string, string>()
  const calls: { token: string; operation: string; id: string }[] = []
  const secrets = {
    get: async (key: string) => tokens.get(key),
    store: async (key: string, value: string) => {
      tokens.set(key, value)
    },
    delete: async (key: string) => {
      tokens.delete(key)
    },
  }
  const issue = (org: string, id: string) => ({
    id,
    identifier: "ENG-1",
    title: org,
    url: `https://linear.app/${org}/issue/ENG-1`,
    teamId: "team",
    stateId: "todo",
    number: 1,
    labelIds: [],
    reactions: [],
    priority: 0,
    updatedAt: new Date("2026-01-01"),
    createdAt: new Date("2026-01-01"),
  })
  const makeClient = (token: string): LinearClient => {
    const org = token.split(":")[0]
    return {
      get organization() {
        if (org === "expired") throw new Error("Authentication expired")
        return Promise.resolve({ id: org, name: `Workspace ${org}`, urlKey: org })
      },
      viewer: Promise.resolve({
        id: `user-${org}`,
        name: `User ${org}`,
        displayName: `User ${org}`,
      }),
      issue: async (id: string) => {
        calls.push({ token, operation: "read", id })
        return issue(org, id)
      },
      updateIssue: async (id: string, fields: object) => {
        calls.push({ token, operation: "update", id })
        return { issue: Promise.resolve({ ...issue(org, id), ...fields }) }
      },
      createComment: async ({ issueId }: { issueId: string }) => {
        calls.push({ token, operation: "comment", id: issueId })
      },
    } as unknown as LinearClient
  }
  return {
    registry: new LinearWorkspaces(metadata, secrets, makeClient),
    metadata,
    tokens,
    secrets,
    makeClient,
    calls,
  }
}
