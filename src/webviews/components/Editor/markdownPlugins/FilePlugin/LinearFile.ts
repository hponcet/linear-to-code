import { mergeAttributes, Node } from "@tiptap/core"

import { findFileMarkdown, parseFileMarkdown } from "./fileMarkdownDetection"
import { formatFileSize } from "./formatFileSize"

import {
  escapeMarkdownLabel,
  formatMarkdownDestination,
  parseLinearEmbedJson,
} from "../../markdownEscaping"

import type { JSONContent, MarkdownToken } from "@tiptap/core"

export type LinearFileAttributes = {
  uploadState: string
  href: string
  name: string
  /** Absent when Linear serialised the attachment as a Markdown link, which carries no metadata. */
  size: number | null
  mimetype: string | null
  syntax: "linearEmbed" | "markdownLink"
}

export type ParsedLinearFileEmbed = LinearFileAttributes & {
  raw: string
}

const linearFileOpeningTag = '<linear-embed node-type="file">'
const linearFilePattern = /^<linear-embed node-type="file">([^\r\n]*)<\/linear-embed>(?:\r?\n|$)/
const mimeTypePattern = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i
const uploadStatePattern = /^[a-z][a-z0-9_-]*$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isSignatureParameter(part: string): boolean {
  const equalsIndex = part.indexOf("=")
  const key = equalsIndex < 0 ? part : part.slice(0, equalsIndex)

  try {
    return decodeURIComponent(key.replace(/\+/g, " ")) === "signature"
  } catch {
    return key === "signature"
  }
}

export function canonicalizeLinearFileHref(value: unknown): string | null {
  if (typeof value !== "string") return null

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }

  if (url.protocol !== "https:") return null
  if (url.hostname !== "uploads.linear.app" || !url.search) return value

  const hashIndex = value.indexOf("#")
  const withoutHash = hashIndex < 0 ? value : value.slice(0, hashIndex)
  const hash = hashIndex < 0 ? "" : value.slice(hashIndex)
  const queryIndex = withoutHash.indexOf("?")
  if (queryIndex < 0) return value

  const query = withoutHash.slice(queryIndex + 1)
  const remaining = query.split("&").filter((part) => !isSignatureParameter(part))
  const base = withoutHash.slice(0, queryIndex)

  return `${base}${remaining.length ? `?${remaining.join("&")}` : ""}${hash}`
}

export function normalizeLinearFileAttributes(value: unknown): LinearFileAttributes | null {
  if (!isRecord(value)) return null

  const href = canonicalizeLinearFileHref(value.href)
  const syntax = value.syntax === "markdownLink" ? "markdownLink" : "linearEmbed"
  if (
    typeof value.uploadState !== "string" ||
    !uploadStatePattern.test(value.uploadState) ||
    !href ||
    typeof value.name !== "string" ||
    !value.name.trim()
  ) {
    return null
  }

  // The embed payload always carries metadata; a Markdown link never does.
  if (syntax === "markdownLink") {
    return {
      uploadState: value.uploadState,
      href,
      name: value.name,
      size: null,
      mimetype: null,
      syntax,
    }
  }

  if (
    typeof value.size !== "number" ||
    !Number.isSafeInteger(value.size) ||
    value.size < 0 ||
    typeof value.mimetype !== "string" ||
    !mimeTypePattern.test(value.mimetype)
  ) {
    return null
  }

  return {
    uploadState: value.uploadState,
    href,
    name: value.name,
    size: value.size,
    mimetype: value.mimetype,
    syntax,
  }
}

export function parseLinearFileEmbed(source: string): ParsedLinearFileEmbed | null {
  const match = linearFilePattern.exec(source)
  if (!match) return null

  let payload: unknown
  try {
    payload = parseLinearEmbedJson(match[1])
  } catch {
    return null
  }

  const attributes = normalizeLinearFileAttributes({
    ...(payload as object),
    syntax: "linearEmbed",
  })
  return attributes ? { raw: match[0], ...attributes } : null
}

/**
 * The link form of an attachment. `linearFile` is a block node, so only a line that is nothing
 * but the link can become one; a link sitting inside a sentence stays an ordinary link.
 */
export function parseLinearFileLink(source: string): ParsedLinearFileEmbed | null {
  const link = parseFileMarkdown(source)
  if (!link) return null

  const rest = source.slice(link.raw.length)
  const lineBreak = /^\r?\n/.exec(rest)?.[0]
  if (rest && lineBreak === undefined) return null

  const attributes = normalizeLinearFileAttributes({
    uploadState: "finished",
    href: link.href,
    name: link.name,
    syntax: "markdownLink",
  })

  return attributes ? { raw: `${link.raw}${lineBreak ?? ""}`, ...attributes } : null
}

