import * as assert from "assert"
import { readFileSync } from "fs"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"

import { create } from "fontkit"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ExtensionContext, Uri } from "vscode"

import {
  buildUserAvatarIconCacheForContext,
  buildUserAvatarIconCache,
  buildUserAvatarSvg,
  deriveUserInitials,
  resolveAssigneeIconInfo,
  UNASSIGNED_ASSIGNEE_ID,
  writeUserAvatarIcon,
} from "../../utils/userAvatarIcon"
import { createIssueTreeItem } from "../../views/myIssues/treeItems"
import { Issue } from "../../views/myIssues/types"
import { UserAvatar } from "../../webviews/components/UserAvatar/UserAvatar"

import type { Font } from "fontkit"

const extensionRoot = path.resolve(__dirname, "../../..")
const font = (
  create(readFileSync(path.join(extensionRoot, "resources", "Inter-VariableFont.ttf"))) as Font
).getVariation({ wght: 600, opsz: 14 })

suite("userAvatarIcon", () => {
  test("renders self-contained Inter outlines with white text and Unicode initials", () => {
    const svg = buildUserAvatarSvg("HP", "#5e6ad2", font)
    assert.match(svg, /width="16" height="16" viewBox="0 0 20 20"/)
    assert.ok(svg.includes(font.glyphForCodePoint("H".codePointAt(0)!).path.toSVG()))
    assert.match(svg, /<g fill="#ffffff"/)
    assert.doesNotMatch(svg, /<text|<image|font-family|data:|NaN|Infinity/)
    for (const background of ["#fff", "#f8dc7c", "#000000"]) {
      assert.match(buildUserAvatarSvg("IL", background, font), /<g fill="#ffffff"/)
    }
    assert.strictEqual(
      buildUserAvatarSvg("ÉA", "#fff", font),
      buildUserAvatarSvg("E\u0301A", "#fff", font),
    )
    assert.notStrictEqual(
      buildUserAvatarSvg("ÉA", "#fff", font),
      buildUserAvatarSvg("?A", "#fff", font),
    )
    assert.strictEqual(
      buildUserAvatarSvg("MWMORE", "#fff", font),
      buildUserAvatarSvg("MW", "#fff", font),
    )
    assert.doesNotMatch(buildUserAvatarSvg(" ", "#fff", font), /NaN|Infinity|<path/)
    const unsafe = buildUserAvatarSvg("<script>", '#fff"/><script/>', font)
    assert.doesNotMatch(unsafe, /<script/)
    assert.match(unsafe, /fill="#5e6ad2"/)
  })

  test("writes SVG avatars and changes their URI when initials or color change", async () => {
    const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "linear-avatar-test-"))
    try {
      const icons = await buildUserAvatarIconCache(
        cacheDir,
        [{ id: "../user-1", initials: "HP", avatarBackgroundColor: "#ff0000" } as never],
        font,
      )
      const icon = icons.get("../user-1")
      assert.ok(icon)
      assert.strictEqual(icon.scheme, "file")
      assert.strictEqual(path.dirname(icon.fsPath), cacheDir)
      assert.ok(icon.fsPath.endsWith(".svg"))
      assert.strictEqual(
        await fs.readFile(icon.fsPath, "utf8"),
        buildUserAvatarSvg("HP", "#ff0000", font),
      )
      const changed = await writeUserAvatarIcon(cacheDir, "../user-1", { initials: "AB" }, font)
      const recolored = await writeUserAvatarIcon(cacheDir, "../user-1", { initials: "HP" }, font)
      assert.notStrictEqual(changed?.fsPath, icon.fsPath)
      assert.notStrictEqual(recolored?.fsPath, icon.fsPath)
      assert.strictEqual(
        await writeUserAvatarIcon(cacheDir, "blank", { initials: " " }, font),
        undefined,
      )
      assert.ok(!icons.has(UNASSIGNED_ASSIGNEE_ID))
    } finally {
      await fs.rm(cacheDir, { recursive: true, force: true })
    }
  })

  test("uses Linear's Unassigned SVG in the issue tree instead of a generated avatar", async () => {
    const storagePath = await fs.mkdtemp(path.join(os.tmpdir(), "linear-unassigned-test-"))
    try {
      const context = {
        globalStorageUri: Uri.file(storagePath),
        extensionUri: Uri.file(path.resolve(__dirname, "../../..")),
      } as ExtensionContext
      const icons = await buildUserAvatarIconCacheForContext(context, [])
      const icon = icons.get(UNASSIGNED_ASSIGNEE_ID)
      assert.ok(icon)
      assert.ok(icon.fsPath.endsWith("unassigned.svg"))

      const svg = await fs.readFile(icon.fsPath, "utf8")
      const markup = renderToStaticMarkup(createElement(UserAvatar, { user: null, size: 16 }))
      const paths = (value: string) => [...value.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1])
      assert.strictEqual(paths(svg).length, 7)
      assert.deepStrictEqual(paths(svg), paths(markup))
      assert.match(svg, /viewBox="0 0 16 16"/)
      assert.deepStrictEqual(await fs.readdir(path.join(storagePath, "user-avatar-icons")), [])

      const item = createIssueTreeItem(
        { id: "issue-1", identifier: "TEST-1", title: "Unassigned issue" } as Issue,
        undefined,
        icon,
      )
      assert.deepStrictEqual(item.iconPath, { light: icon, dark: icon })
    } finally {
      await fs.rm(storagePath, { recursive: true, force: true })
    }
  })

  test("deriveUserInitials falls back to display name", () => {
    assert.strictEqual(
      deriveUserInitials({
        initials: null,
        displayName: "Hugues Poncet",
        name: "Hugues Poncet",
      } as never),
      "HP",
    )
  })

  test("resolveAssigneeIconInfo returns defaults for missing background color", () => {
    const iconInfo = resolveAssigneeIconInfo({ initials: "ab" })

    assert.deepStrictEqual(iconInfo, {
      initials: "ab",
      avatarBackgroundColor: "#5e6ad2",
    })
  })

  test("resolveAssigneeIconInfo returns undefined when initials are missing", () => {
    assert.strictEqual(resolveAssigneeIconInfo(undefined), undefined)
    assert.strictEqual(resolveAssigneeIconInfo({ initials: "  " }), undefined)
  })
})
