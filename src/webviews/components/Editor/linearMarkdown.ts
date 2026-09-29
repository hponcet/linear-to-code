import { getSchema } from "@tiptap/core"
import { CodeBlock } from "@tiptap/extension-code-block"
import { TaskItem, TaskList } from "@tiptap/extension-list"
import { TableKit } from "@tiptap/extension-table"
import { Markdown, MarkdownManager } from "@tiptap/markdown"
import { StarterKit } from "@tiptap/starter-kit"

import { LinearAudio } from "./markdownPlugins/AudioPlugin/LinearAudio"
import { Details, DetailsContent, DetailsSummary } from "./markdownPlugins/DetailsPlugin"
import { LinearFile } from "./markdownPlugins/FilePlugin"
import { LinearHardBreak } from "./markdownPlugins/LinearHardBreak"
import { LinearImage, LinearLink } from "./markdownPlugins/LinearImage"
import { LinearInlineCode } from "./markdownPlugins/LinearInlineCode"
import { LinearMediaEmbedTokenizer } from "./markdownPlugins/LinearMediaEmbed"
import { LinearOpaqueBlock } from "./markdownPlugins/LinearOpaqueBlock"
import { LinearTable, LinearTableCell, LinearTableHeader } from "./markdownPlugins/LinearTable"
import { LinearUserTagMention } from "./markdownPlugins/MentionPlugin/LinearUserTag"
import { LinearVideo } from "./markdownPlugins/VideosPlugin/LinearVideo"

import type { AnyExtension, JSONContent, MarkdownToken } from "@tiptap/core"
import type { Schema } from "@tiptap/pm/model"

export type LinearMarkdownDiagnosticCode =
  | "malformed-details"
  | "unsupported-token"
  | "missing-extension"
  | "invalid-heading"
  | "invalid-table"
  | "unsupported-syntax"
  | "unsupported-media"
  | "unsafe-url"
  | "expiring-url"
  | "invalid-document"
  | "lossy-round-trip"

export type LinearMarkdownDiagnostic = {
  code: LinearMarkdownDiagnosticCode
  message: string
  path?: string
  tokenType?: string
}

export type LinearMarkdownInspection =
  | {
      ok: true
      source: string
      document: JSONContent
      markdown: string
    }
  | {
      ok: false
      source: string
      diagnostics: LinearMarkdownDiagnostic[]
    }

export type LinearMarkdownExtensionOptions = {
  audioExtension?: AnyExtension
  fileExtension?: AnyExtension
  imageExtension?: AnyExtension
  mentionExtension?: AnyExtension
  codeBlockExtension?: AnyExtension
  videoExtension?: AnyExtension
}

export function createLinearMarkdownExtensions(
  options: LinearMarkdownExtensionOptions = {},
): AnyExtension[] {
  return [
    Markdown.configure({ markedOptions: { breaks: true } }),
    StarterKit.configure({
      code: false,
      codeBlock: false,
      gapcursor: false,
      hardBreak: false,
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: false,
      trailingNode: false,
      // Linear has no Markdown representation for underline (its docs list a marker for every
      // other mark, and Cmd+U only). Tiptap's default `++text++` is not Linear syntax: Linear
      // stores it as literal text, and accepting it here mangles ordinary text such as "C++".
      underline: false,
    }),
    options.codeBlockExtension ?? CodeBlock,
    LinearInlineCode,
    LinearHardBreak,
    LinearLink,
    TaskList,
    TaskItem.configure({
      nested: true,
      a11y: {
        checkboxLabel: (node) =>
          `Task item checkbox for ${node.firstChild?.textContent || "empty task item"}`,
      },
    }),
    TableKit.configure({ table: false, tableCell: false, tableHeader: false }),
    LinearTable,
    LinearTableCell,
    LinearTableHeader,
    options.imageExtension ?? LinearImage,
    LinearMediaEmbedTokenizer,
    options.audioExtension ?? LinearAudio,
    options.videoExtension ?? LinearVideo,
    Details,
    DetailsContent,
    DetailsSummary,
    options.mentionExtension ?? LinearUserTagMention,
    options.fileExtension ?? LinearFile,
    LinearOpaqueBlock,
  ]
}

