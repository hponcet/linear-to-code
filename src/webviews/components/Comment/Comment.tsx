import { Editor as EditorType } from "@tiptap/core"
import { useRef, useState } from "react"
import { useDialog } from "rsuite"
import { SerializedUser } from "src/types/SerializedLinear"
import { UserAvatar } from "src/webviews/components/UserAvatar/UserAvatar"
import { useIssueContext } from "src/webviews/contexts/IssueContext"
import { Comment as CommentType } from "src/webviews/utils/comments"
import moment from "src/webviews/utils/moment"

import { Button } from "../Button/Button"
import { Editor } from "../Editor/Editor"
import { EmojiPicker } from "../EmojiPicker/EmojiPicker"
import { DeleteIcon } from "../Icons/DeleteIcon"
import { EditIcon } from "../Icons/EditIcon"
import { ReplyIcon } from "../Icons/ReplyIcon"
import { ResolveIcon } from "../Icons/ResolveIcon"

import "./Comment.scss"

type CommentProps = {
  comment: CommentType
  user: SerializedUser | null
  isChildren?: boolean
  isResolved: boolean
  parentCommentId: string
  setExpanded: (expanded: boolean) => void
  startReply?: () => void
}

export function Comment(props: CommentProps) {
  const { comment, user, isChildren, isResolved, parentCommentId, setExpanded, startReply } = props

  const { update, me } = useIssueContext()
  const dialog = useDialog()

  const commentEditorRef = useRef<EditorType | null>(null)

  const [updateValue, setUpdateValue] = useState<string | null>(null)
  const [updateMarkdownValid, setUpdateMarkdownValid] = useState(false)

  async function deleteComment() {
    const shouldDelete = await dialog.confirm("Are you sure you want to delete this comment?", {
      title: "Delete Comment",
      okText: "Delete",
      cancelText: "Cancel",
      severity: "error",
    })
    if (shouldDelete) {
      await update.comments.deleteComment(comment.id)
    }
  }

  return (
    <div className="issueComment">
      <div className="issueCommentHeader">
        <div className="issueCommentAuthor">
          {user ? (
            <>
              <UserAvatar user={user} size={16} />
              <div className="issueCommentAuthorName">{user?.displayName || "Unknown User"}</div>
            </>
          ) : null}
          <div className="issueCommentTimestamp">
            {moment(comment.createdAt).fromNow()}{" "}
            {comment.createdAt.toString() !== comment.updatedAt.toString() ? "(edited)" : ""}
          </div>
          {!!comment.resolver && <div className="issueCommentResolver">Resolution</div>}
        </div>

        <div className="issueCommentActions">
          {startReply && (
            <Button aria-label="Reply" tooltip="Reply" onClick={startReply} appearance="subtle">
              <ReplyIcon />
            </Button>
          )}
          {(!isResolved || !isChildren) && (
            <Button
              tooltip={isResolved ? "Mark thread as unresolved" : "Mark thread as resolved"}
              appearance="subtle"
              onClick={async () => {
                if (isResolved) {
                  await update.comments.unresolveComment(parentCommentId)
                  setExpanded(true)
                } else {
                  await update.comments.resolveComment(parentCommentId, comment.id)
                  setExpanded(false)
                }
              }}
            >
              <ResolveIcon />
            </Button>
          )}
          <EmojiPicker
            onSelect={async (emoji) => {
              await update.reactions.addReaction({
                emoji,
                commentId: comment.id,
              })
            }}
          />
          {me?.id === comment.userId && (
            <>
              <Button
                aria-label="Edit"
                tooltip="Edit"
                appearance="subtle"
                onClick={() => {
                  setUpdateValue((value) => (value !== null ? null : comment.body))
                  setTimeout(() => {
                    commentEditorRef.current?.commands.focus("end")
                  }, 300)
                }}
              >
                <EditIcon />
              </Button>
              <Button
                aria-label="Delete"
                tooltip="Delete"
                onClick={deleteComment}
                appearance="subtle"
              >
                <DeleteIcon />
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="issueCommentContent" is-children={String(!!isChildren)}>
        <div
          className="issueCommentEditor"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !event.defaultPrevented) setUpdateValue(null)
          }}
        >
          <Editor
            key={typeof updateValue === "string" ? "editing" : comment.body}
            value={updateValue ?? comment.body}
            editable={typeof updateValue === "string"}
            ariaLabel={
              typeof updateValue === "string"
                ? "Edit comment"
                : `Comment by ${user?.displayName || "Unknown user"}`
            }
            onChange={setUpdateValue}
            onValidityChange={setUpdateMarkdownValid}
            getEditor={(editor) => (commentEditorRef.current = editor)}
          />
        </div>
        {typeof updateValue === "string" ? (
          <div className="issueCommentUpdateActions">
            <Button
              onClick={() => setUpdateValue(null)}
              className="issueCommentUpdateButton-cancel"
              appearance="subtle"
            >
              Cancel
            </Button>
            <Button
              disabled={!updateMarkdownValid || !updateValue.trim() || updateValue === comment.body}
              onClick={async () => {
                if (!updateMarkdownValid || !updateValue.trim()) return

                await update.comments.updateComment(comment.id, updateValue)
                setUpdateValue(null)
              }}
              className="issueCommentUpdateButton"
            >
              Save
            </Button>
          </div>
        ) : comment.reactions?.length ? (
          <EmojiPicker
            reactions={comment.reactions}
            onSelect={async (emoji) => {
              await update.reactions.addReaction({
                emoji,
                commentId: comment.id,
              })
            }}
            onUnselect={(id) => update.reactions.removeReaction(id)}
          />
        ) : null}
      </div>
    </div>
  )
}
