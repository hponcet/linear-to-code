# Change Log

All notable changes to the "linear-to-code" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.


## [0.4.0] - 2026-09-29

### Added

- Added a Create Issue view, opened from **+** in the Issues view header or with `Cmd+K A` or `Cmd+K Cmd+A` (`Ctrl+K A` or `Ctrl+K Ctrl+A`). It matches the issue view and is pre-filled from the navigation: team, project, cycle, and yourself as assignee in My issues, with the team's default status. **Create Issue** is available once the issue has a title, a status, and a team; the form then closes and the new issue opens.
- Added table keyboard navigation in the editor: Enter at the end of the last cell adds a row and moves to its first cell, and Enter again in that still-empty row leaves the table with a new line below it. Enter at the start of the first cell adds a new line above the table. Backspace in an empty cell moves to the end of the previous cell, in the first column of an empty row removes the row, and in an empty first cell (or Delete) removes the table.

### Changed

- New workspaces now start on My issues in the current cycle instead of loading every issue in the workspace. An explicit All issues or any-cycle choice is still remembered.
- Open Issue for Current Branch now uses `Cmd+K B` or `Cmd+K Cmd+B` (`Ctrl+K B` or `Ctrl+K Ctrl+B`), and Search Linear Issues uses `Cmd+K S` or `Cmd+K Cmd+S` (`Ctrl+K S` or `Ctrl+K Ctrl+S`).
- In Cursor, keyboard shortcuts now start with Cursor's chord prefix instead of `Cmd+K` (`Ctrl+K`): `Cmd+R` on Mac and `Ctrl+M` on Windows/Linux. They no longer block Cursor's inline edit. VS Code keeps `Cmd+K` (`Ctrl+K`).
- Issue, Create Issue, Settings, Start Work, and navigation pages open faster. They load much less code up front, and an issue page starts fetching its data as soon as its tab opens.

### Fixed

- Focusing the labels picker no longer draws an outline around its search field.
- A space at the start or end of a table cell no longer disables Create Issue or blocks saving a description. The space is dropped on save, since Markdown tables can't keep it.
- An empty line or line break at the end of a description (after a heading or a checklist, a line of spaces, an empty heading, or Shift+Enter) no longer disables Create Issue or pauses description saving. It is dropped on save, since Markdown can't keep it.
- A space at the start or end of a heading or a list item, or just before a Shift+Enter line break, no longer disables Create Issue or pauses description saving. It is dropped on save, since Markdown can't keep it.
- Switching or reconnecting a Linear workspace no longer logs `NoTreeViewError` for the Issues view.
- Connect to Linear no longer fails with "command 'linearToCode.commands.refreshPullRequests' already exists" when a previous connection attempt failed while loading pull requests.

## [0.3.0] - 2026-09-29

### Added

- Added inline issue title editing in issue panels, with Enter/blur to save, Escape to cancel, and retry without losing edits when a save fails.

- Added an Unassigned option to the Workspace assignee filter, usable alone or alongside selected users.

- Added a searchable, multi-select Assignees filter to Workspace navigation, with removable user chips and selections saved per workspace and editor project.

- Added workspace, team, project, issue-view, cycle, and status navigation above the native issue tree, with searchable native pickers, per-editor-project filter restoration, and paginated issue loading.
- Added multiple workspace connections through Linear Connect, workspace-bound issue and Start Work panels, and a separate MCP server per organization.

- Added global Linear issue search from the My Issues and Current Cycle view header, with a keyboard shortcut.
- Added a shared, lossless Linear Markdown engine for issue descriptions, comments, replies, and sub-issues, including tables, checklists, details, images, Linear entity tags, file embeds, audio, video, code highlighting, and Mermaid diagrams.
- Added editable issue descriptions with validated autosave, persisted offline drafts, and upload support for Linear-hosted images and files.
- Added asynchronous editor suggestions for public Linear users, issues, projects, documents, cycles, and milestones.
- Added an image options menu offering View image, Download, Copy image, Copy link, and Delete.
- Added a grouped mention menu that mirrors Linear: a titled section per entity kind, member avatars, and each issue row showing its workflow-state icon, its identifier and its title.
- Added a hover card on every Linear reference — user, issue, project, document, cycle, milestone, view, and initiative — showing the resolved name plus its own details, such as status and priority for an issue or progress and lead for a project.

### Changed

- Match editor menus to the formatting toolbar with shared backgrounds, borders, black shadows, and subtle 6 px corner rounding.

- Left-align icons and labels in editor menu items.

- Added icons to every Workspace navigation picker, using a theme-colored team icon and preserving project icons and colors.

- Keep editable issue titles visually unchanged on hover and focus, without input borders or padding, and save without a visible loader that shifts the layout.

- Show workspace, team name, and issue identifier above the header in issue and Start Work panels.

