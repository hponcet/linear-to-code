import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react"
import {
  CopyImageIcon,
  DownloadIcon,
  MoreIcon,
  ViewImageIcon,
} from "src/webviews/components/Editor/components/tiptap-icons/image-menu-icons"
import { LinkIcon } from "src/webviews/components/Editor/components/tiptap-icons/link-icon"
import { TrashIcon } from "src/webviews/components/Editor/components/tiptap-icons/trash-icon"
import {
  Button,
  ButtonGroup,
} from "src/webviews/components/Editor/components/tiptap-ui-primitive/button"
import { Card, CardBody } from "src/webviews/components/Editor/components/tiptap-ui-primitive/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "src/webviews/components/Editor/components/tiptap-ui-primitive/dropdown-menu"
import { useIssueContext } from "src/webviews/contexts/IssueContext"

import { LinearImage } from "./LinearImage"
import { usePrivateLinearAssetUrl } from "./usePrivateLinearAssetUrl"

import { isAllowedLinearLink } from "../markdownEscaping"

import type { ReactNodeViewProps } from "@tiptap/react"

function getStringAttribute(value: unknown): string {
  return typeof value === "string" ? value : ""
}

/** Linear names its images by alt text; fall back to the URL's last path segment. */
function getDownloadName(source: string, alt: string): string {
  if (alt.trim()) return alt.trim()
  try {
    return new URL(source).pathname.split("/").pop() || "image"
  } catch {
    return "image"
  }
}

function ImageOptionsMenu(props: {
  /** The resolved URL the browser can actually read: an object URL for private Linear assets. */
  readableUrl: string
  /** The URL as stored in the document, which is what a reader outside the webview needs. */
  sourceUrl: string
  downloadName: string
  onDelete: () => void
}) {
  const { readableUrl, sourceUrl, downloadName, onDelete } = props
  const { update } = useIssueContext()

  const download = () => {
    const anchor = document.createElement("a")
    anchor.href = readableUrl
    anchor.download = downloadName
    anchor.rel = "noopener noreferrer nofollow"
    anchor.click()
  }

  const copyImage = async () => {
    const blob = await fetch(readableUrl).then((response) => response.blob())
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
  }

  const items = [
    {
      id: "view",
      label: "View image",
      icon: <ViewImageIcon className="tiptap-button-icon" />,
      run: () => void update.panelActions.openExternalUrl(sourceUrl),
    },
    {
      id: "download",
      label: "Download",
      icon: <DownloadIcon className="tiptap-button-icon" />,
      run: download,
    },
    {
      id: "copy-image",
      label: "Copy image",
      icon: <CopyImageIcon className="tiptap-button-icon" />,
      run: () => void copyImage().catch(() => undefined),
    },
    {
      id: "copy-link",
      label: "Copy link",
      icon: <LinkIcon className="tiptap-button-icon" />,
      run: () => void navigator.clipboard.writeText(sourceUrl).catch(() => undefined),
    },
    {
      id: "delete",
      label: "Delete",
      icon: <TrashIcon className="tiptap-button-icon" />,
      run: onDelete,
    },
  ]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          data-style="ghost"
          tabIndex={-1}
          aria-label="Image options"
          className="linear-image-menu__trigger"
        >
          <MoreIcon className="tiptap-button-icon" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-linear-editor-ui="">
        <Card>
          <CardBody>
            <ButtonGroup>
              {items.map((item) => (
                // Radix selects on pointerup. ProseMirror suppresses the click event inside a node
                // view, so a child onClick never fires here — onSelect is the handler that does.
                <DropdownMenuItem key={item.id} onSelect={item.run} asChild>
                  <Button type="button" data-style="ghost" showTooltip={false}>
                    {item.icon}
                    <span>{item.label}</span>
                  </Button>
                </DropdownMenuItem>
              ))}
            </ButtonGroup>
          </CardBody>
        </Card>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function LinearImageRenderer({ node, deleteNode }: ReactNodeViewProps<HTMLDivElement>) {
  const source = getStringAttribute(node.attrs.src)
  const alt = getStringAttribute(node.attrs.alt)
  const title = getStringAttribute(node.attrs.title)
  const linkHref = getStringAttribute(node.attrs.linkHref)
  const linkTitle = getStringAttribute(node.attrs.linkTitle)
  const privateImage = usePrivateLinearAssetUrl(source)
  const imageSrc = privateImage.url
  const image = imageSrc ? (
    <img
      src={imageSrc}
      alt={alt}
      title={title || undefined}
      draggable={false}
      onError={privateImage.isPrivate ? privateImage.retry : undefined}
    />
  ) : null

  return (
    <NodeViewWrapper
      as="span"
      className="linear-image"
      contentEditable={false}
      data-drag-handle=""
      aria-busy={privateImage.isPrivate && privateImage.status === "loading"}
    >
      {privateImage.isPrivate && privateImage.status === "loading" ? (
        <span role="status">Loading image…</span>
      ) : null}
      {privateImage.isPrivate && privateImage.status === "error" ? (
        <div role="alert">
          <span>
            {alt ? `Could not load ${alt}.` : "Could not load this private Linear image."}
          </span>{" "}
          <button type="button" onClick={privateImage.retry}>
            Retry
          </button>
        </div>
      ) : linkHref && isAllowedLinearLink(linkHref) && image ? (
        <a href={linkHref} title={linkTitle || undefined} rel="noopener noreferrer nofollow">
          {image}
        </a>
      ) : (
        image
      )}
      {imageSrc ? (
        <span
          className="linear-image__menu"
          data-linear-editor-ui=""
          // ProseMirror claims pointer events inside a node view to select the node, which
          // swallows the click before the menu ever sees it.
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <ImageOptionsMenu
            readableUrl={imageSrc}
            sourceUrl={source}
            downloadName={getDownloadName(source, alt)}
            onDelete={deleteNode}
          />
        </span>
      ) : null}
    </NodeViewWrapper>
  )
}

export const LinearImageWithNodeView = LinearImage.extend({
  addNodeView() {
    return ReactNodeViewRenderer(LinearImageRenderer)
  },
})
