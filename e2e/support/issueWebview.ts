import { expect } from "@playwright/test"

import type { Page } from "@playwright/test"

export type IpcRequest = {
  type: string
  _ipcReqId?: string
  [key: string]: unknown
}

type DescriptionUpdate = IpcRequest & {
  fields: { description: string }
}

type HarnessState = {
  requests: IpcRequest[]
  unexpectedMessages: string[]
}

type ReferenceCard = {
  kind: string
  title: string
  subtitle?: string
  rows: { label: string; value: string }[]
  identifier?: string
  icon?: string
  color?: string
  workflowState?: {
    id: string
    name: string
    color: string
    type: string
    position: number
    stateProgress: number
    stateTypeLength: number
  }
}

type MentionResult = {
  kind: string
  id: string
  label: string
  resourceUrl: string | null
  description?: string
}

type HarnessComment = {
  id: string
  body: string
  userId?: string
  parentId?: string | null
  createdAt: string
  updatedAt: string
}

type HarnessViewer = {
  id: string
  displayName: string
  name: string
  email: string
  active: boolean
}

export type IssueWebviewOptions = {
  initialDescription: string
  initialDraft?: string
  descriptionUpdateDelayMs?: number
  descriptionUpdateFailures?: number
  initialComments?: HarnessComment[]
  viewer?: HarnessViewer
  mentionResults?: MentionResult[]
  referenceCards?: Record<string, ReferenceCard>
  uploadAsset?: {
    url: string
    contentType: string
    bodyBase64: string
  }
  uploadDelayMs?: number
  uploadFailures?: number
  mockEmbedDocuments?: string[]
  mockMediaRequests?: string[]
  mockYouTubeIframeApi?: boolean
  expectUnsupported?: boolean
}

export type IssueWebviewHarness = {
  runtimeErrors: string[]
  externalRequests: string[]
  mockedEmbedRequests: string[]
  assertClean: () => Promise<void>
}

const TEST_ORIGIN = "http://127.0.0.1:4173"