- Improved initials avatars in native issue and pull request lists with crisp SVG outlines from the bundled Inter font and larger, consistently white lettering.

- Grouped active Workspace filters into Cycle, Statuses, and Assignees inside a section collapsed by default, using the same collapse animation, caret, cycle/status icons, and user avatars as issue panels.

- The issue tree now automatically loads all matching tickets, showing pages as they arrive instead of stopping at 100 issues and requiring Load more.

- Replaced the My Issues / Current Cycle toggle with All issues / My issues and independent cycle filters. Existing toggle shortcuts now open the issue-view picker.
- Migrated saved Linear credentials into organization-specific SecretStorage entries and removed access tokens from webview props.

- Editable label pickers now show "Add a label...", including beside selected labels.
- A Mermaid diagram now shows either its picture or its source, with an Edit diagram / View diagram switch in the top-right corner of the block, instead of stacking both. A diagram that fails to render keeps its source open, and a newly created one starts on its source.
- Clicking an issue reference now opens that issue in the extension instead of the browser; every other reference still opens on Linear.
- Unsupported or non-portable Markdown is now shown as escaped read-only source and blocked at the final Linear mutation boundary instead of being silently rewritten.
- Markdown links and media now enforce allowed URL protocols, while private Linear assets use authenticated playback and confirmed signatures are removed from the canonical document before saving.
- The editor command menu now opens on `/` anywhere in a line instead of only at its start, so every block command stays reachable without selecting text first.
- Table actions moved into the formatting toolbar as labelled icon buttons instead of a separate floating panel of text buttons, and file attachments now show a file icon with the name above a human-readable size.
- Every Linear reference now renders as the chip Linear itself draws inline: an issue shows the same workflow-state icon as the sidebar and the pickers, its identifier in muted text and its title; a project shows the shared project glyph, or its own emoji and colour when Linear stores one; a user mention stays plain coloured text. A reference Linear wrote as a bare URL shows the resolved entity name instead of its UUID or slug.

### Removed

- Removed the underline mark and its toolbar button because Linear has no Markdown representation for underline, so every underlined span was lost or shown as literal source once saved.

### Fixed

- Allow existing images and file attachments to be dragged within the editor without re-uploading them, preserving their content and undo history.

- Prevent file and image selections from being discarded when focus returns before the native file picker reports its result; use its explicit cancellation event instead.

- Send the required MIME type and cache headers with Linear file uploads, preserving any headers returned by Linear.
- Remove the blue selection outline from image upload blocks while keeping a neutral keyboard focus indicator.

- Give the editor's image options menu an opaque, theme-aware surface matching the other editor menus.

- Draw editor blockquote bars as an opaque, theme-aware border (the contrast border in high-contrast themes) so quote content spans the full width minus the bar; the bar was previously near-white in every theme.

- Fixed wide images, including screenshots inside blockquotes, overflowing the editor by a few pixels and showing a horizontal scrollbar.

- Reduced editor image corner rounding from 20 px to 6 px, matching the other editor surfaces.

- Fixed selection and focus rings on full-width editor components (images, code blocks, videos, file cards) being cut off by the editor edge; they are now drawn inside the component.

- Clicking a file attachment in the editor now selects it, like an image, instead of downloading it; downloading is done from its download button.

- Replaced the gray question-mark avatar for unassigned issues in native lists with Linear's Unassigned icon, matching issue panels.

- Kept the existing issue tree visible during manual and automatic refreshes, with native view progress and a single update after all pages load. Failed refreshes preserve the previous list.

- Fixed repeated statuses from the first teams dominating the Workspace status filter by avoiding duplicate accumulation of Linear SDK pages. Each status keeps its own team label.

- Fixed Duplicate workflow states showing a question mark by adding their SVG icon to issue panels, status pickers, references, history, and the native issue tree.

- Prevented stale issue pages and invalidated in-flight cache entries from replacing newer navigation results. Ticket changes now recheck membership in the current API-filtered list.

