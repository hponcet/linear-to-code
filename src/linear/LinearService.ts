import {
  Attachment,
  Comment,
  Issue,
  IssuePriorityValue,
  LinearClient,
  PaginationOrderBy,
  Team,
  User,
} from "@linear/sdk"
import {
  buildIssueHistoryEnrichmentContext,
  enrichIssueHistoryEntries,
  snapshotWorkflowState,
} from "src/linear/issueHistoryEnrichment"
import { LinearCacheStore } from "src/linear/LinearCacheStore"
import {
  fetchAssignedIssues,
  fetchCurrentCycleIssues,
  fetchViewer,
  fetchWorkflowStatesByTeam,
} from "src/linear/linearFetchers"
import {
  fetchProjectLabels,
  fetchTeamMetadata,
  fetchWorkspaceLabels,
  fetchWorkspaceUsers,
  TeamMetadata,
} from "src/linear/teamMetadata"
import { SerializedIssueHistory, SerializedWorkflowState } from "src/types/SerializedLinear"
import {
  Issue as TreeIssue,
  Team as TreeTeam,
  WorkflowState,
  addKeyOnItem,
} from "src/views/myIssues/types"
import { getCanonicalPrivateLinearAssetUrl } from "src/webviews/components/Editor/markdownPlugins/privateLinearImageUrl"

import { buildNavigationIssueFilter, NavigationFilters, NavigationMetadata } from "./navigation"
import { fetchAllPreviousPages } from "./pagination"

export type IssueUpdateFields = Parameters<LinearClient["updateIssue"]>[1]
export type CreateReactionInput = Parameters<LinearClient["createReaction"]>[0]

export const MAX_LINEAR_FILE_SIZE = 10 * 1024 * 1024

export type LinearFileUploadRequest = {
  uploadId: string
  name: string
  mimeType: string
  size: number
  base64: string
}

export type LinearFileUploadResult = {
  assetUrl: string
}

export type LinearAssetDownloadResult = {
  base64: string
  mimeType: string
}

export type LinearEditorMention = {
  kind: "user" | "issue" | "project" | "document" | "cycle" | "milestone"
  id: string
  label: string
  description?: string
  resourceUrl: string
  /** Workflow state of an issue suggestion, so the menu can draw its status icon. */
  workflowState?: SerializedWorkflowState
}

export type LinearReferenceKind =
  | "user"
  | "issue"
  | "project"
  | "document"
  | "cycle"
  | "milestone"
  | "view"
  | "initiative"

export type LinearReferenceRequest = {
  kind: LinearReferenceKind
  id: string
}

/**
 * A resolved reference, shaped for the hover card. The rows are built here so the webview
 * never has to know how each Linear entity exposes its own details.
 */
export type LinearReferenceCard = {
  kind: LinearReferenceKind
  title: string
  subtitle?: string
  rows: { label: string; value: string }[]
  avatarUrl?: string
  avatarBackgroundColor?: string
  initials?: string
  url?: string
  /** Canonical Linear id, known once the reference is resolved. */
  id?: string
  /** Chip presentation, mirroring how Linear draws the reference inline. */
  identifier?: string
  icon?: string
  color?: string
  workflowState?: SerializedWorkflowState
}

const LINEAR_REFERENCE_KINDS: LinearReferenceKind[] = [
  "user",
  "issue",
  "project",
  "document",
  "cycle",
  "milestone",
  "view",
  "initiative",
]

const LINEAR_REFERENCE_ID_PATTERN = /^[A-Za-z0-9._~:@+-]{1,200}$/
const LINEAR_UUID_PATTERN =
  /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/

function formatReferenceDate(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10)
}

function referenceRows(
  rows: ({ label: string; value: string | undefined | null } | undefined)[],
): { label: string; value: string }[] {
  return rows.flatMap((row) =>
    row && typeof row.value === "string" && row.value.trim()
      ? [{ label: row.label, value: row.value.trim() }]
      : [],
  )
}

