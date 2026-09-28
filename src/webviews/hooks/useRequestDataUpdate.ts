import { useEffect, useMemo } from "react"
import {
  CreateReactionInput,
  IssueHistoryRequest,
  IssueUpdateFields,
  LinearFileUploadRequest,
} from "src/linear/LinearService"
import { GlobalListenerMessage, Ipc, IpcType, VsCodeApi } from "src/types/ActionMessage"
import { Ref } from "src/types/GitAPI"
import { IssueSyncPayload } from "src/types/IssueSync"
import { SerializedIssue } from "src/types/SerializedLinear"

import { notifyLinearApiError } from "../api/linearApiErrors"

type LinearApiRequestOptions = {
  /** When true, never show a toast for this request. */
  silentError?: boolean
  /** When true, show a toast even for background read requests. */
  notifyError?: boolean
}

const MUTATION_OPERATIONS = new Set<IpcType<"req">>([
  "linearUpdateIssue",
  "createComment",
  "updateComment",
  "deleteComment",
  "commentResolve",
  "commentUnresolve",
  "createReaction",
  "deleteReaction",
  "createAttachment",
  "deleteAttachment",
  "createSubIssue",
  "deleteSubIssue",
  "uploadLinearFile",
])

const LINEAR_API_OPERATIONS = new Set<IpcType<"req">>([
  "getIssue",
  "getViewer",
  "getTeam",
  "getTeamMetadata",
  "getProjectLabels",
  "getWorkspaceLabels",
  "getWorkspaceUsers",
  "getPriorities",
  "getComments",
  "getSubIssues",
  "getAttachments",
  "getIssueHistory",
  "searchEditorMentions",
  "cancelLinearFileUpload",
  ...MUTATION_OPERATIONS,
])

function isLinearApiOperation(type: IpcType<"req">): boolean {
  return LINEAR_API_OPERATIONS.has(type)
}

// @ts-expect-error no-undef
const acquireVsCodeApi = (window.acquireVsCodeApi ||
  (() => ({
    postMessage: () => undefined,
  }))) as () => VsCodeApi

const VsCodeApi = acquireVsCodeApi()

const vscApi = {
  postMessage<T extends IpcType<"req">>(
    msg: { type: T } & Ipc<"req", T>,
    options?: LinearApiRequestOptions,
  ): Promise<Ipc<"res", T>["payload"]> {
    const _ipcReqId = Math.random().toString(36).substring(2, 15)
    VsCodeApi.postMessage({ ...msg, _ipcReqId })
    return new Promise((resolve, reject) => {
      let settled = false

      function reportError(error: unknown) {
        if (!isLinearApiOperation(msg.type)) {
          return
        }

        const silentByDefault = !MUTATION_OPERATIONS.has(msg.type)
        const shouldNotify = options?.notifyError ?? !silentByDefault

        notifyLinearApiError(
          error,
          { operation: msg.type },
          { silent: options?.silentError || !shouldNotify },
        )
      }

      function handleMessage(e: MessageEvent<Ipc<"res", T> | Ipc<"err", T>>) {
        if (settled) {
          return
        }

        const { type } = e.data

        if (type === `${msg.type}_response` && e.data._ipcReqId === _ipcReqId) {
          settled = true
          if (timeout) clearTimeout(timeout)
          window.removeEventListener("message", handleMessage)
          resolve((e.data as unknown as Ipc<"res", T>).payload)
        }

        if (type === `${msg.type}_error` && e.data._ipcReqId === _ipcReqId) {
          settled = true
          if (timeout) clearTimeout(timeout)
          window.removeEventListener("message", handleMessage)
          const error = new Error((e.data as unknown as Ipc<"err", T>).error)
          reportError(error)
          reject(error)
        }
      }

      const timeout =
        msg.type === "uploadLinearFile" || msg.type === "selectNavigation"
          ? undefined
          : window.setTimeout(() => {
              if (settled) {
                return
              }
              settled = true
              window.removeEventListener("message", handleMessage)
              const error = new Error("Timeout waiting for response")
              reportError(error)
              reject(error)
            }, 30000)

      window.addEventListener("message", handleMessage)
    })
  },
}

type RequestDataUpdateParams = {
  updateIssue?: (updatedAt?: number) => void
}

