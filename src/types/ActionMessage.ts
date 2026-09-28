import { IssuePriorityValue } from "@linear/sdk"
import {
  CreateReactionInput,
  IssueHistoryPage,
  IssueHistoryRequest,
  IssueUpdateFields,
  LinearAssetDownloadResult,
  LinearEditorMention,
  LinearFileUploadRequest,
  LinearFileUploadResult,
  LinearReferenceCard,
  LinearReferenceKind,
} from "src/linear/LinearService"
import {
  SerializedAttachment,
  SerializedComment,
  SerializedIssue,
  SerializedIssueLabel,
  SerializedTeam,
  SerializedTeamMetadata,
  SerializedUser,
} from "src/types/SerializedLinear"
import { VscStateKeys } from "src/vscStates"

import { Branch, Ref } from "./GitAPI"
import { IssueSyncPayload } from "./IssueSync"

import {
  BitbucketAuthMethod,
  GitProviderId,
  GitProviderOAuthSetup,
  GitProviderStatus,
  OpenPullRequestResult,
  PullRequestStatus,
} from "../gitProviders/types"

import type { NavigationSelector, NavigationSnapshot } from "./Navigation"
import type { LinearWorkspace } from "src/linear/LinearWorkspaces"

export type Props = {
  issue: {
    issueId: SerializedIssue["id"] | null
    connection: LinearWorkspace | undefined
  }
  startWork: {
    issueId: SerializedIssue["id"] | null
    connection: LinearWorkspace | undefined
    fromCheckout: boolean
    repoInitialized: boolean
    gitInitialized: boolean
    isCursor: boolean
  }
  settings: {
    issueId: SerializedIssue["id"] | null
    connection: LinearWorkspace | undefined
    initialTab?: "git" | "workflow" | "agent"
    tabRequestId?: number
  }
}

export type Request<
  T extends Ipc<"req">["type"],
  R extends Record<string, any> | void = void,
> = R extends void ? { type: T; _ipcReqId?: string } : { type: T; _ipcReqId?: string } & R

export type Response<T extends Ipc<"req">["type"], R = void> = {
  type: `${T}_response`
  _ipcReqId?: string
  payload: R extends void ? void : R
}

export type ResponseError<T extends Ipc<"req">["type"]> = {
  type: `${T}_error`
  _ipcReqId?: string
  error: string
}

export type Action<
  T extends Ipc<"req">["type"],
  Req extends Record<string, any> | void = void,
  Res extends any | void = void,
> = {
  type: T
  req: Request<T, Req>
  res: Response<T, Res>
  err: ResponseError<T>
}

export type Listener<Type extends string, Payload> = {
  action: Type
  payload: Payload
}

