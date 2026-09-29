import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react"
import { DownloadIcon } from "src/webviews/components/Editor/components/tiptap-icons/image-menu-icons"
import { Button } from "src/webviews/components/Editor/components/tiptap-ui-primitive/button"

import { formatFileSize } from "./formatFileSize"
import { LinearFile, normalizeLinearFileAttributes } from "./LinearFile"

import { usePrivateLinearAssetUrl } from "../usePrivateLinearAssetUrl"

import type { ReactNodeViewProps } from "@tiptap/react"

export function LinearFileRenderer({ node }: ReactNodeViewProps<HTMLDivElement>) {
  const file = normalizeLinearFileAttributes(node.attrs)
  const asset = usePrivateLinearAssetUrl(file?.href ?? "")

  if (!file) {
    return (
      <NodeViewWrapper role="alert" contentEditable={false} data-drag-handle="">
        Unavailable file
      </NodeViewWrapper>
    )
  }

  if (asset.status === "loading") {
    return (
      <NodeViewWrapper role="status" contentEditable={false} data-drag-handle="">
        Loading {file.name}…
      </NodeViewWrapper>
    )
  }

  if (asset.status === "error") {
    return (
      <NodeViewWrapper role="alert" contentEditable={false} data-drag-handle="">
        Could not load {file.name}.{" "}
        <button type="button" onClick={asset.retry}>
          Retry
        </button>
      </NodeViewWrapper>
    )
  }

  const download = () => {
    const anchor = document.createElement("a")
    anchor.href = asset.url
    anchor.download = file.name
    anchor.rel = "noopener noreferrer nofollow"
    anchor.click()
  }

  // Like an image, clicking the card only selects the node; downloading is the button's job.
  return (
    <NodeViewWrapper contentEditable={false} data-drag-handle="">
      <div className="linear-file-card" role="group" aria-label={file.name}>
        <span className="linear-file-card__text">
          <span className="linear-file-card__name">{file.name}</span>
          {file.size === null ? null : (
            <span className="linear-file-card__metadata" aria-hidden="true">
              {formatFileSize(file.size)}
            </span>
          )}
        </span>
        <Button
          type="button"
          data-style="ghost"
          aria-label={`Download ${file.name}`}
          showTooltip={false}
          className="linear-file-card__download"
          onClick={download}
          // ProseMirror claims pointer events inside a node view to select the node, which
          // swallows the click before the button ever sees it.
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <DownloadIcon className="tiptap-button-icon" />
        </Button>
      </div>
    </NodeViewWrapper>
  )
}

export const LinearFileWithNodeView = LinearFile.extend({
  addNodeView() {
    return ReactNodeViewRenderer(LinearFileRenderer)
  },
})