- Fixed assigned labels and label choices disappearing from issue details and Start Work when an issue belongs to a project.
- Fixed editor menus, floating toolbars, hover cards, and tooltips showing light shadows on dark themes by using black shadow colors.
- Fixed a project or document reference making a whole description read-only, because their Linear entity tags were parsed as raw HTML.
- Fixed an invalid Mermaid diagram leaving Mermaid's own "Syntax error" graphic stuck at the bottom of the webview, outside the code block that reports the error.
- Fixed uploaded Linear videos showing as a plain link instead of a player when Linear serialises them as a Markdown link, since their asset URL carries no file extension and only the label names the format; when Linear labelled the link after the asset URL itself, the downloaded media type decides between the player and a link.
- Fixed YouTube and Loom videos that Linear stores as an unnamed link showing as a plain link instead of a player, while named links keep their link rendering.
- Fixed private Linear images, audio, video, and files failing to load because authenticated asset requests were blocked by webview CORS.
- Fixed all issue webviews appearing blank when production builds and development webview bundles were generated by overlapping build tasks, and isolated their assets to prevent missing runtime chunks.
- Fixed invalid local description drafts hiding the saved Linear issue content, with an explicit recovery action that preserves the draft until it is discarded.
- Fixed issue webviews rendering an empty error state because editor state changes, nested toolbar triggers, and Bubble Menu options caused React update loops.
- Fixed valid Linear Markdown becoming read-only for indented list continuations, inline code containing backticks, empty headings, HTML comments, Figma and placeholder embeds, untitled media, legacy superscript content, and Markdown syntax in details summaries.
- Fixed Linear-signed attachment links and the server-canonical legacy superscript form becoming read-only after a live save and reload.
- Fixed bold, italic, strikethrough, code, and link formatting being unreachable while the cursor was inside a table, where the table controls replaced the formatting toolbar entirely.
- Fixed Markdown in collapsible section summaries rendering as literal source instead of formatted text.
- Fixed code blocks rendering without syntax colours because the highlight palette used theme variables that fall back to the plain body colour, and tightened their padding and block spacing.
- Fixed the Date command inserting nothing when the pre-selected current date was confirmed, because the picker was pre-filled with today and emitted no change event.
- Fixed ordinary text containing `++` being turned into an underlined span when loaded from Linear.
- Fixed every formatting toolbar dropdown closing the toolbar and opening in the top-left corner of the webview instead of under its own button, and long menus are now scrollable so they never overflow the view.
- Fixed toolbar dropdowns closing again the moment they were opened from the keyboard, because the toolbar pulled focus back out of the open menu.
- Fixed images rendering flush left with a selection ring stretched across the whole editor width; they are now centred and the ring hugs the picture.
- Fixed file, audio, video, and Figma embeds falling back to a plain link whenever Linear's Markdown escaper had escaped a character inside the embed payload, which happens to almost every asset signature because they are base64url and contain underscores.
- Fixed uploaded attachments showing as a plain link instead of a file card when Linear serialises them as a Markdown link rather than an embed, matching the handling audio and video already had; a link whose label is not a file name still renders as a link.
- Fixed clicking a file attachment doing nothing, because ProseMirror suppresses a link's own navigation inside a node view; the download is now triggered explicitly.
- Fixed selected images, attachments, media, code blocks, and mentions showing no selection ring at all, since the editor's own rules blanked the outline and skipped React node views.
- Fixed heading levels 5 and 6 rendering larger than levels 3 and 4 because they were never styled, and replaced the uneven 3em/2.5em/2em heading spacing with a uniform rhythm.
- Fixed the first heading of every level losing its top margin: the rule used `:first-of-type`, which matches once per level rather than once per document.
- Fixed a collapsible section whose summary is a heading showing the `###` marker as literal text; the summary now renders as a heading and the marker still round-trips to Linear.

## [0.1.1] - 2026-06-19

### Removed

- Removed temporary development Linear API call logging (`[Linear API]` console warnings)

### Changed

- Renamed the extension from **Linear Manager** to **Linear to Code** (`hpon.linear-to-code`); command, view, setting, and MCP identifiers now use the `linearToCode` prefix
- Renamed checkout actions to "Switch to branch" and "Switch to source branch" across commands, buttons, and error messages

### Fixed

- Prefix-by-label settings plus button now adds a draft row without immediately resetting the list from saved settings
- Prefix-by-label settings label picker now loads all workspace issue and project labels instead of only the current issue team
- Linear label pagination now follows `fetchNext` so workspace label lists include labels beyond the first API page
- Prefix-by-label settings rows stay visible while choosing a label before entering a branch prefix
- Activity timeline icons now mask the breadcrumb line with the VS Code editor background
- Webview colors now follow VS Code and Cursor light and dark themes
- Start Work action buttons now use VS Code button colors with consistent padding and spacing
- Unified app buttons on RSuite sizing with VS Code theme colors via shared button tokens
- Header and toolbar icon buttons no longer show a filled background at rest

## [0.1.0] - 2026-06-14

### Added

