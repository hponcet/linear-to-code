import { ReactNode } from "react"
import * as ReactDOM from "react-dom/client"

import { WebviewRoot } from "./WebviewRoot"

import "./styles/index.scss"

export function mountWebview(content: ReactNode): void {
  const root = document.getElementById("root")
  if (!root) {
    throw new Error("Webview root element was not found.")
  }

  const reactRoot = ReactDOM.createRoot(root)
  reactRoot.render(<WebviewRoot>{content}</WebviewRoot>)
}