type TokenWithChildren = MarkdownToken & {
  depth?: number
  ordered?: boolean
  task?: boolean
  items?: TokenWithChildren[]
  header?: Array<{ tokens?: TokenWithChildren[] }>
  rows?: Array<Array<{ tokens?: TokenWithChildren[] }>>
  tokens?: TokenWithChildren[]
  summaryTokens?: TokenWithChildren[]
  href?: string
  src?: string
  raw?: string
  text?: string
  title?: string
  destinationTitle?: string
  linkHref?: string
  linkTitle?: string
  resourceUrl?: string
  syntax?: string
}

const supportedTokens = new Set([
  "space",
  "paragraph",
  "text",
  "escape",
  "heading",
  "blockquote",
  "list",
  "list_item",
  "taskList",
  "taskItem",
  "checkbox",
  "strong",
  "em",
  "del",
  "codespan",
  "code",
  "br",
  "link",
  "image",
  "audio",
  "video",
  "linearMention",
  "linearFile",
  "linearOpaqueBlock",
  "hr",
  "table",
  "details",
])

const schemaTypeForToken: Record<string, string[]> = {
  paragraph: ["paragraph"],
  text: ["text"],
  heading: ["heading"],
  blockquote: ["blockquote"],
  list_item: ["listItem"],
  taskList: ["taskList", "taskItem"],
  taskItem: ["taskList", "taskItem"],
  strong: ["bold"],
  em: ["italic"],
  del: ["strike"],
  codespan: ["code"],
  code: ["codeBlock"],
  br: ["hardBreak"],
  link: ["link"],
  image: ["image"],
  audio: ["audio"],
  video: ["video"],
  linearMention: ["mention"],
  linearFile: ["linearFile"],
  linearOpaqueBlock: ["linearOpaqueBlock"],
  hr: ["horizontalRule"],
  table: ["table", "tableRow", "tableHeader", "tableCell"],
  details: ["details", "detailsSummary", "detailsContent"],
}

function hasSchemaType(schema: Schema, name: string): boolean {
  return schema.nodes[name] !== undefined || schema.marks[name] !== undefined
}

function hasAllowedUrl(value: string, protocols: string[]): boolean {
  try {
    return protocols.includes(new URL(value).protocol)
  } catch {
    return false
  }
}

function hasAllowedImageUrl(value: string): boolean {
  return hasAllowedUrl(value, ["https:"]) || /^data:image\/[a-z0-9.+-]+[;,]/i.test(value)
}

function hasExpiringSignature(value: string, tokenType: string): boolean {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    if (
      hostname !== "storage.googleapis.com" &&
      hostname !== "linear.app" &&
      !hostname.endsWith(".linear.app") &&
      !hostname.endsWith(".amazonaws.com") &&
      !hostname.endsWith(".cloudfront.net")
    ) {
      return false
    }

    return [...url.searchParams.keys()].some((key) => {
      if (
        hostname === "uploads.linear.app" &&
        key === "signature" &&
        ["link", "image", "audio", "video", "linearFile"].includes(tokenType)
      ) {
        return false
      }
      return /^(?:x-goog-|x-amz-|signature$|expires$|key-pair-id$|policy$)/i.test(key)
    })
  } catch {
    return false
  }
}

const nonImageFileExtensions = new Set([
  "aac",
  "avi",
  "csv",
  "doc",
  "docx",
  "flac",
  "gz",
  "m4a",
  "m4v",
  "mkv",
  "mov",
  "mp3",
  "mp4",
  "ogg",
  "oga",
  "ogv",
  "pdf",
  "tar",
  "wav",
  "webm",
  "xls",
  "xlsx",
  "zip",
])

function hasNonImageFileExtension(value: string): boolean {
  try {
    const extension = new URL(value).pathname.split(".").pop()?.toLowerCase()
    return extension !== undefined && nonImageFileExtensions.has(extension)
  } catch {
    return false
  }
}

function isEscaped(value: string, index: number): boolean {
  let backslashes = 0
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    backslashes += 1
  }
  return backslashes % 2 === 1
}

