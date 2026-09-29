import moment from "moment"
import { ReactNode } from "react"
import * as ReactDOM from "react-dom/client"

import { WebviewRoot } from "./WebviewRoot"

import "./styles/index.scss"

moment.updateLocale("en", {
  relativeTime: {
    future: "in %s",
    past: "%s ",
    s: "%ds ago",
    m: "%dmin ago",
    mm: "%dmin ago",
    h: "%dh ago",
    hh: "%dh ago",
    d: "%dd ago",
    dd: "%dd ago",
    M: "%dmo ago",
    MM: "%dmo ago",
    y: "%dy ago",
    yy: "%dy ago",
  },
})

export function mountWebview(content: ReactNode): void {
  const root = document.getElementById("root")
  if (!root) {
    throw new Error("Webview root element was not found.")
  }

  const reactRoot = ReactDOM.createRoot(root)
  reactRoot.render(<WebviewRoot>{content}</WebviewRoot>)
}