export function useRequestDataUpdate(params?: Partial<RequestDataUpdateParams>) {
  const { updateIssue } = params || {}

  function handleGlobalMessages(e: MessageEvent<GlobalListenerMessage>) {
    const msg = e.data
    if (msg.action === "updateIssue") updateIssue?.(msg.payload)
  }

  useEffect(() => {
    if (!updateIssue) return

    window.addEventListener("message", handleGlobalMessages)
    return () => {
      window.removeEventListener("message", handleGlobalMessages)
    }
  }, [!!updateIssue])

  return useMemo(
    () => ({
      closePanel: async () => vscApi.postMessage({ type: "closePanel" }),
      openExternal: (issueIdentifier?: SerializedIssue["identifier"]) =>
        vscApi.postMessage<"openExternal">({
          type: "openExternal",
          issueIdentifier,
        }),
      openExternalUrl: (url: string) => vscApi.postMessage({ type: "openExternalUrl", url }),
      updateIssue: (issueId: SerializedIssue["id"]) =>
        vscApi.postMessage({ type: "updateIssue", issueId }),
      syncIssue: (payload: IssueSyncPayload) => vscApi.postMessage({ type: "syncIssue", payload }),
      getIssue: (issueId: SerializedIssue["id"], options?: { bypassCache?: boolean }) =>
        vscApi.postMessage({ type: "getIssue", issueId, bypassCache: options?.bypassCache }),
      getViewer: () => vscApi.postMessage({ type: "getViewer" }),
      getTeam: (teamId: string) => vscApi.postMessage({ type: "getTeam", teamId }),
      getTeamMetadata: (teamId: string) => vscApi.postMessage({ type: "getTeamMetadata", teamId }),
      getProjectLabels: (projectId: string) =>
        vscApi.postMessage({ type: "getProjectLabels", projectId }),
      getWorkspaceLabels: () => vscApi.postMessage({ type: "getWorkspaceLabels" }),
      getWorkspaceUsers: () => vscApi.postMessage({ type: "getWorkspaceUsers" }),
      getPriorities: () => vscApi.postMessage({ type: "getPriorities" }),
      getComments: (issueId: SerializedIssue["id"]) =>
        vscApi.postMessage({ type: "getComments", issueId }),
      getSubIssues: (issueId: SerializedIssue["id"]) =>
        vscApi.postMessage({ type: "getSubIssues", issueId }),
      getAttachments: (issueId: SerializedIssue["id"], options?: { bypassCache?: boolean }) =>
        vscApi.postMessage({ type: "getAttachments", issueId, bypassCache: options?.bypassCache }),
      getIssueHistory: (request: IssueHistoryRequest) =>
        vscApi.postMessage({ type: "getIssueHistory", ...request }),
      searchEditorMentions: (query: string) =>
        vscApi.postMessage({ type: "searchEditorMentions", query }),
      uploadLinearFile: (request: LinearFileUploadRequest) =>
        vscApi.postMessage({ type: "uploadLinearFile", ...request }),
      cancelLinearFileUpload: (uploadId: string) =>
        vscApi.postMessage({ type: "cancelLinearFileUpload", uploadId }),
      linearUpdateIssue: (issueId: SerializedIssue["id"], fields: IssueUpdateFields) =>
        vscApi.postMessage({ type: "linearUpdateIssue", issueId, fields }),
      createComment: (input: { issueId: string; body: string; parentId?: string }) =>
        vscApi.postMessage({ type: "createComment", ...input }),
      updateComment: (commentId: string, body: string) =>
        vscApi.postMessage({ type: "updateComment", commentId, body }),
      deleteComment: (commentId: string) =>
        vscApi.postMessage({ type: "deleteComment", commentId }),
      commentResolve: (commentId: string, resolvingCommentId?: string) =>
        vscApi.postMessage({ type: "commentResolve", commentId, resolvingCommentId }),
      commentUnresolve: (commentId: string) =>
        vscApi.postMessage({ type: "commentUnresolve", commentId }),
      createReaction: (reaction: CreateReactionInput) =>
        vscApi.postMessage({ type: "createReaction", ...reaction }),
      deleteReaction: (reactionId: string, issueId?: SerializedIssue["id"]) =>
        vscApi.postMessage({ type: "deleteReaction", reactionId, issueId }),
      deleteAttachment: (attachmentId: string, issueId?: SerializedIssue["id"]) =>
        vscApi.postMessage({ type: "deleteAttachment", attachmentId, issueId }),
      createAttachment: (input: {
        issueId: string
        url: string
        title: string
        iconUrl?: string
      }) => vscApi.postMessage({ type: "createAttachment", ...input }),
      createSubIssue: (
        parentId: SerializedIssue["id"],
        teamId: string,
        fields: IssueUpdateFields,
      ) => vscApi.postMessage({ type: "createSubIssue", parentId, teamId, fields }),
      deleteSubIssue: (issueId: SerializedIssue["id"]) =>
        vscApi.postMessage({ type: "deleteSubIssue", issueId }),
      openIssue: (issueId: SerializedIssue["id"]) =>
        vscApi.postMessage({ type: "openIssue", issueId }),
      startWork: (issueId: SerializedIssue["id"]) =>
        vscApi.postMessage({ type: "startWork", issueId }),
      openSettings: (options?: { tab?: "git" | "workflow" | "agent" }) =>
        vscApi.postMessage({ type: "openSettings", ...options }),
      launchCursorAgent: (issueId: SerializedIssue["id"]) =>
        vscApi.postMessage({ type: "launchCursorAgent", issueId }),
      getGitStatus: () => vscApi.postMessage({ type: "getGitStatus", key: "gitStatus" }),
      getAllBranches: () => vscApi.postMessage({ type: "getAllBranches" }),
      getCurrentBranch: () => vscApi.postMessage({ type: "getCurrentBranch" }),
      createBranch: (branchName: string, from: Ref, stashChanges?: boolean) =>
        vscApi.postMessage({ type: "createBranch", branchName, from, stashChanges }),
      hasUncommittedChanges: () => vscApi.postMessage({ type: "hasUncommittedChanges" }),
      checkout: (branch: Ref, stashChanges?: boolean) =>
        vscApi.postMessage({ type: "checkout", branch, stashChanges }),
    }),
    [],
  )
}

export function useLinearApi(params?: Partial<RequestDataUpdateParams>) {
  return useRequestDataUpdate(params)
}

export { vscApi }
export { registerLinearApiErrorHandler } from "../api/linearApiErrors"
