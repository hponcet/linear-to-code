export const IS_PRODUCTION = process.env.NODE_ENV !== "development"

export enum Views {
  navigation = "linearToCode.views.navigation",
  myIssues = "linearToCode.views.myIssues",
  pullRequests = "linearToCode.views.pullRequests",
}

export enum Webviews {
  issueWebview = "issue",
  startWorkWebview = "startWork",
  settingsWebview = "settings",
}

export enum Commands {
  connect = "linearToCode.connect",
  disconnect = "linearToCode.disconnect",
  openIssue = "linearToCode.commands.openIssue",
  openIssueExternal = "linearToCode.commands.openIssueExternal",
  openCurrentBranchIssue = "linearToCode.commands.openCurrentBranchIssue",
  startWork = "linearToCode.commands.startWork",
  startWorkWithAgent = "linearToCode.commands.startWorkWithAgent",
  reviewPullRequestWithAgent = "linearToCode.commands.reviewPullRequestWithAgent",
  configureBranch = "linearToCode.commands.configureBranch",
  checkoutIssue = "linearToCode.commands.checkoutIssue",
  reconnectWorkspace = "linearToCode.commands.reconnectWorkspace",
  refresh = "linearToCode.commands.refresh",
  toggleViewMode = "linearToCode.commands.toggleViewMode",
  searchIssues = "linearToCode.commands.searchIssues",
  openPullRequest = "linearToCode.commands.openPullRequest",
  openSettings = "linearToCode.commands.openSettings",
  openSettingsTab = "linearToCode.commands.openSettingsTab",
  refreshPullRequests = "linearToCode.commands.refreshPullRequests",
  openPullRequestDiff = "linearToCode.commands.openPullRequestDiff",
  openPullRequestLinkedIssue = "linearToCode.commands.openPullRequestLinkedIssue",
  openPullRequestUrl = "linearToCode.commands.openPullRequestUrl",
  checkoutPullRequestBranch = "linearToCode.commands.checkoutPullRequestBranch",
}
