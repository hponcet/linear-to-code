import { createHash } from "crypto"
import * as fs from "fs/promises"
import * as path from "path"

import { User } from "@linear/sdk"
import { create } from "fontkit"
import { UNASSIGNED_ASSIGNEE_ID } from "src/constants"
import { ExtensionContext, Uri } from "vscode"

import type { Font } from "fontkit"

export { UNASSIGNED_ASSIGNEE_ID } from "src/constants"

const DEFAULT_BACKGROUND_COLOR = "#5e6ad2"
let avatarFont: Promise<Font> | undefined

export type AssigneeIconInfo = {
  initials?: string | null
  avatarBackgroundColor?: string | null
}

export function deriveUserInitials(
  user: Pick<User, "initials" | "displayName" | "name">,
): string | undefined {
  const fromInitials = user.initials?.trim()
  if (fromInitials) {
    return fromInitials
  }

  const label = (user.displayName || user.name || "").trim()
  if (!label) {
    return undefined
  }

  const parts = label.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase()
  }

  return label.slice(0, 2).toUpperCase()
}

export function resolveAssigneeIconInfo(
  info?: AssigneeIconInfo | null,
): AssigneeIconInfo | undefined {
  if (!info) {
    return undefined
  }

  const initials = info.initials?.trim()
  if (!initials) {
    return undefined
  }

  return {
    initials,
    avatarBackgroundColor: info.avatarBackgroundColor?.trim() || DEFAULT_BACKGROUND_COLOR,
  }
}

/** Use font outlines so native tree icons render Inter without installed system fonts. */
export function buildUserAvatarSvg(initials: string, backgroundColor: string, font: Font): string {
  const text = [...new Intl.Segmenter().segment(initials.trim().normalize("NFC").toUpperCase())]
    .slice(0, 2)
    .map(({ segment }) => segment)
    .join("")
  const background = /^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(backgroundColor)
    ? backgroundColor
    : DEFAULT_BACKGROUND_COLOR
  const run = font.layout(text)
  const bounds = run.bbox
  let letters = ""
  if (bounds.width > 0 && bounds.height > 0) {
    const scale = Math.min(11 / font.unitsPerEm, 14 / bounds.width, 10 / bounds.height)
    const x = 10 - ((bounds.minX + bounds.maxX) / 2) * scale
    const y = 10 + ((bounds.minY + bounds.maxY) / 2) * scale
    let advance = 0
    const paths = run.glyphs
      .map((glyph, index) => {
        const position = run.positions[index]
        const path = `<path transform="translate(${advance + position.xOffset} ${position.yOffset})" d="${glyph.path.toSVG()}"/>`
        advance += position.xAdvance
        return path
      })
      .join("")
    letters = `<g fill="#ffffff" transform="translate(${x} ${y}) scale(${scale} ${-scale})">${paths}</g>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9.5" fill="${background}"/>${letters}</svg>`
}

export async function writeUserAvatarIcon(
  cacheDir: string,
  userId: string,
  info: AssigneeIconInfo,
  font: Font,
): Promise<Uri | undefined> {
  const iconInfo = resolveAssigneeIconInfo(info)
  if (!iconInfo) {
    return undefined
  }

  const svg = buildUserAvatarSvg(iconInfo.initials!, iconInfo.avatarBackgroundColor!, font)
  const key = createHash("sha256").update(userId).update(svg).digest("hex")
  const filePath = path.join(cacheDir, `${key}.svg`)
  await fs.writeFile(filePath, svg)
  return Uri.file(filePath)
}

export async function buildUserAvatarIconCache(
  cacheDir: string,
  users: User[],
  font: Font,
): Promise<Map<string, Uri>> {
  await fs.mkdir(cacheDir, { recursive: true })

  const iconByUserId = new Map<string, Uri>()

  for (const user of users) {
    const iconUri = await writeUserAvatarIcon(
      cacheDir,
      user.id,
      {
        initials: deriveUserInitials(user),
        avatarBackgroundColor: user.avatarBackgroundColor,
      },
      font,
    )

    if (iconUri) {
      iconByUserId.set(user.id, iconUri)
    }
  }

  return iconByUserId
}

export async function buildUserAvatarIconCacheForContext(
  context: ExtensionContext,
  users: User[],
): Promise<Map<string, Uri>> {
  const cacheDir = path.join(context.globalStorageUri.fsPath, "user-avatar-icons")
  avatarFont ??= fs
    .readFile(Uri.joinPath(context.extensionUri, "resources", "Inter-VariableFont.ttf").fsPath)
    .then((buffer) => (create(buffer) as Font).getVariation({ wght: 600, opsz: 14 }))
  const icons = await buildUserAvatarIconCache(cacheDir, users, await avatarFont)
  icons.set(
    UNASSIGNED_ASSIGNEE_ID,
    Uri.joinPath(context.extensionUri, "resources", "images", "unassigned.svg"),
  )
  return icons
}