function countTableColumns(line: string): number {
  const value = line.trim()
  let separators = 0
  let codeDelimiterLength = 0

  const isUnescapedPipe = (index: number) => value[index] === "|" && !isEscaped(value, index)

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "`" && !isEscaped(value, index)) {
      let length = 1
      while (value[index + length] === "`") length += 1
      if (codeDelimiterLength === 0) codeDelimiterLength = length
      else if (codeDelimiterLength === length) codeDelimiterLength = 0
      index += length - 1
      continue
    }

    if (codeDelimiterLength > 0) continue
    if (isUnescapedPipe(index)) separators += 1
  }

  return separators + 1 - Number(isUnescapedPipe(0)) - Number(isUnescapedPipe(value.length - 1))
}

function isTableSeparatorLine(line: string): boolean {
  const value = line.trim()
  if (!value.includes("|")) return false

  return value
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .every((cell) => /^\s*:?-{2,}:?\s*$/.test(cell))
}

function escapeCodePipesForMarked(line: string): string {
  let result = ""
  let codeDelimiterLength = 0

  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === "`" && !isEscaped(line, index)) {
      let length = 1
      while (line[index + length] === "`") length += 1
      if (codeDelimiterLength === 0) codeDelimiterLength = length
      else if (codeDelimiterLength === length) codeDelimiterLength = 0
      result += line.slice(index, index + length)
      index += length - 1
      continue
    }

    if (line[index] === "|" && codeDelimiterLength > 0 && !isEscaped(line, index)) {
      result += "\\"
    }
    result += line[index]
  }

  return result
}

function prepareLinearMarkdownForParser(source: string): string {
  const lines = source.split(/\r?\n/)
  let fence: { marker: "`" | "~"; length: number } | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)

    if (fence) {
      if (
        fenceMatch?.[1]?.startsWith(fence.marker) &&
        fenceMatch[1].length >= fence.length &&
        !fenceMatch[2].trim()
      ) {
        fence = null
      }
      continue
    }

    if (fenceMatch?.[1]) {
      fence = { marker: fenceMatch[1][0] as "`" | "~", length: fenceMatch[1].length }
      continue
    }

    if (index === 0 || !isTableSeparatorLine(line)) continue

    lines[index - 1] = escapeCodePipesForMarked(lines[index - 1])
    for (let rowIndex = index + 1; rowIndex < lines.length; rowIndex += 1) {
      if (!lines[rowIndex].trim() || !lines[rowIndex].includes("|")) break
      lines[rowIndex] = escapeCodePipesForMarked(lines[rowIndex])
    }
  }

  return lines.join("\n")
}

function inspectDetailsDelimiters(source: string): LinearMarkdownDiagnostic[] {
  const delimiters: string[] = []
  let fence: { marker: "`" | "~"; length: number } | null = null

  for (const line of source.split(/\r?\n/)) {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)

    if (fence) {
      if (
        fenceMatch?.[1]?.startsWith(fence.marker) &&
        fenceMatch[1].length >= fence.length &&
        !fenceMatch[2].trim()
      ) {
        fence = null
      }

      continue
    }

    if (fenceMatch?.[1]) {
      fence = {
        marker: fenceMatch[1][0] as "`" | "~",
        length: fenceMatch[1].length,
      }
      continue
    }

    const open = /^(\+\+\+|>>>)[ \t]+\S/.exec(line)
    const close = /^(\+\+\+|>>>)$/.exec(line)

    if (open) {
      delimiters.push(open[1])
    } else if (close) {
      if (delimiters.length === 0) {
        return [{ code: "malformed-details", message: "Unexpected details closing delimiter." }]
      }

      if (close[1] !== delimiters.at(-1)) {
        return [{ code: "malformed-details", message: "Mismatched details closing delimiter." }]
      }

      delimiters.pop()
    }
  }

  return delimiters.length === 0
    ? []
    : [{ code: "malformed-details", message: "Unclosed details block." }]
}

function inspectSourceSyntax(source: string): LinearMarkdownDiagnostic[] {
  if (/^---[ \t]*\r?\n[\s\S]+?\r?\n---[ \t]*(?:\r?\n|$)/.test(source)) {
    return [
      {
        code: "unsupported-syntax",
        message: "Front matter is not portable in Linear Markdown.",
      },
    ]
  }

  return []
}