const MIME_TYPE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/
const UPLOAD_ID_PATTERN = /^[A-Za-z0-9._:-]+$/

function validateUploadId(uploadId: string): void {
  if (
    typeof uploadId !== "string" ||
    uploadId.length === 0 ||
    uploadId.length > 128 ||
    !UPLOAD_ID_PATTERN.test(uploadId)
  ) {
    throw new Error("Invalid Linear file upload ID")
  }
}

export function validateLinearFileUploadRequest(input: LinearFileUploadRequest): Buffer {
  validateUploadId(input.uploadId)

  if (
    typeof input.name !== "string" ||
    input.name.trim().length === 0 ||
    input.name.length > 255 ||
    input.name.includes("/") ||
    input.name.includes("\\") ||
    [...input.name].some((character) => {
      const code = character.charCodeAt(0)
      return code < 32 || code === 127
    })
  ) {
    throw new Error("Invalid Linear file name")
  }

  if (
    typeof input.mimeType !== "string" ||
    input.mimeType.length > 127 ||
    !MIME_TYPE_PATTERN.test(input.mimeType)
  ) {
    throw new Error("Invalid Linear file MIME type")
  }

  if (!Number.isInteger(input.size) || input.size <= 0 || input.size > MAX_LINEAR_FILE_SIZE) {
    throw new Error(`Linear files must be between 1 byte and ${MAX_LINEAR_FILE_SIZE} bytes`)
  }

  const encodedLength = Math.ceil(input.size / 3) * 4
  if (typeof input.base64 !== "string" || input.base64.length !== encodedLength) {
    throw new Error("Linear file data does not match its declared size")
  }

  const bytes = Buffer.from(input.base64, "base64")
  if (bytes.length !== input.size || bytes.toString("base64") !== input.base64) {
    throw new Error("Invalid Linear file base64 data")
  }

  return bytes
}

function linearResourceUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    return url.protocol === "https:" &&
      (url.hostname === "linear.app" || url.hostname.endsWith(".linear.app"))
      ? value
      : undefined
  } catch {
    return undefined
  }
}

export type IssueHistoryRequest = {
  issueId: Issue["id"]
}

export type IssueHistoryPage = {
  nodes: SerializedIssueHistory[]
}

export class LinearService {
  #getClient: () => LinearClient | null
  #cache: LinearCacheStore
  #fileUploads = new Map<string, AbortController>()

  constructor(getClient: () => LinearClient | null, cache?: LinearCacheStore) {
    this.#getClient = getClient
    this.#cache = cache ?? new LinearCacheStore()
  }

  invalidateTeam(teamId: string): void {
    this.#cache.delete(`teamMetadata:${teamId}`)
  }

  invalidateIssue(issueId: string): void {
    this.#cache.delete(`issue:${issueId}`)
  }

  invalidateIssueLists(): void {
    this.#cache.delete("assignedIssues")
    this.#cache.deleteByPrefix("cycleIssues:")
    this.#cache.deleteByPrefix("navigationIssues:")
  }

  invalidateAll(): void {
    this.#cache.clear()
  }