- My Issues tree hover actions: create pull request (when a branch is configured) and open on Linear
- `get_issue_comments` MCP tool to load Linear issue discussion threads for Cursor agents
- `{{editorLanguage}}` placeholder in agent prompt templates (resolved from the editor UI language)
- Settings gear buttons in the My issues and Pull requests tree view headers open Settings on the Workflow and Git tabs respectively
- **Start work with agent** (Cursor only): sidebar context action and Start Work option to open Cursor Composer with a minimal prompt; a bundled **Linear to Code MCP server** exposes issue, related-issue, pull request, and diff tools
- **Review with agent** (Cursor only): pull request context action that opens Cursor Composer to review the PR diff via MCP and suggest improvements
- `@` user mentions with autocomplete in issue comments, replies, and sub-issue descriptions
- Pull requests sidebar view listing open PRs for the current repository via the connected git provider
- Git provider configuration (GitHub, GitLab, Bitbucket Cloud) in Git Settings with OAuth
- Create/View pull request actions when an issue branch is configured, with VS Code Quick Pick to choose the target branch before opening the compare page
- Cursor agent rules for communication, feature testing, and changelog maintenance
- Unit and integration test scaffolding with example branch and extension tests
- `linearToCode.autoRefreshIntervalSeconds` setting (default 180s, 0 to disable)
- `LinearService` facade with TTL cache, request deduplication, and centralized invalidation

### Fixed

- Replaced the broken pull request header icon with the VS Code `git-pull-request-create` codicon
- My Issues checkout hover button now uses the same icon as the issue header checkout action
- Settings tree view gear buttons now switch tabs when Settings is already open
- Fixed Start work with agent and Review with agent opening an empty Composer tab by pasting the generated prompt after `composer.newAgentChat` opens (Cursor does not accept a `{ prompt }` command argument)
- Fixed MCP pull request tools failing with "Git remote is not configured" by resolving origin from git when building server env, refreshing env when the repository becomes active, and preferring local git diffs when sourceBranch and targetBranch are provided
- Fixed extension failing to activate on Cursor versions below VS Code 1.120 by restoring the `engines.vscode` minimum while keeping MCP registration guarded at runtime
- Fixed "Trying to add a disposable to a DisposableStore that has already been disposed" when reconnecting Linear or reloading the extension by tracking view-owned disposables separately from extension subscriptions and guarding async initialization after deactivate
- Fixed extension reconnect leaving My Issues assignee icons and the Pull requests sidebar empty by fully disposing tree views and command registrations before re-initializing
- GitHub Sign out in Settings now updates the connection UI instead of staying connected while the VS Code GitHub session remains active
- Bitbucket HTTP access tokens now authenticate with Basic auth (Atlassian email + token) instead of Bearer, matching Atlassian API requirements
- Refreshed the issue tree view when an issue assignee changed, including icon, tooltip, and list membership in My Issues and Current Cycle

### Changed

- Persisted My Issues tree view expand/collapse state per workspace and view mode
- Split webview bundles per panel (issue, settings, startWork) so each panel loads only its own JS/CSS
- Git provider setup instructions now include clickable links to external pages (API token creation, OAuth setup, documentation)
- Issue and pull request review agent prompts now load issue comments via MCP and ask the agent to respond in the editor language
- Pull request review agent prompt now asks for clear, concise feedback with code excerpts and proposed fixes
- Start Work shows a **Start work with agent** button after branch setup instead of a toggle during branch creation
- Reworked Settings layout with expandable RSuite panels, clearer title hierarchy, flatter sidebar tabs without borders, unified accordion header hover, and VS Code–aligned styling
- Settings opens on the Workflow tab by default and lists Workflow first in the sidebar
- Start work with agent and Review with agent prompts now instruct the agent to load the Linear ticket via MCP first, then implement (or fix PR gaps against the linked issue) instead of stopping at planning
- Added a **Work with agent** settings tab to customize issue and pull request review prompt templates with placeholders
- Pull requests sidebar items open the linked Linear issue on click (or the PR on the web when no ticket is found), show the linked assignee icon from My Issues when a ticket is found, and expose diff / checkout / web PR actions in the context menu with inline diff and web buttons on hover
- Bitbucket Git Settings now default to HTTP access tokens (Atlassian account) with step-by-step setup; OAuth consumer flow documents the correct workspace settings path instead of personal settings
- Provider connection panel collapses when signed in, showing only status and Sign out until expanded
- Reworked Git Settings layout with a dedicated provider connection panel, collapsible setup instructions, and a separate branch & workflow section
- Git Settings form fields use bordered input controls and a distinct credentials panel, separate from setup instructions
- Improved Git Settings OAuth UX with provider-specific Sign in buttons, redirect URI copy, and setup instructions
- Post-change verification now includes `npm run test` alongside typecheck and lint
- Reduced Linear API usage: slower TreeView auto-refresh with pause on window blur, visibility refetch guard, mutation sync without redundant fetches, lazy issue history pagination, lightweight Start Work context, and shared metadata cache in the extension host
- Centralized all Linear API access through `LinearService` in the extension host; webviews now use IPC instead of per-panel SDK clients

### Removed

- `linearToCode.launchAgentAfterStartWork` workspace setting and the automatic agent launch toggle from Start Work
- Temporary Linear API call logging in development (`LinearApiLogger`)