function inspectTableCandidates(source: string): LinearMarkdownDiagnostic[] {
  const lines = source.split(/\r?\n/)
  let fence: { marker: "`" | "~"; length: number } | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)

    if (fence) {
      if (
        fenceMatch?.[1]?.startsWith(fence.marker) &&
        fenceMatch[1].length >= fence.length &&
        !fenceMatch[2].trim()
      ) {
        fence = null
      }
      continue
    }

    if (fenceMatch?.[1]) {
      fence = { marker: fenceMatch[1][0] as "`" | "~", length: fenceMatch[1].length }
      continue
    }

    if (index === 0 || /^ {4}/.test(lines[index - 1]) || !isTableSeparatorLine(line)) {
      continue
    }

    if (line.includes(":")) {
      return [
        {
          code: "unsupported-syntax",
          message: "Table alignment is not preserved by Linear Markdown.",
        },
      ]
    }

    const width = countTableColumns(lines[index - 1])
    if (countTableColumns(line) !== width) {
      return [
        {
          code: "invalid-table",
          message: "A Markdown table separator does not match its header width.",
        },
      ]
    }

    for (let rowIndex = index - 1; rowIndex < lines.length; rowIndex += 1) {
      const row = lines[rowIndex]
      if (rowIndex > index && (!row.trim() || !row.includes("|"))) break
      if (row.includes("\\|")) {
        return [
          {
            code: "unsupported-syntax",
            message: "Escaped pipes in tables are not preserved by Linear Markdown.",
          },
        ]
      }
    }
  }

  return []
}

