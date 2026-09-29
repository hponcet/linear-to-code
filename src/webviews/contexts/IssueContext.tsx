import { IssuePriorityValue, LinearClient } from "@linear/sdk"
import { createContext, ReactNode, useContext, useMemo, useState } from "react"
import {
  SerializedAttachment,
  SerializedCycle,
  SerializedIssue,
  SerializedIssueLabel,
  SerializedProject,
  SerializedTeam,
  SerializedUser,
  SerializedWorkflowState,
} from "src/types/SerializedLinear"

import { Container } from "../components/Container/Container"
import { useAsyncEffect } from "../hooks/useAsyncEffect"
import { useAsyncMemo } from "../hooks/useAsyncMemo"
import { useIssueHistory } from "../hooks/useIssueHistory"
import { useIssuePickerLabels } from "../hooks/useIssuePickerLabels"
import { useLinearApi, vscApi } from "../hooks/useRequestDataUpdate"
import { Comment, applyThreadResolvedState, orderComments } from "../utils/comments"
import { History } from "../utils/history"
import {
  createEstimateDataItems,
  EstimateDataItem,
  issueEstimationByType,
} from "../utils/issueEstimateByType"

import type { LinearWorkspace } from "src/linear/LinearWorkspaces"

// The Markdown engine comes with the editor chunk, so pages without an editor never load it.
async function getCanonicalLinearMarkdown(source: string): Promise<string | undefined> {
  const linearMarkdown = await import("../components/Editor/linearMarkdown")
  return linearMarkdown.getCanonicalLinearMarkdown(source)
}

function normalizeAttachmentUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) {
    throw new Error("URL is required")
  }

  try {
    return new URL(trimmed).toString()
  } catch {
    return new URL(`https://${trimmed}`).toString()
  }
}

function getAttachmentTitle(url: string, title?: string): string {
  const trimmedTitle = title?.trim()
  if (trimmedTitle) {
    return trimmedTitle
  }

  return new URL(normalizeAttachmentUrl(url)).hostname
}

type IssueContextProviderProps = {
  issueId: string
  connection: LinearWorkspace
  isLoading?: boolean
  children: ReactNode
}

export type IssueContextValueData = {
  me: SerializedUser | null
  meLoading: boolean
  issue: SerializedIssue
  connection: LinearWorkspace
  update: {
    issue: (
      issueId: string,
      issue: Parameters<LinearClient["updateIssue"]>[1],
    ) => Promise<SerializedIssue | undefined>
    comments: {
      addComment: (body: string) => Promise<void>
      updateComment: (commentId: string, body: string) => Promise<void>
      deleteComment: (commentId: string) => Promise<void>
      sendCommentReply: (commentId: string, body: string) => Promise<void>
      resolveComment: (commentId: string, parentCommentId?: string) => Promise<void>
      unresolveComment: (commentId: string) => Promise<void>
    }
    reactions: {
      addReaction: (reaction: Parameters<LinearClient["createReaction"]>[0]) => Promise<void>
      removeReaction: (id: string) => Promise<void>
    }
    panelActions: ReturnType<typeof useLinearApi>
    attachments: {
      delete: (attachmentId: string) => Promise<void>
      create: (issueId: string, url: string, title?: string) => Promise<void>
      update: (attachmentId: string, issueId: string, url: string, title?: string) => Promise<void>
    }
    subIssues: {
      createSubIssue: (
        parentId: SerializedIssue["id"],
        fields: Parameters<LinearClient["updateIssue"]>[1],
      ) => Promise<void>
      deleteSubIssue: (issueId: SerializedIssue["id"]) => Promise<void>
    }
  }
  team: SerializedTeam | null
  priorities: IssuePriorityValue[]
  prioritiesLoading: boolean
  issueLabels: SerializedIssueLabel[]
  issueLabelsLoading: boolean
  branchPrefixLabels: SerializedIssueLabel[]
  projects: SerializedProject[]
  projectsLoading: boolean
  cycles: SerializedCycle[]
  cyclesLoading: boolean
  workflowStates: SerializedWorkflowState[]
  workflowStatesLoading: boolean
  users: SerializedUser[]
  usersLoading: boolean
  issueEstimations: EstimateDataItem[] | null
  issueEstimationsLoading: boolean
  comments: Comment[] | null
  commentsLoading: boolean
  history: History[] | null
  historyLoading: boolean
  subIssues: SerializedIssue[] | null
  subIssuesLoading: boolean
  attachments: SerializedAttachment[] | null
  attachmentsLoading: boolean
}