export function findLinearFileLink(source: string): number {
  let index = findFileMarkdown(source)

  while (index !== -1) {
    const atLineStart = index === 0 || source[index - 1] === "\n"
    if (atLineStart && parseLinearFileLink(source.slice(index))) return index

    const next = findFileMarkdown(source.slice(index + 1))
    index = next === -1 ? -1 : index + 1 + next
  }

  return -1
}

export function findLinearFileEmbed(source: string): number {
  return source.search(/^<linear-embed node-type="file">/m)
}

export function serializeLinearFileEmbed(value: unknown): string | null {
  const attributes = normalizeLinearFileAttributes(value)
  if (!attributes) return null

  // Round-tripping has to give Linear back the shape it sent, or the save gate rejects the edit.
  if (attributes.syntax === "markdownLink") {
    return `[${escapeMarkdownLabel(attributes.name)}](${formatMarkdownDestination(attributes.href)})`
  }

  const { syntax: _syntax, ...payload } = attributes
  return `${linearFileOpeningTag}${JSON.stringify(payload)}</linear-embed>`
}

function tokenAttributes(token: MarkdownToken): LinearFileAttributes | null {
  return normalizeLinearFileAttributes({
    uploadState: token.uploadState,
    href: token.href,
    name: token.name,
    size: token.size,
    mimetype: token.mimetype,
    syntax: token.syntax,
  })
}

export const LinearFile = Node.create({
  name: "linearFile",

  group: "block",

  atom: true,

  draggable: true,

  addAttributes() {
    return {
      uploadState: { default: null, rendered: false },
      href: { default: null, rendered: false },
      name: { default: null, rendered: false },
      size: { default: null, rendered: false },
      mimetype: { default: null, rendered: false },
      syntax: { default: "linearEmbed", rendered: false },
    }
  },

  parseHTML() {
    return [
      {
        tag: "a[data-linear-file-card]",
        getAttrs: (element) => {
          const size = element.getAttribute("data-size")
          return (
            normalizeLinearFileAttributes({
              uploadState: element.getAttribute("data-upload-state"),
              href: element.getAttribute("href"),
              name: element.getAttribute("data-name"),
              size: size === null ? null : Number(size),
              mimetype: element.getAttribute("data-mimetype"),
            }) ?? false
          )
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes, node }) {
    const attributes = normalizeLinearFileAttributes(node.attrs)
    if (!attributes) {
      return ["div", { role: "group", "aria-label": "Invalid file attachment" }, "Unavailable file"]
    }

    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        "data-linear-file-card": "",
        "data-upload-state": attributes.uploadState,
        "data-name": attributes.name,
        "data-size": String(attributes.size),
        "data-mimetype": attributes.mimetype,
        class: "linear-file-card",
        href: attributes.href,
        rel: "noopener noreferrer nofollow",
        "aria-label": `Download ${attributes.name}`,
      }),
      // Must mirror LinearFileNodeView: the same node renders through this spec wherever no
      // React node view is installed, and the two drifting apart is what made an attachment
      // look like a bare link outside the editor.
      attributes.size === null
        ? [
            "span",
            { class: "linear-file-card__text" },
            ["span", { class: "linear-file-card__name" }, attributes.name],
          ]
        : [
            "span",
            { class: "linear-file-card__text" },
            ["span", { class: "linear-file-card__name" }, attributes.name],
            [
              "span",
              { class: "linear-file-card__metadata", "aria-hidden": "true" },
              formatFileSize(attributes.size),
            ],
          ],
    ]
  },

  markdownTokenName: "linearFile",

  markdownTokenizer: {
    name: "linearFile",
    level: "block",
    start(source: string) {
      const embed = findLinearFileEmbed(source)
      const link = findLinearFileLink(source)
      if (embed === -1) return link
      if (link === -1) return embed
      return Math.min(embed, link)
    },
    tokenize(source) {
      const file = parseLinearFileEmbed(source) ?? parseLinearFileLink(source)
      return file ? { type: "linearFile", ...file } : undefined
    },
  },

  parseMarkdown(token: MarkdownToken, helpers) {
    const attributes = tokenAttributes(token)
    return attributes ? helpers.createNode("linearFile", attributes) : []
  },

  renderMarkdown(node: JSONContent) {
    return serializeLinearFileEmbed(node.attrs) ?? ""
  },
})