function hasHtmlCharacterReference(value: string): boolean {
  return /&(?:#[0-9]{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]+);/i.test(value)
}

const nonMarkableAtomTokenTypes = new Set([
  "image",
  "audio",
  "video",
  "linearMention",
  "linearFile",
])
const wrappingMarkTokenTypes = new Set(["strong", "em", "del", "link"])

function containsNonMarkableAtom(tokens: TokenWithChildren[] | undefined): boolean {
  return (
    tokens?.some(
      (token) =>
        nonMarkableAtomTokenTypes.has(token.type || "") || containsNonMarkableAtom(token.tokens),
    ) === true
  )
}

function isCanonicalLinearMentionLink(token: TokenWithChildren): boolean {
  return (
    token.type === "link" &&
    !token.title &&
    typeof token.href === "string" &&
    token.tokens?.length === 1 &&
    token.tokens[0].type === "linearMention" &&
    token.tokens[0].resourceUrl === token.href
  )
}

function inspectTokens(
  tokens: TokenWithChildren[],
  schema: Schema,
  path = "tokens",
  parentType?: string,
): LinearMarkdownDiagnostic[] {
  const diagnostics: LinearMarkdownDiagnostic[] = []
  const significantTokens = tokens.filter(
    (token) => token.type !== "space" && !(token.type === "text" && !token.raw?.trim()),
  )

  if (
    parentType === "paragraph" &&
    significantTokens.length > 1 &&
    significantTokens.some((token) => ["image", "audio", "video"].includes(token.type || ""))
  ) {
    diagnostics.push({
      code: "unsupported-syntax",
      message: "Linear Markdown stores media as standalone blocks.",
      path,
      tokenType: "paragraph",
    })
  }

  tokens.forEach((token, index) => {
    const tokenPath = `${path}[${index}]`
    const tokenType = token.type

    if (!tokenType || !supportedTokens.has(tokenType)) {
      diagnostics.push({
        code: "unsupported-token",
        message: `Unsupported Markdown token: ${tokenType ?? "unknown"}.`,
        path: tokenPath,
        tokenType,
      })
      return
    }

    if (token.type === "heading" && (token.depth === undefined || token.depth > 6)) {
      diagnostics.push({
        code: "invalid-heading",
        message: "Linear Markdown supports headings from H1 through H6.",
        path: tokenPath,
        tokenType: token.type,
      })
    }

    if (
      token.type === "list" &&
      token.ordered &&
      (token.items?.some((item) => item.task) ||
        token.raw?.split(/\r?\n/).some((line) => /^\s*\d+[.)]\s+\[[ xX]\]\s/.test(line)))
    ) {
      diagnostics.push({
        code: "unsupported-syntax",
        message: "Ordered task lists are not portable in Linear Markdown.",
        path: tokenPath,
        tokenType: token.type,
      })
    }

    const unsupportedSyntax =
      token.type === "del" && token.raw?.startsWith("~") && !token.raw.startsWith("~~")
        ? "Subscript syntax is not supported."
        : undefined

    if (unsupportedSyntax) {
      diagnostics.push({
        code: "unsupported-syntax",
        message: unsupportedSyntax,
        path: tokenPath,
        tokenType: token.type,
      })
    }

    if (
      wrappingMarkTokenTypes.has(tokenType) &&
      containsNonMarkableAtom(token.tokens) &&
      !isCanonicalLinearMentionLink(token)
    ) {
      diagnostics.push({
        code: "unsupported-syntax",
        message: "Marks and links around atomic Markdown nodes are not preserved by Linear.",
        path: tokenPath,
        tokenType: token.type,
      })
    }

    if (
      ["link", "image", "audio", "video", "linearMention", "linearFile"].includes(tokenType) &&
      [
        token.href,
        token.src,
        token.title,
        token.destinationTitle,
        token.resourceUrl,
        token.type === "image" ? token.text : undefined,
      ].some((value) => typeof value === "string" && hasHtmlCharacterReference(value))
    ) {
      diagnostics.push({
        code: "unsupported-syntax",
        message: "HTML character references in Markdown attributes are not portable.",
        path: tokenPath,
        tokenType: token.type,
      })
    }

    if (
      ((token.type === "link" || token.type === "image") && token.title) ||
      ((token.type === "audio" || token.type === "video") && token.destinationTitle)
    ) {
      diagnostics.push({
        code: "unsupported-syntax",
        message: "Markdown destination titles are not preserved by Linear.",
        path: tokenPath,
        tokenType: token.type,
      })
    }

    if (token.type === "image" && token.linkHref) {
      diagnostics.push({
        code: "unsupported-syntax",
        message: "Links around images are not preserved by Linear.",
        path: tokenPath,
        tokenType: token.type,
      })
    }

    if (
      (token.href &&
        ((token.type === "link" && !hasAllowedUrl(token.href, ["http:", "https:", "mailto:"])) ||
          (token.type === "image" && !hasAllowedImageUrl(token.href)) ||
          (token.type === "linearFile" && !hasAllowedUrl(token.href, ["https:"])))) ||
      (token.src &&
        (token.type === "audio" || token.type === "video") &&
        !hasAllowedUrl(token.src, ["https:"]))
    ) {
      diagnostics.push({
        code: "unsafe-url",
        message: `Unsupported URL protocol in Markdown ${token.type}.`,
        path: tokenPath,
        tokenType: token.type,
      })
    }

    if (token.type === "image" && token.href && hasNonImageFileExtension(token.href)) {
      diagnostics.push({
        code: "unsupported-media",
        message: "This media or file URL cannot be rendered portably yet.",
        path: tokenPath,
        tokenType: token.type,
      })
    }

    const mediaUrl = token.href || token.src
    if (
      token.type &&
      ["link", "image", "audio", "video", "linearFile"].includes(token.type) &&
      mediaUrl
    ) {
      if (hasExpiringSignature(mediaUrl, token.type)) {
        diagnostics.push({
          code: "expiring-url",
          message: "Signed media URLs cannot be saved until their canonical Linear URL is known.",
          path: tokenPath,
          tokenType: token.type,
        })
      }
    }

    if (token.type === "table" && token.raw && token.header) {
      const width = token.header.length
      const malformedRow = token.raw
        .trimEnd()
        .split(/\r?\n/)
        .slice(2)
        .find((line) => countTableColumns(line) > width)

      if (malformedRow) {
        diagnostics.push({
          code: "invalid-table",
          message: "A Markdown table row contains more cells than its header.",
          path: tokenPath,
          tokenType: token.type,
        })
      }
    }

    const requiredTypes = [...(schemaTypeForToken[tokenType] ?? [])]

    if (token.type === "list") {
      requiredTypes.push(token.ordered ? "orderedList" : "bulletList", "listItem")
    }

    if (token.type === "list_item" && token.task) {
      requiredTypes.push("taskList", "taskItem")
    }

    requiredTypes.forEach((name) => {
      if (!hasSchemaType(schema, name)) {
        diagnostics.push({
          code: "missing-extension",
          message: `The ${name} extension is required for this Markdown token.`,
          path: tokenPath,
          tokenType: token.type,
        })
      }
    })

    if (token.tokens) {
      diagnostics.push(...inspectTokens(token.tokens, schema, `${tokenPath}.tokens`, token.type))
    }

    if (token.summaryTokens) {
      diagnostics.push(...inspectTokens(token.summaryTokens, schema, `${tokenPath}.summaryTokens`))
    }

    if (token.items) {
      diagnostics.push(...inspectTokens(token.items, schema, `${tokenPath}.items`))
    }

    token.header?.forEach((cell, cellIndex) => {
      if (cell.tokens) {
        diagnostics.push(
          ...inspectTokens(cell.tokens, schema, `${tokenPath}.header[${cellIndex}].tokens`),
        )
      }
    })

    token.rows?.forEach((row, rowIndex) => {
      row.forEach((cell, cellIndex) => {
        if (cell.tokens) {
          diagnostics.push(
            ...inspectTokens(
              cell.tokens,
              schema,
              `${tokenPath}.rows[${rowIndex}][${cellIndex}].tokens`,
            ),
          )
        }
      })
    })
  })

  return diagnostics
}

