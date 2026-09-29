"use client"

import BubbleMenuExt from "@tiptap/extension-bubble-menu"
import { Placeholder } from "@tiptap/extensions"
import { Editor as EditorType, EditorContent, EditorContext, useEditor } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { MentionableUser, parseWorkspaceUrlKeyFromIssueUrl } from "src/utils/linearMentions"
import { ImageUploadNode } from "src/webviews/components/Editor/components/tiptap-node/image-upload-node/image-upload-node-extension"
import { BlockquoteButton } from "src/webviews/components/Editor/components/tiptap-ui/blockquote-button"
import { CodeBlockButton } from "src/webviews/components/Editor/components/tiptap-ui/code-block-button"
import { HeadingDropdownMenu } from "src/webviews/components/Editor/components/tiptap-ui/heading-dropdown-menu"
import { LinkPopover } from "src/webviews/components/Editor/components/tiptap-ui/link-popover"
import { ListDropdownMenu } from "src/webviews/components/Editor/components/tiptap-ui/list-dropdown-menu"
import { MarkButton } from "src/webviews/components/Editor/components/tiptap-ui/mark-button"
import { Spacer } from "src/webviews/components/Editor/components/tiptap-ui-primitive/spacer"
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from "src/webviews/components/Editor/components/tiptap-ui-primitive/toolbar"
import { useIssueContext } from "src/webviews/contexts/IssueContext"
import { useEditorThemeClass } from "src/webviews/hooks/useVsCodeTheme"

import {
  createLinearMarkdownExtensions,
  inspectEditorDocument,
  inspectLinearMarkdown,
  trimTableCellWhitespace,
} from "./linearMarkdown"
import { Audio } from "./markdownPlugins/AudioPlugin"
import { LinearCodeBlock } from "./markdownPlugins/CodeBlockPlugin"
import { LinearFileWithNodeView } from "./markdownPlugins/FilePlugin/LinearFileNodeView"
import { getImageDragSelection } from "./markdownPlugins/LinearImage"
import { LinearImageWithNodeView } from "./markdownPlugins/LinearImageNodeView"
import {
  createUserMentionExtension,
  LinearReferenceHoverCard,
  LinearUserHandleDecoration,
} from "./markdownPlugins/MentionPlugin"
import {
  createLinearEditorCommands,
  createSlashCommand,
  LinearEditorCommandMenu,
} from "./markdownPlugins/SlashCommandPlugin/SlashCommand"
import { TableControls } from "./markdownPlugins/TablePlugin/TableControls"
import { Video } from "./markdownPlugins/VideosPlugin/VideoPlugin"
import { setEditorEditable } from "./setEditorEditable"
import { MAX_LINEAR_FILE_SIZE, openFilePicker, uploadFileToLinear } from "./uploadLinearFile"

import { EmojiPicker } from "../EmojiPicker/EmojiPicker"

import type { LinearEditorCommand } from "./markdownPlugins/SlashCommandPlugin/SlashCommand"
import type { JSONContent } from "@tiptap/core"
import type { EditorState } from "@tiptap/pm/state"

import "src/webviews/components/Editor/components/tiptap-node/blockquote-node/blockquote-node.scss"
import "src/webviews/components/Editor/components/tiptap-node/code-block-node/code-block-node.scss"
import "src/webviews/components/Editor/components/tiptap-node/heading-node/heading-node.scss"
import "src/webviews/components/Editor/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss"
import "src/webviews/components/Editor/components/tiptap-node/image-node/image-node.scss"
import "src/webviews/components/Editor/components/tiptap-node/list-node/list-node.scss"
import "src/webviews/components/Editor/components/tiptap-node/paragraph-node/paragraph-node.scss"

import "./Editor.scss"
import "./markdownPlugins/CodeBlockPlugin/CodeBlock.scss"
import "./markdownPlugins/DetailsPlugin/Details.scss"
import "./markdownPlugins/MentionPlugin/LinearReference.scss"
import "./markdownPlugins/MentionPlugin/MentionList.scss"
import "./markdownPlugins/SlashCommandPlugin/SlashCommand.scss"

export type EditorProps = {
  value?: string
  editable?: boolean
  ariaLabel: string
  placeholder?: string
  onChange?: (value: string) => void
  onBlur?: () => void
  onValidityChange?: (valid: boolean) => void
  getEditor?: (editor: EditorType) => void
  className?: string
  style?: React.CSSProperties
}