export async function openIssueWebview(
  page: Page,
  initialDescriptionOrOptions: string | IssueWebviewOptions,
): Promise<IssueWebviewHarness> {
  const options: IssueWebviewOptions =
    typeof initialDescriptionOrOptions === "string"
      ? { initialDescription: initialDescriptionOrOptions }
      : initialDescriptionOrOptions
  const runtimeErrors: string[] = []
  const externalRequests: string[] = []
  const mockedEmbedRequests: string[] = []

  page.on("pageerror", (error) => runtimeErrors.push(error.stack || error.message))
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !(
        options.descriptionUpdateFailures &&
        message.text().includes("E2E description update failure")
      )
    ) {
      runtimeErrors.push(message.text())
    }
  })

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === TEST_ORIGIN) {
      await route.continue()
      return
    }

    if (options.uploadAsset && url.toString() === options.uploadAsset.url) {
      await route.fulfill({
        body: Buffer.from(options.uploadAsset.bodyBase64, "base64"),
        contentType: options.uploadAsset.contentType,
      })
      return
    }

    const isMockedEmbedDocument =
      route.request().resourceType() === "document" &&
      options.mockEmbedDocuments?.includes(url.toString())
    const isMockedMediaRequest =
      route.request().resourceType() === "media" &&
      options.mockMediaRequests?.includes(url.toString())
    const isMockedYouTubeApi =
      route.request().resourceType() === "script" &&
      options.mockYouTubeIframeApi &&
      url.toString() === "https://www.youtube.com/iframe_api"
    if (isMockedEmbedDocument || isMockedMediaRequest || isMockedYouTubeApi) {
      mockedEmbedRequests.push(url.toString())
      await route.fulfill({
        body:
          isMockedYouTubeApi || isMockedMediaRequest
            ? ""
            : "<!doctype html><title>E2E embed fixture</title>",
        contentType: isMockedYouTubeApi
          ? "application/javascript"
          : isMockedMediaRequest
            ? "video/mp4"
            : "text/html",
      })
      return
    }

    externalRequests.push(url.toString())
    await route.abort("blockedbyclient")
  })

  await page.addInitScript(
    ({
      description,
      initialDraft,
      descriptionUpdateDelayMs,
      descriptionUpdateFailures,
      initialComments,
      viewer,
      mentionResults,
      referenceCards,
      uploadAsset,
      uploadDelayMs,
      uploadFailures,
    }) => {
      type MockIssue = {
        id: string
        identifier: string
        title: string
        description: string
        url: string
        number: number
        priority: number
        priorityLabel: string
        labelIds: string[]
        branchName: string
        stateId: string
        teamId: string
        createdAt: Date
        updatedAt: Date
        reactions: unknown[]
        [key: string]: unknown
      }

      type MockWindow = typeof window & {
        __linearE2E: HarnessState
        acquireVsCodeApi: () => {
          postMessage: (message: IpcRequest) => void
          getState: () => Record<string, unknown>
          setState: (state: Record<string, unknown>) => void
        }
      }

      const mockWindow = window as MockWindow
      const now = new Date("2026-01-01T00:00:00.000Z")
      let draft = initialDraft
      let remainingDescriptionUpdateFailures = descriptionUpdateFailures
      let remainingUploadFailures = uploadFailures
      let comments = initialComments.map((comment) => ({ ...comment, reactions: [] }))
      let createdCommentCount = 0
      let issue: MockIssue = {
        id: "issue-e2e",
        identifier: "E2E-1",
        title: "Paragraph lifecycle",
        description,
        url: "https://example.com/issues/E2E-1",
        number: 1,
        priority: 0,
        priorityLabel: "No priority",
        labelIds: [],
        branchName: "e2e-1-paragraph-lifecycle",
        stateId: "state-e2e",
        teamId: "team-e2e",
        createdAt: now,
        updatedAt: now,
        reactions: [],
      }
      const requests: IpcRequest[] = []
      const unexpectedMessages: string[] = []

      mockWindow.__linearE2E = { requests, unexpectedMessages }

      function send(message: IpcRequest, payload: unknown, error?: string) {
        queueMicrotask(() => {
          window.dispatchEvent(
            new MessageEvent("message", {
              data: error
                ? {
                    type: `${message.type}_error`,
                    error,
                    _ipcReqId: message._ipcReqId,
                  }
                : {
                    type: `${message.type}_response`,
                    payload,
                    _ipcReqId: message._ipcReqId,
                  },
            }),
          )
        })
      }

      function responseFor(message: IpcRequest): unknown {
        switch (message.type) {
          case "props":
            return {
              issueId: issue.id,
              connection: {
                id: "workspace-e2e",
                name: "E2E Workspace",
                urlKey: "e2e",
                userId: "user-e2e",
                userName: "E2E User",
              },
            }
          case "getIssue":
            return issue
          case "getViewer":
            return viewer
          case "getTeam":
            return {
              id: issue.teamId,
              name: "E2E Team",
              key: "E2E",
              issueEstimationType: "notUsed",
            }
          case "getTeamMetadata":
            return { labels: [], cycles: [], workflowStates: [], projects: [] }
          case "getProjectLabels":
          case "getWorkspaceLabels":
          case "getPriorities":
          case "getSubIssues":
          case "getAttachments":
          case "getAllBranches":
            return []
          case "getWorkspaceUsers":
            return viewer ? [viewer] : []
          case "getComments":
            return comments
          case "getIssueHistory":
            return { nodes: [] }
          case "getIssueDescriptionDraft":
            return draft
          case "setIssueDescriptionDraft":
            draft = typeof message.value === "string" ? message.value : undefined
            return undefined
          case "getState":
            return { key: message.key, value: {} }
          case "setState":
            return undefined
          case "getGitStatus":
            return { repoActive: false, apiActive: false }
          case "getCurrentBranch":
            return null
          case "hasUncommittedChanges":
            return false
          case "getGitProviderStatus":
            return { connected: false, remoteMatchesProvider: false }
          case "openExternalUrl":
            return undefined
          case "openIssue":
            return undefined
          case "searchEditorMentions":
            return mentionResults
          case "resolveEditorReference":
            return referenceCards[`${message.kind}:${message.id}`] ?? null
          case "downloadLinearAsset":
            if (!uploadAsset || message.url !== uploadAsset.url) {
              throw new Error("No matching E2E download asset configured")
            }
            return { base64: uploadAsset.bodyBase64, mimeType: uploadAsset.contentType }
          case "uploadLinearFile":
            if (!uploadAsset) throw new Error("No E2E upload asset configured")
            if (remainingUploadFailures > 0) {
              remainingUploadFailures -= 1
              throw new Error("E2E upload failure")
            }
            return { assetUrl: uploadAsset.url }
          case "cancelLinearFileUpload":
            return { cancelled: true }
          case "createComment": {
            if (message.issueId !== issue.id || typeof message.body !== "string") {
              throw new Error("Invalid comment creation")
            }
            createdCommentCount += 1
            comments.push({
              id: `comment-e2e-created-${createdCommentCount}`,
              body: message.body,
              userId: viewer?.id,
              parentId: typeof message.parentId === "string" ? message.parentId : null,
              createdAt: now.toISOString(),
              updatedAt: now.toISOString(),
              reactions: [],
            })
            return undefined
          }
          case "updateComment": {
            if (typeof message.commentId !== "string" || typeof message.body !== "string") {
              throw new Error("Invalid comment update")
            }
            const comment = comments.find(({ id }) => id === message.commentId)
            if (!comment) throw new Error("Unknown comment")
            comment.body = message.body
            comment.updatedAt = new Date(now.getTime() + 1_000).toISOString()
            return undefined
          }
          case "deleteComment":
            if (typeof message.commentId !== "string") throw new Error("Invalid comment deletion")
            comments = comments.filter(({ id }) => id !== message.commentId)
            return undefined
          case "createSubIssue":
            if (
              message.parentId !== issue.id ||
              message.teamId !== issue.teamId ||
              typeof message.fields !== "object"
            ) {
              throw new Error("Invalid sub-issue creation")
            }
            return undefined
          case "linearUpdateIssue": {
            if (message.issueId !== issue.id || typeof message.fields !== "object") {
              throw new Error("Invalid issue update")
            }
            if (
              remainingDescriptionUpdateFailures > 0 &&
              typeof (message.fields as Record<string, unknown>).description === "string"
            ) {
              remainingDescriptionUpdateFailures -= 1
              throw new Error("E2E description update failure")
            }
            issue = {
              ...issue,
              ...(message.fields as Record<string, unknown>),
              updatedAt: new Date(),
            }
            return issue
          }
          default:
            throw new Error(`Unhandled E2E IPC message: ${message.type}`)
        }
      }

      mockWindow.acquireVsCodeApi = () => ({
        postMessage(message) {
          requests.push(structuredClone(message))
          const respond = () => {
            try {
              send(message, responseFor(message))
            } catch (error) {
              const text = error instanceof Error ? error.message : String(error)
              if (text !== "E2E description update failure" && text !== "E2E upload failure") {
                unexpectedMessages.push(text)
              }
              send(message, undefined, text)
            }
          }
          const isDescriptionUpdate =
            message.type === "linearUpdateIssue" &&
            typeof message.fields === "object" &&
            message.fields !== null &&
            typeof (message.fields as Record<string, unknown>).description === "string"
          const delay =
            message.type === "uploadLinearFile" && uploadDelayMs
              ? uploadDelayMs
              : isDescriptionUpdate
                ? descriptionUpdateDelayMs
                : undefined
          if (delay) {
            window.setTimeout(respond, delay)
          } else respond()
        },
        getState: () => ({}),
        setState: () => undefined,
      })
    },
    {
      description: options.initialDescription,
      initialDraft: options.initialDraft,
      descriptionUpdateDelayMs: options.descriptionUpdateDelayMs ?? 0,
      descriptionUpdateFailures: options.descriptionUpdateFailures ?? 0,
      initialComments: options.initialComments ?? [],
      viewer: options.viewer ?? null,
      mentionResults: options.mentionResults ?? [],
      referenceCards: options.referenceCards ?? {},
      uploadAsset: options.uploadAsset,
      uploadDelayMs: options.uploadDelayMs,
      uploadFailures: options.uploadFailures ?? 0,
    },
  )

  await page.goto("/e2e/issue.html")
  if (options.expectUnsupported) {
    await expect(page.getByRole("document", { name: "Issue description" })).toBeVisible()
  } else {
    await expect(page.getByRole("textbox", { name: "Issue description" })).toBeVisible()
  }

  return {
    runtimeErrors,
    externalRequests,
    mockedEmbedRequests,
    assertClean: async () => {
      const unexpectedMessages = await page.evaluate(
        () =>
          (window as typeof window & { __linearE2E: HarnessState }).__linearE2E.unexpectedMessages,
      )
      expect(unexpectedMessages).toEqual([])
      expect(externalRequests).toEqual([])
      expect(runtimeErrors).toEqual([])
    },
  }
}

export async function getDescriptionUpdates(page: Page): Promise<DescriptionUpdate[]> {
  return page.evaluate(() => {
    const requests = (window as typeof window & { __linearE2E: HarnessState }).__linearE2E.requests
    return requests.filter(
      (request): request is DescriptionUpdate =>
        request.type === "linearUpdateIssue" &&
        typeof request.fields === "object" &&
        request.fields !== null &&
        typeof (request.fields as Record<string, unknown>).description === "string",
    )
  })
}

export async function getIpcRequests(page: Page, type?: string): Promise<IpcRequest[]> {
  return page.evaluate((requestedType) => {
    const requests = (window as typeof window & { __linearE2E: HarnessState }).__linearE2E.requests
    return requestedType ? requests.filter((request) => request.type === requestedType) : requests
  }, type)
}

export async function waitForDescriptionUpdate(
  page: Page,
  previousCount: number,
): Promise<DescriptionUpdate[]> {
  await expect
    .poll(async () => (await getDescriptionUpdates(page)).length)
    .toBeGreaterThan(previousCount)
  return getDescriptionUpdates(page)
}