function wrapInlineChildren(document: JSONContent, schema: Schema): JSONContent {
  const nodeType = document.type ? schema.nodes[document.type] : undefined
  const children = document.content?.map((child) => wrapInlineChildren(child, schema))

  if (!children?.length || nodeType?.inlineContent) {
    return children ? { ...document, content: children } : document
  }

  const content: JSONContent[] = []
  let inline: JSONContent[] = []
  const flushInline = () => {
    if (!inline.length) return
    content.push({ type: "paragraph", content: inline })
    inline = []
  }

  children.forEach((child) => {
    if (child.type && schema.nodes[child.type]?.isInline) {
      if (["image", "audio", "video"].includes(child.type)) {
        flushInline()
        content.push({ type: "paragraph", content: [child] })
        return
      }

      inline.push(child)
      return
    }

    flushInline()
    content.push(child)
  })
  flushInline()

  return { ...document, content }
}

function normalizeListContinuationIndentation(
  document: JSONContent,
  insideListItem = false,
): JSONContent {
  if (document.type === "heading" && !document.content?.length) {
    return { type: "paragraph" }
  }

  const childInsideListItem =
    insideListItem || document.type === "listItem" || document.type === "taskItem"
  const sourceChildren =
    document.type === "doc"
      ? document.content?.filter((child) => child.type !== "heading" || child.content?.length)
      : document.content
  const children = sourceChildren?.map((child) =>
    normalizeListContinuationIndentation(child, childInsideListItem),
  )
  if (!children) return document

  const content =
    childInsideListItem && document.type === "paragraph"
      ? children.flatMap((child, index) => {
          if (child.type !== "text" || children[index - 1]?.type !== "hardBreak") return [child]

          const text = child.text?.replace(/^[ \t]+/, "")
          return text ? [{ ...child, text }] : []
        })
      : children

  return {
    ...document,
    content: document.type === "doc" && !content.length ? [{ type: "paragraph" }] : content,
  }
}

function normalizeAndValidateDocument(document: JSONContent, schema: Schema): JSONContent {
  const normalized = normalizeListContinuationIndentation(
    wrapInlineChildren(
      {
        ...document,
        type: "doc",
        content: document.content?.length ? document.content : [{ type: "paragraph" }],
      },
      schema,
    ),
  )
  const node = schema.nodeFromJSON(normalized)

  node.check()
  return node.toJSON()
}

type LinearMarkdownRuntime = {
  manager: MarkdownManager
  schema: Schema
}

function createLinearMarkdownRuntime(extensions: AnyExtension[]): LinearMarkdownRuntime {
  return {
    manager: new MarkdownManager({ extensions }),
    schema: getSchema(extensions),
  }
}