const BUBBLE_MENU_OPTIONS = { autoPlacement: true, offset: 8, shift: true, flip: true } as const

// Opening a toolbar menu or popover moves focus out of the editor, and Tiptap's default rule
// hides the bubble menu as soon as the editor loses focus. That tore down the very element the
// portalled menu is anchored to, so it fell back to the top-left corner of the webview. Keep the
// bar alive while any editor chrome holds focus.
const shouldShowToolbar = ({ editor, state }: { editor: EditorType; state: EditorState }) => {
  if (!editor.isEditable) return false
  if (document.activeElement?.closest("[data-linear-editor-ui]")) return true
  return editor.view.hasFocus() && !state.selection.empty
}

function hasTemporaryUpload(editor: EditorType): boolean {
  let found = false
  editor.state.doc.descendants((node) => {
    if (node.type.name === "imageUpload") {
      found = true
      return false
    }
    return !found
  })
  return found
}

function documentsMatch(current: JSONContent, document: object): boolean {
  return JSON.stringify(trimTableCellWhitespace(current)) === JSON.stringify(document)
}

function getUploadedFileContent(file: File, assetUrl: string): JSONContent {
  if (file.type.startsWith("image/")) {
    return { type: "image", attrs: { src: assetUrl, alt: file.name } }
  }

  if (file.type.startsWith("video/") && file.type !== "video/ogg") {
    return {
      type: "video",
      attrs: {
        src: assetUrl,
        title: file.name,
        syntax: "linearEmbed",
        uploadState: "finished",
        size: file.size,
        mimetype: file.type,
        controls: true,
        height: null,
        width: null,
      },
    }
  }

  if (file.type.startsWith("audio/") && file.type !== "audio/ogg") {
    return {
      type: "audio",
      attrs: {
        src: assetUrl,
        title: file.name,
        syntax: "linearEmbed",
        uploadState: "finished",
        size: file.size,
        mimetype: file.type,
        controls: true,
      },
    }
  }

  return {
    type: "linearFile",
    attrs: {
      uploadState: "finished",
      href: assetUrl,
      name: file.name,
      size: file.size,
      mimetype: file.type || "application/octet-stream",
    },
  }
}

function UnsupportedMarkdown(props: {
  ariaLabel: string
  className?: string
  style?: React.CSSProperties
  source: string
  message: string
}) {
  const { ariaLabel, className, style, source, message } = props
  const editorThemeClass = useEditorThemeClass()

  return (
    <div className={`simple-editor-wrapper ${editorThemeClass} ${className || ""}`} style={style}>
      <div className="linear-markdown-warning" role="alert">
        This content is read-only to prevent Markdown data loss. {message}
      </div>
      <pre className="linear-markdown-source" role="document" aria-label={ariaLabel}>
        {source}
      </pre>
    </div>
  )
}

export function Editor(props: EditorProps) {
  const source = props.value ?? ""
  const inspection = useMemo(() => inspectLinearMarkdown(source), [source])

  useEffect(() => {
    if (!inspection.ok) props.onValidityChange?.(false)
  }, [inspection, props.onValidityChange])

  if (!inspection.ok) {
    return (
      <UnsupportedMarkdown
        ariaLabel={props.ariaLabel}
        className={props.className}
        style={props.style}
        source={inspection.source}
        message={inspection.diagnostics[0]?.message || "Unsupported Linear Markdown content."}
      />
    )
  }

  // The validating wrapper must run before the component that mounts Tiptap.
  // eslint-disable-next-line no-use-before-define
  return <ValidatedEditor {...props} />
}

