import { mergeAttributes } from "@tiptap/core"
import { Image } from "@tiptap/extension-image"
import { Link } from "@tiptap/extension-link"
import { NodeSelection } from "@tiptap/pm/state"

import { parseLinearMentionUrl } from "./MentionPlugin/LinearMention"
import {
  getCanonicalPrivateLinearAssetUrl,
  getCanonicalPrivateLinearImageUrl,
} from "./privateLinearImageUrl"

import {
  escapeMarkdownLabel,
  formatMarkdownDestination,
  formatMarkdownTitle,
  isAllowedLinearLink,
  unescapeMarkdownPunctuation,
} from "../markdownEscaping"

import type { JSONContent, MarkdownToken } from "@tiptap/core"
import type { DOMOutputSpec, Node } from "@tiptap/pm/model"

type LinkedImageAttributes = {
  linkHref?: string | null
  linkTitle?: string | null
}

export function getImageDragSelection(document: Node, position: number): NodeSelection | null {
  if (position < 0) return null
  const $position = document.resolve(position)
  if (
    $position.nodeAfter?.type.name !== "image" ||
    $position.parent.type.name !== "paragraph" ||
    $position.parent.childCount !== 1
  ) {
    return null
  }

  // Move a standalone image's paragraph too, so no empty source paragraph blocks Markdown saves.
  return NodeSelection.create(document, $position.before())
}

export const LinearImage = Image.extend({
  parseMarkdown(token: MarkdownToken, helpers) {
    return helpers.createNode("image", {
      src: getCanonicalPrivateLinearImageUrl(token.href) ?? token.href,
      alt: typeof token.text === "string" ? unescapeMarkdownPunctuation(token.text) : token.text,
      title: token.title || null,
      linkHref: token.linkHref || null,
      linkTitle: token.linkTitle || null,
    })
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      linkHref: {
        default: null,
        parseHTML: (element) => element.closest("a")?.getAttribute("href") ?? null,
        rendered: false,
      },
      linkTitle: {
        default: null,
        parseHTML: (element) => element.closest("a")?.getAttribute("title") ?? null,
        rendered: false,
      },
    }
  },

  renderHTML({ HTMLAttributes, node }) {
    const image: DOMOutputSpec = [
      "img",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
    ]
    const { linkHref, linkTitle } = (node.attrs ?? {}) as LinkedImageAttributes

    return linkHref && isAllowedLinearLink(linkHref)
      ? [
          "a",
          {
            href: linkHref,
            title: linkTitle || undefined,
            rel: "noopener noreferrer nofollow",
          },
          image,
        ]
      : image
  },

  renderMarkdown(node) {
    const source = node.attrs?.src ?? ""
    const src = getCanonicalPrivateLinearImageUrl(source) ?? source
    const alt = node.attrs?.alt ?? ""
    const title = node.attrs?.title ?? ""
    const image = `![${escapeMarkdownLabel(alt)}](${formatMarkdownDestination(src)}${formatMarkdownTitle(title)})`
    const { linkHref, linkTitle } = (node.attrs ?? {}) as LinkedImageAttributes

    if (!linkHref) {
      return image
    }

    return `[${image}](${formatMarkdownDestination(linkHref)}${formatMarkdownTitle(linkTitle)})`
  },
}).configure({
  inline: true,
  allowBase64: true,
})

export const LinearLink = Link.extend({
  parseMarkdown(token, helpers) {
    const content = helpers.parseInline(token.tokens || [])
    const mention = typeof token.href === "string" ? parseLinearMentionUrl(token.href) : null
    const href = getCanonicalPrivateLinearAssetUrl(token.href) ?? token.href

    if (
      mention &&
      !token.title &&
      content.length === 1 &&
      ((content[0].type === "text" && content[0].text === token.href) ||
        (mention.kind === "issue" &&
          content[0].type === "text" &&
          content[0].text === mention.label) ||
        (content[0].type === "mention" && content[0].attrs?.resourceUrl === token.href))
    ) {
      return helpers.createNode("mention", mention)
    }

    if (content.length === 1 && content[0].type === "image") {
      const image = content[0] as JSONContent
      return {
        ...image,
        attrs: {
          ...image.attrs,
          linkHref: token.href,
          linkTitle: token.title || null,
        },
      }
    }

    return helpers.applyMark("link", content, {
      href,
      title: token.title || null,
    })
  },

  renderMarkdown(node, helpers) {
    const source = node.attrs?.href ?? ""
    const href = getCanonicalPrivateLinearAssetUrl(source) ?? source
    const title = node.attrs?.title
    return `[${helpers.renderChildren(node)}](${formatMarkdownDestination(href)}${formatMarkdownTitle(title)})`
  },
}).configure({
  openOnClick: false,
  isAllowedUri: isAllowedLinearLink,
})