const runtimeCache = new WeakMap<AnyExtension[], LinearMarkdownRuntime>()

function getLinearMarkdownRuntime(extensions: AnyExtension[]): LinearMarkdownRuntime {
  const cached = runtimeCache.get(extensions)
  if (cached) {
    return cached
  }

  const runtime = createLinearMarkdownRuntime(extensions)
  runtimeCache.set(extensions, runtime)
  return runtime
}

const defaultExtensions = createLinearMarkdownExtensions()
const defaultRuntime = getLinearMarkdownRuntime(defaultExtensions)

export function inspectLinearMarkdown(
  source: string,
  extensions?: AnyExtension[],
): LinearMarkdownInspection {
  const runtime = extensions ? getLinearMarkdownRuntime(extensions) : defaultRuntime
  const sourceDiagnostics = [
    ...inspectSourceSyntax(source),
    ...inspectDetailsDelimiters(source),
    ...inspectTableCandidates(source),
  ]

  if (sourceDiagnostics.length) {
    return { ok: false, source, diagnostics: sourceDiagnostics }
  }

  const parserSource = prepareLinearMarkdownForParser(source)
  let tokens: TokenWithChildren[]

  try {
    tokens = runtime.manager.instance.lexer(parserSource) as TokenWithChildren[]
  } catch (error) {
    return {
      ok: false,
      source,
      diagnostics: [
        {
          code: "invalid-document",
          message: error instanceof Error ? error.message : "Markdown lexing failed.",
        },
      ],
    }
  }

  const tokenDiagnostics = inspectTokens(tokens, runtime.schema)

  if (tokenDiagnostics.length) {
    return { ok: false, source, diagnostics: tokenDiagnostics }
  }

  try {
    const document = normalizeAndValidateDocument(
      runtime.manager.parse(parserSource),
      runtime.schema,
    )
    const markdown = runtime.manager.serialize(document)

    const containsOnlyEmptyHeadings = tokens.every(
      (token) => token.type === "space" || (token.type === "heading" && !token.text?.trim()),
    )

    if (source.trim() && !markdown.trim() && !containsOnlyEmptyHeadings) {
      return {
        ok: false,
        source,
        diagnostics: [
          {
            code: "lossy-round-trip",
            message: "Markdown parsing removed non-whitespace source content.",
          },
        ],
      }
    }

    const reparsed = normalizeAndValidateDocument(
      runtime.manager.parse(prepareLinearMarkdownForParser(markdown)),
      runtime.schema,
    )

    if (JSON.stringify(document) !== JSON.stringify(reparsed)) {
      return {
        ok: false,
        source,
        diagnostics: [
          {
            code: "lossy-round-trip",
            message: "Markdown parsing and serialization changed the document semantics.",
          },
        ],
      }
    }

    return { ok: true, source, document, markdown }
  } catch (error) {
    return {
      ok: false,
      source,
      diagnostics: [
        {
          code: "invalid-document",
          message: error instanceof Error ? error.message : "Markdown validation failed.",
        },
      ],
    }
  }
}

export function getCanonicalLinearMarkdown(source: string): string | undefined {
  const inspection = inspectLinearMarkdown(source)
  return inspection.ok ? inspection.markdown : undefined
}

/**
 * Spaces are invisible in plain, bold or italic text. Inline code, links and strike show on spaces,
 * and some Unicode space characters have a glyph, so those always count as content.
 */
function hidesSpaces(node: JSONContent | undefined): node is JSONContent {
  return (
    node?.type === "text" &&
    (node.marks ?? []).every((mark) => mark.type === "bold" || mark.type === "italic")
  )
}

/**
 * Markdown table cells can't keep leading or trailing spaces, so a cell such as "text " is saved
 * as "text". Trimming them lets the editor's document match what will be saved.
 */