const IssueContextReact = createContext<IssueContextValueData>({
  me: null,
  meLoading: false,
  issue: {} as SerializedIssue,
  connection: { id: "", name: "", urlKey: "", userId: "", userName: "" },
  team: null,
  update: {
    issue: async () => Promise.reject(),
    comments: {
      addComment: async () => Promise.reject(),
      deleteComment: async () => Promise.reject(),
      updateComment: async () => Promise.reject(),
      sendCommentReply: async () => Promise.reject(),
      resolveComment: async () => Promise.reject(),
      unresolveComment: async () => Promise.reject(),
    },
    reactions: {
      addReaction: async () => Promise.reject(),
      removeReaction: async () => Promise.reject(),
    },
    panelActions: {
      closePanel: () => Promise.reject(),
      openExternal: () => Promise.reject(),
      openExternalUrl: () => Promise.reject(),
      updateIssue: () => Promise.reject(),
      syncIssue: () => Promise.reject(),
      getTeamMetadata: () => Promise.reject(),
      getProjectLabels: () => Promise.reject(),
      getWorkspaceLabels: () => Promise.reject(),
      getWorkspaceUsers: () => Promise.reject(),
      getPriorities: () => Promise.reject(),
      getIssue: () => Promise.reject(),
      getViewer: () => Promise.reject(),
      getTeam: () => Promise.reject(),
      getComments: () => Promise.reject(),
      getSubIssues: () => Promise.reject(),
      getAttachments: () => Promise.reject(),
      getIssueHistory: () => Promise.reject(),
      searchEditorMentions: () => Promise.reject(),
      uploadLinearFile: () => Promise.reject(),
      cancelLinearFileUpload: () => Promise.reject(),
      linearUpdateIssue: () => Promise.reject(),
      createComment: () => Promise.reject(),
      updateComment: () => Promise.reject(),
      deleteComment: () => Promise.reject(),
      commentResolve: () => Promise.reject(),
      commentUnresolve: () => Promise.reject(),
      createReaction: () => Promise.reject(),
      deleteReaction: () => Promise.reject(),
      deleteAttachment: () => Promise.reject(),
      createAttachment: () => Promise.reject(),
      createSubIssue: () => Promise.reject(),
      deleteSubIssue: () => Promise.reject(),
      openIssue: () => Promise.reject(),
      startWork: () => Promise.reject(),
      openSettings: () => Promise.reject(),
      launchCursorAgent: () => Promise.reject(),
      getGitStatus: () => Promise.reject(),
      getAllBranches: () => Promise.reject(),
      getCurrentBranch: () => Promise.reject(),
      createBranch: () => Promise.reject(),
      hasUncommittedChanges: () => Promise.reject(),
      checkout: () => Promise.reject(),
    },
    attachments: {
      delete: async () => Promise.reject(),
      create: async () => Promise.reject(),
      update: async () => Promise.reject(),
    },
    subIssues: {
      createSubIssue: async () => Promise.reject(),
      deleteSubIssue: async () => Promise.reject(),
    },
  },
  priorities: [],
  prioritiesLoading: false,
  issueLabels: [],
  issueLabelsLoading: false,
  branchPrefixLabels: [],
  projects: [],
  projectsLoading: false,
  cycles: [],
  cyclesLoading: false,
  workflowStates: [],
  workflowStatesLoading: false,
  users: [],
  usersLoading: false,
  issueEstimations: null,
  issueEstimationsLoading: false,
  comments: null,
  commentsLoading: false,
  history: null,
  historyLoading: false,
  subIssues: null,
  subIssuesLoading: false,
  attachments: null,
  attachmentsLoading: false,
})