export type Message<K extends keyof Props = any> =
  | Action<"props", void, Props[K]>
  | Action<"getNavigation", void, NavigationSnapshot>
  | Action<"selectNavigation", { selector: NavigationSelector }>
  | Action<"clearNavigationFilter", { id: string }>
  | Action<"closePanel">
  | Action<"openExternal", { issueIdentifier?: SerializedIssue["identifier"] }>
  | Action<"openExternalUrl", { url: string }>
  | Action<"downloadLinearAsset", { url: string }, LinearAssetDownloadResult>
  | Action<"uploadLinearFile", LinearFileUploadRequest, LinearFileUploadResult>
  | Action<"cancelLinearFileUpload", { uploadId: string }, { cancelled: boolean }>
  | Action<"searchEditorMentions", { query: string }, LinearEditorMention[]>
  | Action<
      "resolveEditorReference",
      { kind: LinearReferenceKind; id: string },
      LinearReferenceCard | null
    >
  | Action<"updateIssue", { issueId: SerializedIssue["id"] }>
  | Action<"syncIssue", { payload: IssueSyncPayload }>
  | Action<"getIssue", { issueId: SerializedIssue["id"]; bypassCache?: boolean }, SerializedIssue>
  | Action<"getViewer", void, SerializedUser>
  | Action<"getTeam", { teamId: string }, SerializedTeam>
  | Action<"getTeamMetadata", { teamId: string }, SerializedTeamMetadata>
  | Action<"getProjectLabels", { projectId: string }, SerializedIssueLabel[]>
  | Action<"getWorkspaceLabels", void, SerializedIssueLabel[]>
  | Action<"getWorkspaceUsers", void, SerializedUser[]>
  | Action<"getPriorities", void, IssuePriorityValue[]>
  | Action<"getComments", { issueId: SerializedIssue["id"] }, SerializedComment[]>
  | Action<"getSubIssues", { issueId: SerializedIssue["id"] }, SerializedIssue[]>
  | Action<
      "getAttachments",
      { issueId: SerializedIssue["id"]; bypassCache?: boolean },
      SerializedAttachment[]
    >
  | Action<"getIssueHistory", IssueHistoryRequest, IssueHistoryPage>
  | Action<
      "linearUpdateIssue",
      { issueId: SerializedIssue["id"]; fields: IssueUpdateFields },
      SerializedIssue
    >
  | Action<"createComment", { issueId: string; body: string; parentId?: string }>
  | Action<"updateComment", { commentId: string; body: string }>
  | Action<"deleteComment", { commentId: string }>
  | Action<"commentResolve", { commentId: string; resolvingCommentId?: string }>
  | Action<"commentUnresolve", { commentId: string }>
  | Action<"createReaction", CreateReactionInput>
  | Action<"deleteReaction", { reactionId: string; issueId?: SerializedIssue["id"] }>
  | Action<"deleteAttachment", { attachmentId: string; issueId?: SerializedIssue["id"] }>
  | Action<"createAttachment", { issueId: string; url: string; title: string; iconUrl?: string }>
  | Action<
      "createSubIssue",
      { parentId: SerializedIssue["id"]; teamId: string; fields: IssueUpdateFields },
      SerializedIssue
    >
  | Action<"deleteSubIssue", { issueId: SerializedIssue["id"] }>
  | Action<"openIssue", { issueId: SerializedIssue["id"] }>
  | Action<"getGitStatus", { key: string }, { repoActive: boolean; apiActive: boolean }>
  | Action<"getAllBranches", void, Branch[]>
  | Action<"getCurrentBranch", void, Ref | null>
  | Action<"createBranch", { branchName: string; from: Ref; stashChanges?: boolean }, Ref>
  | Action<"startWork", { issueId: SerializedIssue["id"] }>
  | Action<"launchCursorAgent", { issueId: SerializedIssue["id"] }>
  | Action<"openSettings", { tab?: "git" | "workflow" | "agent" }>
  | Action<"hasUncommittedChanges", void, boolean>
  | Action<"checkout", { branch: Ref; stashChanges?: boolean }>
  | Action<"getState", { key: VscStateKeys }, { key: VscStateKeys; value: any }>
  | Action<"setState", { key: VscStateKeys; value: any; timestamp: number }>
  | Action<"getIssueDescriptionDraft", { issueId: string }, string | undefined>
  | Action<"setIssueDescriptionDraft", { issueId: string; value: string | null }>
  | Action<"getGitProviderStatus", void, GitProviderStatus>
  | Action<
      "getGitProviderOAuthSetup",
      { provider: GitProviderId; bitbucketAuthMethod?: BitbucketAuthMethod },
      GitProviderOAuthSetup
    >
  | Action<
      "connectGitProvider",
      { bitbucketApiToken?: string; bitbucketOAuthClientSecret?: string },
      GitProviderStatus
    >
  | Action<"disconnectGitProvider", void, GitProviderStatus>
  | Action<"getPullRequestStatus", { sourceBranch: string }, PullRequestStatus>
  | Action<
      "openPullRequest",
      { issueId: SerializedIssue["id"]; sourceBranch: string },
      OpenPullRequestResult
    >

export type GlobalListenerMessage =
  | Listener<"updateIssue", number | undefined>
  | Listener<"stateUpdate", { value: any; timestamp: number; key: string }>
  | Listener<"gitActive", { repoActive: boolean; apiActive: boolean }>
  | Listener<
      "settingsPropsUpdate",
      {
        issueId: SerializedIssue["id"] | null
        connection: LinearWorkspace | undefined
        initialTab?: "git" | "workflow" | "agent"
        tabRequestId?: number
      }
    >

export type Ipc<
  K extends "req" | "res" | "err",
  T extends Message["type"] = Message["type"],
> = Extract<Message, { type: T }>[K]

export type IpcType<R extends "req" | "res" | "err"> = Ipc<R>["type"]
export type IpcResponse<T extends Ipc<"req">["type"]> = Ipc<"res", T>
export type IpcError<T extends Ipc<"req">["type"]> = Ipc<"err", T>

export type VsCodeApi = {
  postMessage(message: Ipc<"req">): void
  setState(state: Record<string, any>): void
  getState(): Record<string, any>
}
