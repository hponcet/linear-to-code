# Linear to Code

Unofficial [Linear](https://linear.app) extension for VS Code and Cursor. Manage issues, branches, pull requests, and agent workflows without leaving the editor.

## Features

### Issues and workflow

- Connect multiple Linear workspaces through Linear Connect and switch from the navigation header
- Browse **All issues** or **My issues**, scoped to a team, a project, cycles, statuses, and one or more assignees
- Search all issues in the active Linear workspace from the **Issues** view header
- Open issues in a rich React panel (TipTap editor, comments, sub-issues, attachments, history)
- Drag and drop issues from the tree view to open them
- Move issues between workflow states via drag and drop (multi-select supported)
- Persisted expand/collapse state for teams and workflow columns
- Assignee avatar icons in the tree view
- Inline hover actions on issues:
  - **Start work** or **Switch to branch** (when a branch is configured)
  - **Create pull request** (when a branch exists and a git provider is connected)
  - **Open on Linear**

### Git and pull requests

- Start Work flow: create or bind a branch, update issue state/cycle, optional stash
- Git provider settings for **GitHub**, **GitLab**, and **Bitbucket Cloud** (OAuth or API token)
- **Pull requests** sidebar: open linked issues, diff, switch to source branch, open on the web
- Create or open pull requests from issue branches (target branch picker)

### Settings

- **Workflow**: branch naming, prefixes, stash-before-create, auto-refresh interval
- **Git**: provider connection, credentials, setup instructions with clickable links
- **Work with agent** (Cursor): customizable prompt templates with placeholders

### Cursor agent integration (Cursor only)

- **Start work with agent**: open Composer with a prompt that loads the Linear ticket via MCP
- **Review with agent**: review a PR diff with linked-issue context via MCP
- Bundled **Linear to Code MCP server** (issues, comments, related issues, PR metadata, diffs)
- Agent prompts support `{{editorLanguage}}` and instruct the agent to respond in the editor UI language

## Prerequisites

- VS Code **1.105.0** or higher (including Cursor)
- [Linear Connect](https://marketplace.visualstudio.com/items?itemName=linear.linear-connect) extension
- Git extension (`vscode.git`, usually built-in)

## Installation

1. Install **Linear to Code** from the marketplace (or load the VSIX in development)
2. Reload the window
3. Open the Linear activity bar view and run **Connect to Linear**

## Usage

### Connect and browse

1. Open **Linear to Code** in the activity bar
2. Run **Connect to Linear** if you are not authenticated
3. Select a workspace, **All teams** or a team, and **All projects**, **No project**, or a project in the navigation header
4. A new workspace starts on **My issues** in the current cycle. Choose **All issues** or **My issues**, and open **Filters** for a current, specific, or missing cycle, multiple statuses, or **Assignees**. Search assignees by name or email and select one or more people to show tickets assigned to any of them. Confirming the assignee picker switches to **All issues**; choosing **My issues** clears custom assignees. Leave the selection empty to include all assignees. Remove individual filter chips to broaden the list
5. The native issue tree automatically loads every matching issue in batches of 100. Tickets appear as each page arrives; the tree indicates loading progress until the full list is available

Each selector opens the editor's searchable, keyboard-accessible Quick Pick. Selecting a team limits the available projects; **All teams** includes cross-team projects. Cycle and status choices follow the selected team's or project's teams. Refresh reloads accessible data and removes filters that no longer apply. Initiatives, milestones, and workflow configuration are outside this navigation.

Expand **Active filters** below the selectors to see filters grouped by Cycle, Statuses, and Assignees, with their issue-panel icons and avatars. This section starts collapsed; each chip has its own remove button. In the assignee picker, select **Unassigned** to show tickets without an assignee, either alone or alongside selected users.

The active workspace and each workspace's filters are saved per editor project, independently of other windows. Open issue and Start Work panels keep their original workspace (shown in the panel), drafts, comments, references, and agent actions when you switch. Each connected workspace has its own named MCP server; agent prompts include that workspace and server identity.

### Add, reconnect, or disconnect a workspace

Use the workspace menu for **Connect workspace...**, **Reconnect**, or **Disconnect workspace**. Existing connections remain available while adding another; switching between saved workspaces does not sign out. Disconnect removes only that workspace's saved credential. Its open panels and drafts remain available and can resume after reconnection.

Authentication continues to use `linear.linear-connect` and `authentication.getSession("linear", ["read", "write"])`. Tokens stay in the editor's SecretStorage; webviews receive connection metadata only. The previous single connection migrates automatically after its organization and user have been verified.

**Linear Connect 1.0.3 limitation:** its provider exposes only one shared session and reuses it when signing in. Adding or reconnecting calls its public `linear-connect.logout` command before requesting a session again. The plugin explains this reset, which also affects other extensions sharing Linear Connect, and keeps its existing saved workspace credentials. Choose the intended workspace during authorization; reconnecting rejects a different organization. Cancelling or failing authorization leaves the active navigation unchanged. This provider exposes no usable automatic token refresh: reconnect when a credential expires. See the [Linear Connect authentication provider](https://github.com/linear/linear-vscode-connect-extension/blob/main/src/LinearAuthenticationProvider.ts).

### Work on an issue

- **Open**: click an issue, use the context menu, or drag it to the editor
- **Start work**: create/configure a Git branch from the context menu or inline play button
- **Switch to branch**: switch to the issue branch (inline button when a branch is configured)
- **Create pull request**: inline button when a branch and git provider are configured
- **Open on Linear**: inline external-link button or context menu

### Pull requests view

When a git provider is connected for the current repository:

- Lists open pull requests for the origin remote
- Click a row to open the linked Linear issue (or the PR on the web)
- Inline actions: review with agent (Cursor), open diff, switch to branch, open on web

### Keyboard shortcuts

| Shortcut                                                                     | Command                       | Description                                         |
| ---------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------- |
| `Cmd+K I` or `Cmd+K Cmd+I` (Mac) / `Ctrl+K I` or `Ctrl+K Ctrl+I` (Win/Linux) | Open Issue for Current Branch | Open the Linear issue for the current Git branch    |
| `Cmd+K L` or `Cmd+K Cmd+L` (Mac) / `Ctrl+K L` or `Ctrl+K Ctrl+L` (Win/Linux) | Search Linear Issues          | Search all issues in the connected Linear workspace |

In Cursor, these shortcuts start with `Cmd+R` (Mac) / `Ctrl+R` (Win/Linux) instead, following Cursor's chord prefix and leaving `Cmd+K` / `Ctrl+K` to Cursor's inline edit. For example, use `Cmd+R L` to search Linear issues.

### Commands (selection)

| Command                          | Description                                            |
| -------------------------------- | ------------------------------------------------------ |
| Connect / Disconnect from Linear | Authenticate or sign out                               |
| Open Issue                       | Open issue in the editor panel                         |
| Search Linear Issues             | Search all issues in the connected Linear workspace    |
| Open on Linear                   | Open issue in the browser                              |
| Start work on issue              | Branch setup workflow                                  |
| Start work with agent            | Launch Cursor Composer with issue MCP context (Cursor) |
| Switch to branch                 | Switch to the issue branch                             |
| Create pull request              | Open provider compare/create flow                      |
| Review with agent                | Review PR with MCP context (Cursor)                    |
| Refresh / Select Issue View      | Reload data or choose All issues / My issues           |
| Open settings                    | Workflow, Git, and agent prompt settings               |

## Project structure

```
src/
├── extension.ts              # Activation entry point
├── controller.ts             # Extension lifecycle and services
├── linear/                   # LinearService, API, caching
├── git/                      # Git client, branch checkout, diffs
├── gitProviders/             # GitHub, GitLab, Bitbucket integrations
├── mcp/                      # Bundled Linear to Code MCP server
├── cursor/                   # Agent prompts, Cursor detection, MCP registration
├── panels/                   # Webview panels (issue, start work, settings)
├── views/
│   ├── NavigationView.ts     # Workspace, team, project, and filter selectors
│   ├── myIssues/             # Native issue tree and workspace-bound panels
│   └── pullRequests/         # Pull requests tree view
├── webviews/                 # React UI (issue panel, settings, start work)
└── test/                     # Unit and integration tests
```

## Development

### Install

```bash
npm install
```

### Watch mode

```bash
npm run watch
```

Press **F5** to launch an Extension Development Host.

### Build

```bash
npm run package
```

### Verification

```bash
npm run check:types && npm run lint && npm run test
```

When CSS/SCSS files change, also run:

```bash
npm run lint:styles
```

Or run everything:

```bash
npm run lint:all
```

### Scripts

| Script                    | Description                           |
| ------------------------- | ------------------------------------- |
| `npm run watch`           | Extension + webview rebuild on change |
| `npm run compile`         | Compile extension host                |
| `npm run package`         | Production webpack build              |
| `npm run check:types`     | TypeScript check                      |
| `npm run lint`            | ESLint                                |
| `npm run lint:styles`     | Stylelint (CSS/SCSS)                  |
| `npm run lint:all`        | ESLint + Prettier + Stylelint         |
| `npm run test`            | Unit and integration tests            |
| `npm run analyze:webview` | Webpack bundle analysis (webview)     |

## Tech stack

- **Extension host**: TypeScript, VS Code Extension API, Linear SDK, Simple Git
- **Webviews**: React, TipTap, RSuite, Sass
- **Build**: Webpack, Fork TS Checker
- **Quality**: ESLint, Stylelint, Prettier, Mocha + `@vscode/test-electron`

## Contributing

Contributions are welcome. Please open an issue or PR on [GitHub](https://github.com/hponcet/linear-to-code).

Before submitting:

1. Run `npm run check:types && npm run lint && npm run test` (and `npm run lint:styles` if you changed styles)
2. Add tests for testable logic changes
3. Update [CHANGELOG.md](./CHANGELOG.md) for user-visible features and fixes

## License

MIT

## Issues

Report bugs or request features on [GitHub Issues](https://github.com/hponcet/linear-to-code/issues).