export function IssueContextProvider(props: IssueContextProviderProps) {
  const { children, issueId, connection, isLoading: externalLoading } = props

  const [issue, setIssue] = useState<SerializedIssue | null>(null)
  const [commentRefetch, setCommentRefetch] = useState(0)
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [commentsLoading, setCommentsLoading] = useState(true)
  const [historyRefetch, setHistoryRefetch] = useState(0)
  const [subIssuesRefetch, setSubIssuesRefetch] = useState(0)
  const [attachmentsRefetch, setIssueResourcesRefetch] = useState(0)
  const [attachments, setAttachments] = useState<SerializedAttachment[] | null>(null)
  const [attachmentsLoading, setAttachmentsLoading] = useState(true)
  const [isLoading, setIsLoading] = useState(true)

  async function fetchIssue(updatedAt?: number, options?: { bypassCache?: boolean }) {
    if (updatedAt && issue && issue.updatedAt.getTime() >= updatedAt) {
      return
    }

    if (issueId) {
      const fetchedIssue = await vscApi.postMessage({
        type: "getIssue",
        issueId,
        bypassCache: options?.bypassCache,
      })
      setIssue((fetchedIssue as SerializedIssue) || null)
    }
  }

  const panelActions = useLinearApi({
    updateIssue: fetchIssue,
  })

  const [me, meLoading] = useAsyncMemo(async () => {
    return (await panelActions.getViewer()) || null
  }, [issueId])

  useAsyncEffect(async () => {
    if (!issue) {
      setComments([])
      setCommentsLoading(false)
      return
    }

    setCommentsLoading(true)
    try {
      const fetchedComments = await panelActions.getComments(issue.id)
      setComments(orderComments(fetchedComments || []))
    } catch (error) {
      console.error("Failed to load comments:", error)
    } finally {
      setCommentsLoading(false)
    }
  }, [issue?.id, commentRefetch])

  async function refetchAttachments(options?: { bypassCache?: boolean; silent?: boolean }) {
    if (!issue) {
      setAttachments([])
      setAttachmentsLoading(false)
      return
    }

    if (!options?.silent) {
      setAttachmentsLoading(true)
    }

    try {
      const fetchedAttachments = await panelActions.getAttachments(issue.id, options)
      setAttachments(fetchedAttachments || [])
    } catch (error) {
      console.error("Failed to load attachments:", error)
    } finally {
      setAttachmentsLoading(false)
    }
  }

  useAsyncEffect(async () => {
    await refetchAttachments({ bypassCache: attachmentsRefetch > 0 })
  }, [issue?.id, attachmentsRefetch])

  useAsyncEffect(async () => {
    setIsLoading(true)
    try {
      await fetchIssue()
    } catch (error) {
      console.error("Failed to load issue:", error)
    } finally {
      setIsLoading(false)
    }
  }, [issueId])

  async function updateIssue(
    id: string,
    updatedFields: Parameters<LinearClient["updateIssue"]>[1],
  ): Promise<SerializedIssue | undefined> {
    const fields = { ...updatedFields }
    if (typeof fields.description === "string") {
      const description = await getCanonicalLinearMarkdown(fields.description)
      if (description === undefined) return undefined
      fields.description = description
    }

    try {
      const updatedIssue = (await panelActions.linearUpdateIssue(
        id,
        fields,
      )) as SerializedIssue | void

      if (updatedIssue) {
        if (id === issueId) {
          setIssue((current) =>
            !current || updatedIssue.updatedAt >= current.updatedAt ? updatedIssue : current,
          )
        } else {
          setSubIssuesRefetch((r) => r + 1)
          setIssueResourcesRefetch((r) => r + 1)
        }
      }

      return updatedIssue || undefined
    } catch (error) {
      console.error("Failed to update issue:", error)
      return undefined
    }
  }

  async function addComment(body: string) {
    const markdown = await getCanonicalLinearMarkdown(body)
    if (markdown === undefined) throw new Error("Refusing to save unsupported Linear Markdown")
    await panelActions.createComment({
      issueId: issueId,
      body: markdown,
    })
    setCommentRefetch((r) => r + 1)
  }

  async function updateComment(commentId: string, body: string) {
    const markdown = await getCanonicalLinearMarkdown(body)
    if (markdown === undefined) throw new Error("Refusing to save unsupported Linear Markdown")
    await panelActions.updateComment(commentId, markdown)
    setCommentRefetch((r) => r + 1)
  }

  async function deleteComment(commentId: string) {
    await panelActions.deleteComment(commentId)
    setCommentRefetch((r) => r + 1)
  }

  async function sendCommentReply(commentId: string, body: string) {
    const markdown = await getCanonicalLinearMarkdown(body)
    if (markdown === undefined) throw new Error("Refusing to save unsupported Linear Markdown")
    await panelActions.createComment({
      parentId: commentId,
      issueId: issueId,
      body: markdown,
    })
    setCommentRefetch((r) => r + 1)
  }

  async function addReaction(reaction: Parameters<LinearClient["createReaction"]>[0]) {
    if (!reaction.commentId && reaction.issueId && issue && me?.id) {
      setIssue({
        ...issue,
        reactions: [
          ...issue.reactions,
          {
            id: `optimistic-${reaction.emoji}-${Date.now()}`,
            emoji: reaction.emoji,
            userId: me.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      })
    }

    await panelActions.createReaction(reaction)

    if (reaction.commentId) {
      setCommentRefetch((r) => r + 1)
    } else {
      await fetchIssue(undefined, { bypassCache: true })
    }
  }

  async function removeReaction(id: string) {
    const isIssueReaction = issue?.reactions.some((reaction) => reaction.id === id) ?? false

    if (isIssueReaction && issue) {
      setIssue({
        ...issue,
        reactions: issue.reactions.filter((reaction) => reaction.id !== id),
      })
    }

    await panelActions.deleteReaction(id, isIssueReaction ? issueId : undefined)

    if (isIssueReaction) {
      await fetchIssue(undefined, { bypassCache: true })
    } else {
      setCommentRefetch((r) => r + 1)
    }
  }

  async function resolveComment(commentId: string, resolvingCommentId?: string) {
    const resolvedByComment =
      resolvingCommentId && resolvingCommentId !== commentId ? resolvingCommentId : undefined

    setComments((prev) =>
      prev
        ? applyThreadResolvedState(prev, commentId, true, {
            resolvingCommentId: resolvedByComment ?? null,
            resolvingUserId: me?.id ?? null,
          })
        : prev,
    )
    await panelActions.commentResolve(commentId, resolvedByComment)
    setCommentRefetch((r) => r + 1)
  }

  async function unresolveComment(commentId: string) {
    setComments((prev) => (prev ? applyThreadResolvedState(prev, commentId, false) : prev))
    await panelActions.commentUnresolve(commentId)
    setCommentRefetch((r) => r + 1)
  }

  async function deleteAttachment(attachmentId: string) {
    await panelActions.deleteAttachment(attachmentId, issueId)
    await refetchAttachments({ bypassCache: true, silent: true })
    setHistoryRefetch((r) => r + 1)
  }

  async function createAttachment(issueId: string, url: string, title: string) {
    const normalizedUrl = normalizeAttachmentUrl(url)
    const attachmentTitle = getAttachmentTitle(normalizedUrl, title)

    await panelActions.createAttachment({
      issueId,
      url: normalizedUrl,
      title: attachmentTitle,
      iconUrl: `https://favicone.com/${new URL(normalizedUrl).hostname}?s=32`,
    })
    await refetchAttachments({ bypassCache: true, silent: true })
    setHistoryRefetch((r) => r + 1)
  }

  async function updateAttachment(
    attachmentId: string,
    issueId: string,
    url: string,
    title: string,
  ) {
    await panelActions.deleteAttachment(attachmentId, issueId)
    await createAttachment(issueId, url, title)
  }

  async function createSubIssue(
    parentId: SerializedIssue["id"],
    fields: Parameters<LinearClient["updateIssue"]>[1],
  ) {
    const canonicalFields = { ...fields }
    if (typeof canonicalFields.description === "string") {
      const description = await getCanonicalLinearMarkdown(canonicalFields.description)
      if (description === undefined) {
        throw new Error("Refusing to save unsupported Linear Markdown")
      }
      canonicalFields.description = description
    }

    await panelActions.createSubIssue(parentId, issue!.teamId!, canonicalFields)
    setSubIssuesRefetch((r) => r + 1)
  }

  async function deleteSubIssue(issueId: SerializedIssue["id"]) {
    await panelActions.deleteSubIssue(issueId)
    setSubIssuesRefetch((r) => r + 1)
  }

  const [priorities = [], prioritiesLoading] = useAsyncMemo(async () => {
    return panelActions.getPriorities()
  }, [issueId])

  const { teamMetadata, teamMetadataLoading, issueLabels, issueLabelsLoading, branchPrefixLabels } =
    useIssuePickerLabels({
      issue,
      getTeamMetadata: panelActions.getTeamMetadata,
      getProjectLabels: panelActions.getProjectLabels,
    })

  const projects = teamMetadata?.projects ?? []
  const projectsLoading = teamMetadataLoading
  const cycles = teamMetadata?.cycles ?? []
  const cyclesLoading = teamMetadataLoading
  const workflowStates = teamMetadata?.workflowStates ?? []
  const workflowStatesLoading = teamMetadataLoading

  const [loadedTeam, issueEstimationsLoading] = useAsyncMemo(async () => {
    return issue?.teamId ? panelActions.getTeam(issue.teamId) : null
  }, [issueId, issue?.teamId])
  const team = loadedTeam?.id === issue?.teamId ? loadedTeam : null
  const issueEstimations = useMemo(() => {
    if (!team?.issueEstimationType || team.issueEstimationType === "notUsed") {
      return null
    }
    return createEstimateDataItems(team.issueEstimationType as keyof typeof issueEstimationByType)
  }, [team])

  const [users = [], usersLoading] = useAsyncMemo(async () => {
    return panelActions.getWorkspaceUsers()
  }, [issueId])

  const [history, historyLoading] = useIssueHistory({
    issueId: issue?.id,
    getIssueHistory: panelActions.getIssueHistory,
    users,
    historyRefetch,
  })

  const [subIssues, subIssuesLoading] = useAsyncMemo(async () => {
    if (!issue) return []
    return panelActions.getSubIssues(issue.id)
  }, [issue?.id, subIssuesRefetch])

  const context = useMemo(
    (): IssueContextValueData => ({
      me,
      meLoading,
      issue: issue!,
      connection,
      team,
      priorities: priorities || [],
      prioritiesLoading,
      issueLabels: issueLabels || [],
      issueLabelsLoading,
      branchPrefixLabels: branchPrefixLabels || [],
      projects: projects || [],
      projectsLoading,
      cycles: cycles || [],
      cyclesLoading,
      workflowStates: workflowStates || [],
      workflowStatesLoading,
      users: users || [],
      usersLoading,
      issueEstimations,
      issueEstimationsLoading,
      comments,
      commentsLoading,
      history,
      historyLoading,
      subIssues,
      subIssuesLoading,
      attachments,
      attachmentsLoading,
      update: {
        issue: updateIssue,
        comments: {
          addComment,
          updateComment,
          deleteComment,
          sendCommentReply,
          resolveComment,
          unresolveComment,
        },
        reactions: {
          addReaction,
          removeReaction,
        },
        attachments: {
          delete: deleteAttachment,
          create: createAttachment,
          update: updateAttachment,
        },
        subIssues: {
          createSubIssue,
          deleteSubIssue,
        },
        panelActions,
      },
    }),
    [
      me,
      meLoading,
      issue,
      connection,
      team,
      priorities,
      prioritiesLoading,
      issueLabels,
      issueLabelsLoading,
      branchPrefixLabels,
      projects,
      projectsLoading,
      cycles,
      cyclesLoading,
      workflowStates,
      workflowStatesLoading,
      users,
      usersLoading,
      issueEstimations,
      issueEstimationsLoading,
      comments,
      commentsLoading,
      history,
      historyLoading,
      subIssues,
      subIssuesLoading,
      attachments,
      attachmentsLoading,
    ],
  )

  if (!issue || isLoading || externalLoading) {
    return <Container loading={true} />
  }

  return <IssueContextReact.Provider value={context}>{children}</IssueContextReact.Provider>
}

export { IssueContextReact }

export function useIssueContext() {
  return useContext(IssueContextReact)
}