export function trimTableCellWhitespace(document: JSONContent): JSONContent {
  if (document.type !== "tableCell" && document.type !== "tableHeader") {
    return document.content
      ? { ...document, content: document.content.map(trimTableCellWhitespace) }
      : document
  }

  return {
    ...document,
    content: document.content?.map((paragraph) => {
      const content = [...(paragraph.content ?? [])]
      const first = content[0]
      if (hidesSpaces(first))
        content[0] = { ...first, text: first.text?.replace(/^[ \t\u00a0]+/, "") }
      const last = content[content.length - 1]
      if (hidesSpaces(last))
        content[content.length - 1] = { ...last, text: last.text?.replace(/[ \t\u00a0]+$/, "") }
      const trimmed = content.filter((node) => node.type !== "text" || node.text)
      const { content: _, ...rest } = paragraph
      return trimmed.length ? { ...rest, content: trimmed } : rest
    }),
  }
}

const isBlankInline = (node: JSONContent) =>
  node.type === "hardBreak" || (hidesSpaces(node) && /^[ \t\u00a0]*$/.test(node.text ?? ""))

const isTextblock = (node: JSONContent | undefined) =>
  node?.type === "paragraph" || node?.type === "heading"

/** Removes line breaks and spaces that end the last line, however deeply it is nested. */
function trimLastLine(node: JSONContent): JSONContent {
  const content = [...(node.content ?? [])]
  if (isTextblock(node)) {
    while (content.length && isBlankInline(content[content.length - 1])) content.pop()
    const { content: _, ...rest } = node
    return content.length ? { ...rest, content } : rest
  }
  const last = content[content.length - 1]
  if (!last) return node
  content[content.length - 1] = trimLastLine(last)
  return { ...node, content }
}

/**
 * Markdown can't keep some empty lines and line breaks at the very end of a description, such as an
 * empty line after a heading or a trailing Shift+Enter. They carry nothing, so the editor retries
 * without them when a save would otherwise be refused. Empty lines between blocks are kept: they
 * are content that must not disappear silently.
 */
export function trimDocumentEnd(document: JSONContent): JSONContent {
  const content = [...(document.content ?? [])]
  while (
    isTextblock(content[content.length - 1]) &&
    (content[content.length - 1].content ?? []).every(isBlankInline)
  ) {
    content.pop()
  }
  return trimLastLine({ ...document, content })
}

/**
 * Markdown can't keep spaces at the end of a line, nor at the start of a heading or a list item.
 * They are invisible, so they can be dropped when that is the only thing refusing a save. Spaces
 * that show (inline code, links, strike) are never dropped.
 */
function trimLineEdges(node: JSONContent, parent?: JSONContent): JSONContent {
  if (!isTextblock(node)) {
    return node.content
      ? { ...node, content: node.content.map((child) => trimLineEdges(child, node)) }
      : node
  }

  const trimsStart =
    node.type === "heading" || parent?.type === "listItem" || parent?.type === "taskItem"
  const content = (node.content ?? []).map((child, index, siblings) => {
    if (!hidesSpaces(child)) return child
    let text = child.text ?? ""
    if (trimsStart && index === 0) text = text.replace(/^[ \t\u00a0]+/, "")
    const next = siblings[index + 1]
    if (!next || next.type === "hardBreak") text = text.replace(/[ \t\u00a0]+$/, "")
    return { ...child, text }
  })
  const kept = content.filter((child) => child.type !== "text" || child.text)
  const { content: _, ...rest } = node
  return kept.length ? { ...rest, content: kept } : rest
}

// Everything Markdown can't keep and nobody can see: edge spaces and the emptiness ending a document.
const withoutUnsavable = (document: JSONContent) => trimDocumentEnd(trimLineEdges(document))

/**
 * The Markdown to save for an editor document, or undefined when saving it would change what the
 * user sees. When the document itself can't be saved, it is retried without the invisible spaces,
 * empty lines and line breaks that Markdown can't keep.
 */
export function inspectEditorDocument(
  document: JSONContent,
  serialize: (document: JSONContent) => string,
  extensions?: AnyExtension[],
) {
  const save = (candidate: JSONContent, normalize: (parsed: JSONContent) => JSONContent) => {
    const inspection = inspectLinearMarkdown(serialize(candidate), extensions)
    return inspection.ok &&
      JSON.stringify(trimTableCellWhitespace(candidate)) ===
        JSON.stringify(normalize(inspection.document))
      ? inspection
      : undefined
  }
  return save(document, (parsed) => parsed) ?? save(withoutUnsavable(document), withoutUnsavable)
}
