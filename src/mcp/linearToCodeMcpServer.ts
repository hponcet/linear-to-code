import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"

import {
  getPullRequestDiffFromEnv,
  getPullRequestMarkdownFromEnv,
  listOpenPullRequestsMarkdown,
  readGitMcpEnv,
} from "./gitMcpApi"
import {
  createLinearClientFromEnv,
  getIssueCommentsMarkdown,
  getIssueMarkdown,
  getRelatedIssuesMarkdown,
  listMyIssuesMarkdown,
} from "./linearMcpApi"

const SERVER_NAME = "linear-to-code"
const SERVER_VERSION = "1.0.0"

async function main() {
  const workspaceId = process.env.LINEAR_WORKSPACE_ID
  const workspaceName = process.env.LINEAR_WORKSPACE_NAME
  const server = new McpServer(
    {
      name: workspaceId ? `${SERVER_NAME}-${workspaceId}` : SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      instructions: workspaceId
        ? `Linear workspace: ${workspaceName} (${workspaceId}). All Linear tools use this organization.`
        : undefined,
    },
  )

  server.registerTool(
    "get_issue",
    {
      title: "Get Linear issue",
      description: "Fetch a Linear issue by identifier (e.g. ENG-123) or internal id.",
      inputSchema: {
        identifier: z.string().optional().describe("Linear issue identifier, e.g. ENG-123"),
        id: z.string().optional().describe("Linear issue internal id"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ identifier, id }) => {
      const client = createLinearClientFromEnv()
      const markdown = await getIssueMarkdown(client, { identifier, id })
      return { content: [{ type: "text", text: markdown }] }
    },
  )

  server.registerTool(
    "get_related_issues",
    {
      title: "Get related Linear issues",
      description: "Fetch an issue plus its parent, siblings, and sub-issues.",
      inputSchema: {
        identifier: z.string().optional().describe("Linear issue identifier, e.g. ENG-123"),
        id: z.string().optional().describe("Linear issue internal id"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ identifier, id }) => {
      const client = createLinearClientFromEnv()
      const markdown = await getRelatedIssuesMarkdown(client, { identifier, id })
      return { content: [{ type: "text", text: markdown }] }
    },
  )

  server.registerTool(
    "get_issue_comments",
    {
      title: "Get Linear issue comments",
      description: "Fetch comments and threaded replies for a Linear issue.",
      inputSchema: {
        identifier: z.string().optional().describe("Linear issue identifier, e.g. ENG-123"),
        id: z.string().optional().describe("Linear issue internal id"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ identifier, id }) => {
      const client = createLinearClientFromEnv()
      const markdown = await getIssueCommentsMarkdown(client, { identifier, id })
      return { content: [{ type: "text", text: markdown }] }
    },
  )

  server.registerTool(
    "list_my_issues",
    {
      title: "List my Linear issues",
      description: "List issues assigned to the connected Linear user.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const client = createLinearClientFromEnv()
      const markdown = await listMyIssuesMarkdown(client)
      return { content: [{ type: "text", text: markdown }] }
    },
  )

  server.registerTool(
    "list_open_pull_requests",
    {
      title: "List open pull requests",
      description: "List open pull requests for the current repository.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const env = readGitMcpEnv()
      const markdown = await listOpenPullRequestsMarkdown(env)
      return { content: [{ type: "text", text: markdown }] }
    },
  )

  server.registerTool(
    "get_pull_request",
    {
      title: "Get pull request",
      description: "Fetch pull request metadata for an open pull request.",
      inputSchema: {
        pullRequestId: z
          .union([z.string(), z.number()])
          .describe("Pull request id/number in the current repository"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ pullRequestId }) => {
      const env = readGitMcpEnv()
      const markdown = await getPullRequestMarkdownFromEnv(env, pullRequestId)
      return { content: [{ type: "text", text: markdown }] }
    },
  )

  server.registerTool(
    "get_pull_request_diff",
    {
      title: "Get pull request diff",
      description:
        "Fetch the unified diff for a pull request by id or by source/target branch names.",
      inputSchema: {
        pullRequestId: z
          .union([z.string(), z.number()])
          .optional()
          .describe("Pull request id/number"),
        sourceBranch: z.string().optional().describe("Source branch name"),
        targetBranch: z.string().optional().describe("Target branch name"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ pullRequestId, sourceBranch, targetBranch }) => {
      const env = readGitMcpEnv()
      const diff = await getPullRequestDiffFromEnv(env, {
        pullRequestId,
        sourceBranch,
        targetBranch,
      })
      return { content: [{ type: "text", text: diff }] }
    },
  )

  server.registerResource(
    "linear-issues",
    "linear://issues",
    {
      title: "My Linear issues",
      description: "Issues assigned to the connected Linear user.",
      mimeType: "text/markdown",
    },
    async () => {
      const client = createLinearClientFromEnv()
      const markdown = await listMyIssuesMarkdown(client)
      return {
        contents: [{ uri: "linear://issues", mimeType: "text/markdown", text: markdown }],
      }
    },
  )

  server.registerResource(
    "open-pull-requests",
    "linear-to-code://pull-requests",
    {
      title: "Open pull requests",
      description: "Open pull requests for the current repository.",
      mimeType: "text/markdown",
    },
    async () => {
      const env = readGitMcpEnv()
      const markdown = await listOpenPullRequestsMarkdown(env)
      return {
        contents: [
          {
            uri: "linear-to-code://pull-requests",
            mimeType: "text/markdown",
            text: markdown,
          },
        ],
      }
    },
  )

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