  async getViewer(): Promise<User> {
    return this.#cache.getOrFetch("viewer", async () => {
      const client = this.#requireClient()
      return fetchViewer(client)
    })
  }

  async getTeams(): Promise<Record<string, TreeTeam>> {
    return this.#cache.getOrFetch("teams", async () => {
      const teams = await fetchAllPreviousPages(await this.#requireClient().teams())
      return Object.fromEntries(teams.map((team) => [team.id, addKeyOnItem(team, "team")]))
    })
  }

  async getNavigationMetadata(): Promise<NavigationMetadata> {
    return this.#cache.getOrFetch("navigationMetadata", async () => {
      const client = this.#requireClient()
      const [teams, projects, cycles, states] = await Promise.all([
        this.getTeams(),
        client.projects().then(fetchAllPreviousPages),
        client.cycles().then(fetchAllPreviousPages),
        client.workflowStates().then(fetchAllPreviousPages),
      ])
      return {
        teams: Object.values(teams).map(({ id, name, color, icon }) => ({
          id,
          name,
          color: color ?? undefined,
          icon: icon ?? undefined,
        })),
        projects: await Promise.all(
          projects.map(async (project) => ({
            id: project.id,
            name: project.name,
            color: project.color,
            icon: project.icon ?? undefined,
            teamIds: (await fetchAllPreviousPages(await project.teams())).map(({ id }) => id),
          })),
        ),
        cycles: cycles.map((cycle) => ({
          id: cycle.id,
          name: cycle.name || `Cycle ${cycle.number}`,
          teamId: cycle.teamId!,
        })),
        states: states.map((state) => ({
          id: state.id,
          name: state.name,
          teamId: state.teamId!,
          color: state.color,
        })),
      }
    })
  }

  async getNavigationIssues(filters: NavigationFilters, after?: string) {
    const key = `navigationIssues:${JSON.stringify([filters, after])}`
    return this.#cache.getOrFetch(key, async () => {
      const user = await this.getViewer()
      const result = await this.#requireClient().issues({
        first: 100,
        after,
        includeArchived: false,
        orderBy: PaginationOrderBy.UpdatedAt,
        filter: buildNavigationIssueFilter(filters, user.id),
      })
      return {
        issues: result.nodes.map((issue) => this.toTreeIssue(issue)),
        nextCursor: result.pageInfo.hasNextPage ? result.pageInfo.endCursor : undefined,
      }
    })
  }

  async getWorkflowStatesByTeam(): Promise<Record<string, Record<string, WorkflowState>>> {
    return this.#cache.getOrFetch("workflowStatesByTeam", async () => {
      const client = this.#requireClient()
      const teams = await this.getTeams()
      return fetchWorkflowStatesByTeam(client, teams)
    })
  }

  async getTeamMetadata(teamId: string): Promise<TeamMetadata> {
    return this.#cache.getOrFetch(`teamMetadata:${teamId}`, async () => {
      const client = this.#requireClient()
      return fetchTeamMetadata(client, teamId)
    })
  }

  async getProjectLabels(projectId: string) {
    return this.#cache.getOrFetch(`projectLabels:${projectId}`, async () => {
      const client = this.#requireClient()
      return fetchProjectLabels(client, projectId)
    })
  }

  async getWorkspaceLabels() {
    return this.#cache.getOrFetch("workspaceLabels", async () => {
      const client = this.#requireClient()
      return fetchWorkspaceLabels(client)
    })
  }

  async getWorkspaceUsers(): Promise<User[]> {
    return this.#cache.getOrFetch("workspaceUsers", async () => {
      const client = this.#requireClient()
      return fetchWorkspaceUsers(client)
    })
  }

  async getPriorities(): Promise<IssuePriorityValue[]> {
    return this.#cache.getOrFetch("priorities", async () => {
      const client = this.#requireClient()
      return client.issuePriorityValues
    })
  }

  async getTeam(teamId: string): Promise<Team> {
    return this.#cache.getOrFetch(`team:${teamId}`, async () => {
      const client = this.#requireClient()
      return client.team(teamId)
    })
  }

  async getIssue(issueId: string, options?: { bypassCache?: boolean }): Promise<Issue> {
    if (options?.bypassCache) {
      this.invalidateIssue(issueId)
    }

    return this.#cache.getOrFetch(`issue:${issueId}`, async () => {
      const client = this.#requireClient()
      return client.issue(issueId)
    })
  }

  async getIssueByIdentifier(identifier: string): Promise<Issue | null> {
    const normalized = identifier.trim().toUpperCase()
    if (!normalized.includes("-")) {
      return null
    }

    const issueId = await this.#cache.getOrFetch<string | null>(
      `issueIdentifier:${normalized}`,
      async () => {
        const client = this.#requireClient()
        const result = await client.searchIssues(normalized)
        const match = result.nodes.find((node) => node.identifier?.toUpperCase() === normalized)
        return match?.id ?? null
      },
    )

    if (!issueId) {
      return null
    }

    return this.getIssue(issueId)
  }

  async searchIssues(
    query: string,
  ): Promise<Awaited<ReturnType<LinearClient["searchIssues"]>>["nodes"]> {
    const normalized = query.trim()
    if (!normalized) {
      return []
    }

    const result = await this.#requireClient().searchIssues(normalized)
    return result.nodes
  }

  async searchEditorMentions(query: string): Promise<LinearEditorMention[]> {
    if (typeof query !== "string" || query.length > 200) {
      throw new Error("Invalid Linear mention search query")
    }

    const normalized = query.trim()
    const lowerQuery = normalized.toLocaleLowerCase()
    const client = this.#requireClient()
    const getOrganizationUrlKey = () =>
      this.#cache.getOrFetch("organizationUrlKey", async () => (await client.organization).urlKey)
    const searches: Promise<LinearEditorMention[]>[] = [
      this.getWorkspaceUsers().then((users) =>
        users
          .filter(
            (user) =>
              user.active !== false &&
              user.isMentionable !== false &&
              `${user.displayName} ${user.name} ${user.email}`
                .toLocaleLowerCase()
                .includes(lowerQuery),
          )
          .slice(0, 8)
          .flatMap((user) => {
            const resourceUrl = linearResourceUrl(user.url)
            return resourceUrl
              ? [
                  {
                    kind: "user" as const,
                    id: user.id,
                    label: user.displayName || user.name,
                    description: user.email,
                    resourceUrl,
                  },
                ]
              : []
          }),
      ),
    ]

    if (normalized) {
      searches.push(
        Promise.all([
          client.searchIssues(normalized, { first: 8, includeArchived: false }),
          // Already cached with the team metadata, so the status icon costs no extra request.
          this.getWorkflowStatesByTeam().catch(() => ({})),
        ]).then(([result, statesByTeam]) => {
          const states = new Map(
            Object.values(statesByTeam).flatMap((teamStates) => Object.entries(teamStates)),
          )

          return result.nodes.slice(0, 8).flatMap((issue) => {
            const resourceUrl = linearResourceUrl(issue.url)
            const state = issue.stateId ? states.get(issue.stateId) : undefined
            return resourceUrl
              ? [
                  {
                    kind: "issue" as const,
                    id: issue.id,
                    label: issue.identifier,
                    description: issue.title,
                    resourceUrl,
                    workflowState: snapshotWorkflowState(state),
                  },
                ]
              : []
          })
        }),
        client.searchProjects(normalized, { first: 8, includeArchived: false }).then((result) =>
          result.nodes.slice(0, 8).flatMap((project) => {
            const resourceUrl = linearResourceUrl(project.url)
            return resourceUrl
              ? [
                  {
                    kind: "project" as const,
                    id: project.id,
                    label: project.name,
                    resourceUrl,
                  },
                ]
              : []
          }),
        ),
        client.searchDocuments(normalized, { first: 8, includeArchived: false }).then((result) =>
          result.nodes.slice(0, 8).flatMap((document) => {
            const resourceUrl = linearResourceUrl(document.url)
            return resourceUrl
              ? [
                  {
                    kind: "document" as const,
                    id: document.id,
                    label: document.title,
                    resourceUrl,
                  },
                ]
              : []
          }),
        ),
        client
          .cycles({
            first: 8,
            includeArchived: false,
            filter: {
              or: [
                { name: { containsIgnoreCase: normalized } },
                ...(Number.isSafeInteger(Number(normalized.replace(/^cycle\s+/i, "")))
                  ? [{ number: { eq: Number(normalized.replace(/^cycle\s+/i, "")) } }]
                  : []),
              ],
            },
          })
          .then(async (result) => {
            const urlKey = await getOrganizationUrlKey()
            return result.nodes.slice(0, 8).map((cycle) => ({
              kind: "cycle" as const,
              id: cycle.id,
              label: cycle.name?.trim() || `Cycle ${cycle.number}`,
              resourceUrl: `https://linear.app/${encodeURIComponent(urlKey)}/cycle/${cycle.id}`,
            }))
          }),
        client
          .projectMilestones({
            first: 8,
            includeArchived: false,
            filter: { name: { containsIgnoreCase: normalized } },
          })
          .then(async (result) => {
            const urlKey = await getOrganizationUrlKey()
            return result.nodes.slice(0, 8).map((milestone) => ({
              kind: "milestone" as const,
              id: milestone.id,
              label: milestone.name,
              resourceUrl: `https://linear.app/${encodeURIComponent(urlKey)}/project-milestone/${milestone.id}`,
            }))
          }),
      )
    }

    const results = await Promise.allSettled(searches)
    return results
      .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
      .slice(0, 48)
  }

  /**
   * Resolves one editor reference into its hover card. Unknown or unresolvable references
   * return null instead of throwing: a slug-only view or initiative URL cannot be fetched.
   */
  async resolveEditorReference(
    request: LinearReferenceRequest,
  ): Promise<LinearReferenceCard | null> {
    const { kind, id } = request ?? {}

    if (
      !LINEAR_REFERENCE_KINDS.includes(kind) ||
      typeof id !== "string" ||
      !LINEAR_REFERENCE_ID_PATTERN.test(id)
    ) {
      throw new Error("Invalid Linear reference request")
    }

    return this.#cache.getOrFetch(`reference:${kind}:${id}`, async () => {
      try {
        return await this.#fetchEditorReference(kind, id)
      } catch {
        return null
      }
    })
  }

  async #fetchEditorReference(
    kind: LinearReferenceKind,
    id: string,
  ): Promise<LinearReferenceCard | null> {
    const client = this.#requireClient()

    if (kind === "user") {
      const users = await this.getWorkspaceUsers()
      const lowerId = id.toLocaleLowerCase()
      const user = users.find(
        (candidate) =>
          candidate.id === id ||
          candidate.displayName?.toLocaleLowerCase() === lowerId ||
          candidate.name?.toLocaleLowerCase() === lowerId ||
          candidate.email?.toLocaleLowerCase() === lowerId ||
          candidate.email?.split("@")[0]?.toLocaleLowerCase() === lowerId,
      )

      return user
        ? {
            kind,
            title: user.displayName || user.name,
            subtitle: user.email,
            rows: referenceRows([
              { label: "Status", value: user.active === false ? "Deactivated" : "Active" },
              { label: "Name", value: user.name },
            ]),
            avatarUrl: user.avatarUrl ?? undefined,
            url: linearResourceUrl(user.url ?? ""),
          }
        : null
    }

    if (kind === "issue") {
      // A reference Linear wrote as a URL carries the identifier, not the UUID.
      const issue = LINEAR_UUID_PATTERN.test(id)
        ? await this.getIssue(id)
        : await this.getIssueByIdentifier(id)
      if (!issue) {
        return null
      }

      const [state, assignee, project] = await Promise.all([
        issue.state,
        issue.assignee,
        issue.project,
      ])

      return {
        kind,
        id: issue.id,
        title: issue.identifier,
        subtitle: issue.title,
        identifier: issue.identifier,
        workflowState: snapshotWorkflowState(state),
        rows: referenceRows([
          { label: "Status", value: state?.name },
          { label: "Priority", value: issue.priorityLabel },
          { label: "Assignee", value: assignee?.displayName || assignee?.name },
          { label: "Project", value: project?.name },
        ]),
        url: linearResourceUrl(issue.url ?? ""),
      }
    }

    if (kind === "project") {
      const project = await client.project(id)
      const lead = await project.lead
      const progress = typeof project.progress === "number" ? project.progress : undefined

      return {
        kind,
        title: project.name,
        subtitle: project.description ?? undefined,
        icon: project.icon ?? undefined,
        color: project.color ?? undefined,
        rows: referenceRows([
          { label: "Status", value: (await project.status)?.name },
          {
            label: "Progress",
            value: progress === undefined ? undefined : `${Math.round(progress * 100)}%`,
          },
          { label: "Lead", value: lead?.displayName || lead?.name },
          { label: "Target", value: formatReferenceDate(project.targetDate) },
        ]),
        url: linearResourceUrl(project.url ?? ""),
      }
    }

    if (kind === "document") {
      const document = await client.document(id)
      const updatedBy = await document.updatedBy

      return {
        kind,
        title: document.title,
        subtitle: (await document.project)?.name,
        icon: document.icon ?? undefined,
        color: document.color ?? undefined,
        rows: referenceRows([
          { label: "Updated", value: formatReferenceDate(document.updatedAt) },
          { label: "By", value: updatedBy?.displayName || updatedBy?.name },
        ]),
        url: linearResourceUrl(document.url ?? ""),
      }
    }

    if (kind === "cycle") {
      const cycle = await client.cycle(id)
      const team = await cycle.team

      return {
        kind,
        title: cycle.name?.trim() || `Cycle ${cycle.number}`,
        subtitle: team?.name,
        rows: referenceRows([
          { label: "Starts", value: formatReferenceDate(cycle.startsAt) },
          { label: "Ends", value: formatReferenceDate(cycle.endsAt) },
          {
            label: "Progress",
            value:
              typeof cycle.progress === "number"
                ? `${Math.round(cycle.progress * 100)}%`
                : undefined,
          },
        ]),
      }
    }

    if (kind === "milestone") {
      const milestone = await client.projectMilestone(id)

      return {
        kind,
        title: milestone.name,
        subtitle: (await milestone.project)?.name,
        rows: referenceRows([
          { label: "Target", value: formatReferenceDate(milestone.targetDate) },
        ]),
      }
    }

    if (kind === "initiative") {
      const initiative = await client.initiative(id)
      const owner = await initiative.owner

      return {
        kind,
        title: initiative.name,
        subtitle: initiative.description ?? undefined,
        icon: initiative.icon ?? undefined,
        color: initiative.color ?? undefined,
        rows: referenceRows([
          { label: "Status", value: initiative.status },
          { label: "Owner", value: owner?.displayName || owner?.name },
        ]),
        url: linearResourceUrl(initiative.url ?? ""),
      }
    }

    const view = await client.customView(id)
    return {
      kind,
      title: view.name,
      subtitle: view.description ?? undefined,
      rows: referenceRows([{ label: "Updated", value: formatReferenceDate(view.updatedAt) }]),
    }
  }

  async getAssignedIssues(): Promise<TreeIssue[]> {
    return this.#cache.getOrFetch("assignedIssues", async () => {
      const me = await this.getViewer()
      return fetchAssignedIssues(me)
    })
  }

  async getCurrentCycleIssues(): Promise<TreeIssue[]> {
    const teams = await this.getTeams()
    const teamIds = Object.keys(teams).sort().join(",")

    return this.#cache.getOrFetch(`cycleIssues:${teamIds}`, async () => {
      const client = this.#requireClient()
      return fetchCurrentCycleIssues(client, teams)
    })
  }

  async getComments(issueId: string): Promise<Comment[]> {
    const client = this.#requireClient()
    const comments = await client.comments({
      filter: { issue: { id: { eq: issueId } } },
      orderBy: PaginationOrderBy.CreatedAt,
    })
    return fetchAllPreviousPages(comments)
  }

  async getSubIssues(issueId: string): Promise<Issue[]> {
    const issue = await this.getIssue(issueId)
    const subIssues = await issue.children({ last: 100 })
    return fetchAllPreviousPages(subIssues)
  }

  async getAttachments(
    issueId: string,
    options?: { bypassCache?: boolean },
  ): Promise<Attachment[]> {
    const issue = await this.getIssue(issueId, options)
    const attachments = await issue.attachments({ last: 100 })
    return fetchAllPreviousPages(attachments)
  }

  async getIssueHistory(params: IssueHistoryRequest): Promise<IssueHistoryPage> {
    const client = this.#requireClient()
    const issue = await this.getIssue(params.issueId)
    const firstPage = await issue.history({ first: 50 })
    const nodes = [...firstPage.nodes]
    let endCursor = firstPage.pageInfo.endCursor ?? null

    while (endCursor) {
      const page = await issue.history({
        before: endCursor,
        last: 50,
        orderBy: PaginationOrderBy.CreatedAt,
      })
      nodes.push(...page.nodes)
      endCursor = page.pageInfo.endCursor ?? null
    }

    const enrichmentContext = await buildIssueHistoryEnrichmentContext(client, issue, nodes, {
      getTeamMetadata: (teamId) => this.getTeamMetadata(teamId),
      getWorkspaceUsers: () => this.getWorkspaceUsers(),
      getPriorities: () => this.getPriorities(),
    })

    return {
      nodes: enrichIssueHistoryEntries(nodes, enrichmentContext),
    }
  }

  async updateIssue(issueId: string, fields: IssueUpdateFields): Promise<Issue> {
    const client = this.#requireClient()
    const result = await client.updateIssue(issueId, fields)
    const updatedIssue = await result.issue
    if (!updatedIssue) {
      throw new Error(`Failed to update issue ${issueId}`)
    }

    this.invalidateIssue(issueId)
    if (
      fields.stateId ||
      fields.assigneeId !== undefined ||
      fields.projectId !== undefined ||
      fields.cycleId !== undefined ||
      fields.teamId !== undefined
    ) {
      this.invalidateIssueLists()
    }

    return updatedIssue
  }

  async createComment(input: Parameters<LinearClient["createComment"]>[0]): Promise<void> {
    await this.#requireClient().createComment(input)
    if (input.issueId) {
      this.invalidateIssue(input.issueId)
    }
  }

  async updateComment(commentId: string, body: string): Promise<void> {
    await this.#requireClient().updateComment(commentId, { body })
  }

  async deleteComment(commentId: string): Promise<void> {
    await this.#requireClient().deleteComment(commentId)
  }

  async commentResolve(commentId: string, resolvingCommentId?: string): Promise<void> {
    await this.#requireClient().commentResolve(
      commentId,
      resolvingCommentId ? { resolvingCommentId } : undefined,
    )
  }

  async commentUnresolve(commentId: string): Promise<void> {
    await this.#requireClient().commentUnresolve(commentId)
  }

  async createReaction(reaction: CreateReactionInput): Promise<void> {
    await this.#requireClient().createReaction(reaction)
    if (reaction.issueId) {
      this.invalidateIssue(reaction.issueId)
    }
  }

  async deleteReaction(reactionId: string, issueId?: string): Promise<void> {
    await this.#requireClient().deleteReaction(reactionId)
    if (issueId) {
      this.invalidateIssue(issueId)
    }
  }

  async deleteAttachment(attachmentId: string, issueId?: string): Promise<void> {
    await this.#requireClient().deleteAttachment(attachmentId)
    if (issueId) {
      this.invalidateIssue(issueId)
    }
  }

  async createAttachment(input: Parameters<LinearClient["createAttachment"]>[0]): Promise<void> {
    await this.#requireClient().createAttachment(input)
    this.invalidateIssue(input.issueId)
  }

  async uploadLinearFile(input: LinearFileUploadRequest): Promise<LinearFileUploadResult> {
    const bytes = validateLinearFileUploadRequest(input)
    if (this.#fileUploads.has(input.uploadId)) {
      throw new Error(`Linear file upload ${input.uploadId} is already in progress`)
    }

    const controller = new AbortController()
    this.#fileUploads.set(input.uploadId, controller)

    try {
      const payload = await this.#requireClient().fileUpload(input.mimeType, input.name, input.size)
      controller.signal.throwIfAborted()

      const uploadFile = payload.uploadFile
      if (!payload.success || !uploadFile) {
        throw new Error("Linear did not return file upload instructions")
      }

      const uploadUrl = new URL(uploadFile.uploadUrl)
      const assetUrl = new URL(uploadFile.assetUrl)
      if (uploadUrl.protocol !== "https:" || assetUrl.protocol !== "https:") {
        throw new Error("Linear returned an insecure file upload URL")
      }

      const headers: [string, string][] = uploadFile.headers.map(({ key, value }) => [key, value])
      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers,
        body: Uint8Array.from(bytes).buffer,
        signal: controller.signal,
        redirect: "error",
      })
      if (!response.ok) {
        throw new Error(`Linear file upload failed with status ${response.status}`)
      }

      return { assetUrl: uploadFile.assetUrl }
    } finally {
      this.#fileUploads.delete(input.uploadId)
    }
  }

  async downloadLinearAsset(source: string): Promise<LinearAssetDownloadResult> {
    const url = getCanonicalPrivateLinearAssetUrl(source)
    if (!url) {
      throw new Error("Invalid private Linear asset URL")
    }

    const authorization = new Headers(this.#requireClient().options.headers).get("Authorization")
    if (!authorization) {
      throw new Error("Linear client is missing authorization")
    }

    const response = await fetch(url, {
      headers: { Authorization: authorization },
      redirect: "error",
    })
    if (!response.ok) {
      throw new Error(`Linear asset download failed with status ${response.status}`)
    }

    // ponytail: Reuse the editor's 10 MB ceiling; stream through a URI handler if larger playback is needed.
    const declaredSize = Number(response.headers.get("content-length"))
    if (declaredSize > MAX_LINEAR_FILE_SIZE) {
      throw new Error(`Linear assets must not exceed ${MAX_LINEAR_FILE_SIZE} bytes`)
    }

    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > MAX_LINEAR_FILE_SIZE) {
      throw new Error(`Linear assets must not exceed ${MAX_LINEAR_FILE_SIZE} bytes`)
    }

    return {
      base64: bytes.toString("base64"),
      mimeType:
        response.headers.get("content-type")?.split(";", 1)[0] || "application/octet-stream",
    }
  }

  cancelLinearFileUpload(uploadId: string): boolean {
    validateUploadId(uploadId)
    const controller = this.#fileUploads.get(uploadId)
    if (!controller) {
      return false
    }

    controller.abort()
    return true
  }

  async createSubIssue(
    parentId: Issue["id"],
    teamId: string,
    fields: IssueUpdateFields,
  ): Promise<Issue> {
    const result = await this.#requireClient().createIssue({
      ...fields,
      parentId,
      teamId,
    })
    const createdIssue = await result.issue
    if (!createdIssue) {
      throw new Error(`Failed to create sub-issue for parent ${parentId}`)
    }

    this.invalidateIssue(parentId)
    this.invalidateIssueLists()
    return createdIssue
  }

  async deleteSubIssue(issueId: string): Promise<void> {
    await this.#requireClient().deleteIssue(issueId)
    this.invalidateIssue(issueId)
    this.invalidateIssueLists()
  }

  toTreeIssue(issue: Issue): TreeIssue {
    return addKeyOnItem(issue, "issue")
  }

  #requireClient(): LinearClient {
    const client = this.#getClient()
    if (!client) {
      throw new Error("Linear client is not available")
    }
    return client
  }
}