function ValidatedEditor(props: EditorProps) {
  const {
    value = "",
    editable = false,
    ariaLabel,
    placeholder,
    onChange,
    onBlur,
    onValidityChange,
    getEditor,
    className,
    style,
  } = props

  const { users, issue, update } = useIssueContext()
  const editorThemeClass = useEditorThemeClass()
  const workspaceUrlKey = parseWorkspaceUrlKeyFromIssueUrl(issue?.url)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const dateInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingDateRef = useRef<{ editor: EditorType; from: number; to: number } | null>(null)
  const pendingFileRef = useRef<{ editor: EditorType; from: number; to: number } | null>(null)
  const pendingExternalRef = useRef<{ value: string; document: object } | null>(null)
  const activeUploadRef = useRef<AbortController | null>(null)
  const editorInstanceRef = useRef<EditorType | null>(null)
  const lastEmittedValueRef = useRef<string | undefined>(undefined)
  const validityRef = useRef<boolean | undefined>(undefined)
  const editableRef = useRef(editable)
  const mentionUsersRef = useRef<MentionableUser[]>(users ?? [])
  const onChangeRef = useRef(onChange)
  const onValidityChangeRef = useRef(onValidityChange)
  const [uploadStatus, setUploadStatus] = useState<
    | { kind: "uploading"; progress: number }
    | {
        kind: "error"
        message: string
        retry?: {
          editor: EditorType
          file: File
          range?: { from: number; to: number }
          document: object
        }
      }
    | null
  >(null)

  useEffect(() => {
    editableRef.current = editable
    onChangeRef.current = onChange
    onValidityChangeRef.current = onValidityChange
  }, [editable, onChange, onValidityChange])

  useEffect(() => {
    mentionUsersRef.current = users ?? []
  }, [users])

  useEffect(() => () => activeUploadRef.current?.abort(), [])

  const reportValidity = useCallback((valid: boolean) => {
    if (validityRef.current === valid) return
    validityRef.current = valid
    onValidityChangeRef.current?.(valid)
  }, [])

  const uploadAndInsertFile = useCallback(
    async (editor: EditorType, file: File, range?: { from: number; to: number }) => {
      if (activeUploadRef.current) {
        setUploadStatus({ kind: "error", message: "Another file upload is already running." })
        return
      }

      const controller = new AbortController()
      activeUploadRef.current = controller
      pendingFileRef.current = null
      setUploadStatus({ kind: "uploading", progress: 0 })
      reportValidity(false)
      setEditorEditable(editor, false)

      try {
        const assetUrl = await uploadFileToLinear(
          file,
          update.panelActions,
          ({ progress }) => setUploadStatus({ kind: "uploading", progress }),
          controller.signal,
        )
        if (editorInstanceRef.current !== editor) return
        setEditorEditable(editor, editableRef.current)
        const chain = editor.chain().focus()
        if (range) chain.deleteRange(range)
        chain.insertContent(getUploadedFileContent(file, assetUrl)).run()
        setUploadStatus(null)
      } catch (error) {
        if (editorInstanceRef.current !== editor) return
        setEditorEditable(editor, editableRef.current)
        reportValidity(true)
        const cancelled = error instanceof DOMException && error.name === "AbortError"
        setUploadStatus({
          kind: "error",
          message: cancelled
            ? "Upload cancelled."
            : error instanceof Error
              ? error.message
              : "Upload failed.",
          retry:
            cancelled || !file.name.trim() || file.size <= 0 || file.size > MAX_LINEAR_FILE_SIZE
              ? undefined
              : { editor, file, range, document: editor.getJSON() },
        })
      } finally {
        if (activeUploadRef.current === controller) activeUploadRef.current = null
      }
    },
    [reportValidity, update.panelActions],
  )

  const mentionExtension = useMemo(
    () =>
      createUserMentionExtension({
        getUsers: () => mentionUsersRef.current,
        getWorkspaceUrlKey: () => workspaceUrlKey,
        searchMentions: update.panelActions.searchEditorMentions,
      }),
    [update.panelActions.searchEditorMentions, workspaceUrlKey],
  )

  const contentExtensions = useMemo(
    () =>
      createLinearMarkdownExtensions({
        audioExtension: Audio,
        fileExtension: LinearFileWithNodeView,
        imageExtension: LinearImageWithNodeView,
        mentionExtension,
        codeBlockExtension: LinearCodeBlock,
        videoExtension: Video,
      }),
    [mentionExtension],
  )

  const requestDate = useCallback(
    (editor: EditorType, range: { from: number; to: number }) => {
      pendingDateRef.current = { editor, ...range }
      reportValidity(false)
      setEditorEditable(editor, false)
      const input = dateInputRef.current
      if (!input) {
        pendingDateRef.current = null
        setEditorEditable(editor, editableRef.current)
        return
      }
      input.value = ""
      input.focus()
      if (typeof input.showPicker === "function") input.showPicker()
      else input.click()
    },
    [reportValidity],
  )

  const requestFile = useCallback(
    (editor: EditorType, range: { from: number; to: number }) => {
      const pending = { editor, ...range }
      pendingFileRef.current = pending
      setUploadStatus(null)
      reportValidity(false)
      setEditorEditable(editor, false)
      const input = fileInputRef.current
      if (!input) {
        pendingFileRef.current = null
        setEditorEditable(editor, editableRef.current)
        return
      }
      openFilePicker(input, () => {
        if (pendingFileRef.current !== pending) return
        pendingFileRef.current = null
        setEditorEditable(editor, editableRef.current)
        reportValidity(true)
      })
    },
    [reportValidity],
  )

  const editorCommands = useMemo(
    () => createLinearEditorCommands({ pickDate: requestDate, uploadFile: requestFile }),
    [requestDate, requestFile],
  )
  const slashExtension = useMemo(() => createSlashCommand(editorCommands), [editorCommands])
  const [referenceContainer, setReferenceContainer] = useState<HTMLDivElement | null>(null)

  const extensions = useMemo(
    () => [
      ...contentExtensions,
      Placeholder.configure({
        placeholder: ({ pos }) => (pos === 0 ? placeholder || "" : ""),
      }),
      ImageUploadNode.configure({
        accept: "image/*",
        maxSize: MAX_LINEAR_FILE_SIZE,
        limit: 1,
        upload: (file, onProgress, signal) =>
          uploadFileToLinear(file, update.panelActions, onProgress, signal),
        onError: (error) => setUploadStatus({ kind: "error", message: error.message }),
        onSuccess: () => setUploadStatus(null),
      }),
      slashExtension,
      LinearUserHandleDecoration,
      BubbleMenuExt,
    ],
    [contentExtensions, placeholder, slashExtension, update.panelActions],
  )

  const inspection = useMemo(
    () => inspectLinearMarkdown(value, contentExtensions),
    [contentExtensions, value],
  )
  const initialContent = inspection.ok
    ? inspection.document
    : { type: "doc", content: [{ type: "paragraph" }] }

  const editor = useEditor(
    {
      immediatelyRender: true,
      shouldRerenderOnTransaction: true,
      editorProps: {
        attributes: {
          autocomplete: "on",
          autocorrect: "on",
          autocapitalize: "off",
          role: editable ? "textbox" : "document",
          "aria-label": ariaLabel,
          ...(editable ? { "aria-multiline": "true" } : {}),
          class: "simple-editor",
        },
        handleDOMEvents: {
          dragstart: (view, event) => {
            if (!view.editable) return false
            const position = view.posAtCoords({ left: event.clientX, top: event.clientY })
            const selection = position && getImageDragSelection(view.state.doc, position.inside)
            if (selection) view.dispatch(view.state.tr.setSelection(selection))
            return false
          },
        },
        handlePaste: (_view, event) => {
          const file = event.clipboardData?.files?.[0]
          const currentEditor = editorInstanceRef.current
          if (!currentEditor || !editableRef.current) return false
          if (file) {
            event.preventDefault()
            void uploadAndInsertFile(currentEditor, file)
            return true
          }

          const text = event.clipboardData?.getData("text/plain")
          if (
            !text ||
            (!text.includes("\n") &&
              !/(?:`|^(?:!|<!--|<linear-embed\b|https:\/\/linear\.app\/))/.test(text))
          ) {
            return false
          }

          const pasted = inspectLinearMarkdown(text, contentExtensions)
          if (!pasted.ok) return false

          event.preventDefault()
          currentEditor
            .chain()
            .focus()
            .insertContent(pasted.document.content || [])
            .run()
          return true
        },
        handleDrop: (view, event) => {
          if (view.dragging) return false
          const file = event.dataTransfer?.files?.[0]
          const currentEditor = editorInstanceRef.current
          if (!file || !currentEditor || !editableRef.current) return false
          event.preventDefault()
          const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
          if (position !== undefined) currentEditor.commands.setTextSelection(position)
          void uploadAndInsertFile(currentEditor, file)
          return true
        },
      },
      extensions,
      content: initialContent,
      onUpdate: ({ editor: currentEditor }) => {
        const hasUpload = hasTemporaryUpload(currentEditor)
        setEditorEditable(currentEditor, editableRef.current && !hasUpload)
        if (!editableRef.current) return

        if (pendingFileRef.current || pendingDateRef.current || hasUpload) {
          reportValidity(false)
          return
        }

        const updatedInspection = inspectEditorDocument(
          currentEditor.getJSON(),
          (document) => currentEditor.markdown!.serialize(document),
          contentExtensions,
        )
        if (!updatedInspection) {
          reportValidity(false)
          return
        }

        // A keystroke that changes nothing Markdown keeps, such as a space ending a heading, is not
        // an edit: don't save it again, and don't drop an update from Linear waiting for blur.
        if (updatedInspection.markdown !== lastEmittedValueRef.current) {
          pendingExternalRef.current = null
          lastEmittedValueRef.current = updatedInspection.markdown
          onChangeRef.current?.(updatedInspection.markdown)
        }
        reportValidity(true)
      },
      editable,
    },
    [extensions],
  )

  const applyExternalValue = useCallback(
    (external: { value: string; document: object }) => {
      editor.commands.setContent(external.document, { emitUpdate: false })
      pendingExternalRef.current = null
      lastEmittedValueRef.current = undefined
      reportValidity(true)
    },
    [editor, reportValidity],
  )

  useEffect(() => {
    getEditor?.(editor)
  }, [editor, getEditor])

  useEffect(() => {
    editorInstanceRef.current = editor
    return () => {
      if (editorInstanceRef.current === editor) editorInstanceRef.current = null
    }
  }, [editor])

  useEffect(() => {
    setEditorEditable(editor, editable)
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: {
          autocomplete: "on",
          autocorrect: "on",
          autocapitalize: "off",
          role: editable ? "textbox" : "document",
          "aria-label": ariaLabel,
          ...(editable ? { "aria-multiline": "true" } : {}),
          class: "simple-editor",
        },
      },
    })
  }, [ariaLabel, editable, editor])

  useEffect(() => {
    editor.view.dom
      .querySelectorAll<HTMLInputElement>('ul[data-type="taskList"] input[type="checkbox"]')
      .forEach((checkbox) => {
        checkbox.disabled = !editable
      })
  }, [editable, editor, inspection])

  useEffect(() => {
    reportValidity(inspection.ok)
    if (!inspection.ok || value === lastEmittedValueRef.current) return

    const external = { value, document: inspection.document }
    if (
      editable &&
      (editor.isFocused ||
        pendingDateRef.current ||
        pendingFileRef.current ||
        activeUploadRef.current ||
        hasTemporaryUpload(editor))
    ) {
      pendingExternalRef.current = external
      return
    }
    if (!documentsMatch(editor.getJSON(), inspection.document)) applyExternalValue(external)
  }, [applyExternalValue, editable, editor, inspection, reportValidity, value])

  const handleBlur = () => {
    window.setTimeout(() => {
      if (
        editor.isFocused ||
        pendingDateRef.current ||
        pendingFileRef.current ||
        activeUploadRef.current ||
        hasTemporaryUpload(editor) ||
        document.activeElement?.closest("[data-linear-editor-ui]") ||
        toolbarRef.current?.contains(document.activeElement)
      ) {
        return
      }

      onBlur?.()
      const pending = pendingExternalRef.current
      if (pending) applyExternalValue(pending)
    })
  }

  const handleLinkClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const anchor = target.closest("a[href]")
    if (anchor?.hasAttribute("download")) return
    // A Linear reference decides for itself where it opens: an issue goes to its own
    // webview, so this handler must not also send it to the browser.
    if (anchor?.closest(".linear-reference")) return
    const href = anchor?.getAttribute("href")
    if (!href) return
    event.preventDefault()
    void update.panelActions.openExternalUrl(href)
  }

  if (!inspection.ok) {
    return (
      <UnsupportedMarkdown
        ariaLabel={ariaLabel}
        className={className}
        style={style}
        source={inspection.source}
        message={inspection.diagnostics[0]?.message || "Unsupported Linear Markdown content."}
      />
    )
  }

  return (
    <div
      ref={setReferenceContainer}
      className={`simple-editor-wrapper ${editorThemeClass} ${className || ""}`}
      style={style}
    >
      <EditorContext.Provider value={{ editor }}>
        <EditorContent
          editor={editor}
          className="simple-editor-content"
          onBlur={handleBlur}
          onClick={handleLinkClick}
        />
        <LinearReferenceHoverCard container={referenceContainer} />
        {editable ? (
          <BubbleMenu editor={editor} options={BUBBLE_MENU_OPTIONS} shouldShow={shouldShowToolbar}>
            <Toolbar ref={toolbarRef} data-linear-editor-ui="">
              <MainToolbarContent commands={editorCommands} editor={editor} />
            </Toolbar>
          </BubbleMenu>
        ) : null}
      </EditorContext.Provider>
      <input
        ref={dateInputRef}
        className="linear-editor-date-input"
        type="date"
        aria-label="Choose date"
        onBlur={() => {
          const pending = pendingDateRef.current
          if (!pending) return
          pendingDateRef.current = null
          setEditorEditable(pending.editor, editableRef.current)
          reportValidity(true)
        }}
        onChange={(event) => {
          const pending = pendingDateRef.current
          if (!pending || !event.target.value) return
          pendingDateRef.current = null
          setEditorEditable(pending.editor, editableRef.current)
          pending.editor
            .chain()
            .focus()
            .deleteRange({ from: pending.from, to: pending.to })
            .insertContent(event.target.value)
            .run()
        }}
      />
      <input
        ref={fileInputRef}
        className="linear-editor-file-input"
        type="file"
        aria-label="Upload file"
        onChange={(event) => {
          const file = event.target.files?.[0]
          const pending = pendingFileRef.current
          if (!file || !pending) return

          void uploadAndInsertFile(pending.editor, file, {
            from: pending.from,
            to: pending.to,
          })
        }}
      />
      {uploadStatus ? (
        <div
          className="linear-editor-upload-status"
          role={uploadStatus.kind === "error" ? "alert" : "status"}
        >
          {uploadStatus.kind === "uploading" ? (
            <>
              <span>{`Uploading file… ${uploadStatus.progress}%`}</span>
              <button type="button" onClick={() => activeUploadRef.current?.abort()}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <span>{uploadStatus.message}</span>
              {uploadStatus.retry ? (
                <button
                  type="button"
                  onClick={() => {
                    const { document, editor: retryEditor, file, range } = uploadStatus.retry!
                    // The saved range is only valid if the document is exactly the same.
                    const unchanged =
                      JSON.stringify(retryEditor.getJSON()) === JSON.stringify(document)
                    void uploadAndInsertFile(retryEditor, file, unchanged ? range : undefined)
                  }}
                >
                  Retry
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

const MainToolbarContent = (props: { commands: LinearEditorCommand[]; editor: EditorType }) => {
  const { commands, editor } = props

  return (
    <div
      style={{ display: "inline-flex", alignItems: "center", maxWidth: "90vw", flexWrap: "wrap" }}
    >
      <Spacer />
      {/* Linear's own bar, in its order: text style, then marks, link, quote, code, lists. */}
      <ToolbarGroup>
        <HeadingDropdownMenu editor={editor} levels={[1, 2, 3, 4]} />
      </ToolbarGroup>
      <ToolbarSeparator />
      <ToolbarGroup>
        <MarkButton editor={editor} type="bold" />
        <MarkButton editor={editor} type="italic" />
        <MarkButton editor={editor} type="strike" />
        <LinkPopover />
        <BlockquoteButton editor={editor} />
        <MarkButton editor={editor} type="code" />
        <CodeBlockButton editor={editor} />
        <ListDropdownMenu editor={editor} />
      </ToolbarGroup>
      {/* Everything Linear reaches from "/" rather than its bar: table, collapsible section,
          date, image, file, divider, diagram — plus the emoji picker. */}
      <ToolbarSeparator />
      <ToolbarGroup>
        <LinearEditorCommandMenu commands={commands} editor={editor} />
        <EmojiPicker
          editorSurface
          size={16}
          onSelect={(emoji) => {
            editor.chain().focus().insertContent(emoji).run()
          }}
        />
      </ToolbarGroup>
      {editor.isActive("table") ? (
        <>
          <ToolbarSeparator />
          <TableControls editor={editor} />
        </>
      ) : null}
      <Spacer />
    </div>
  )
}
