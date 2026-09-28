import { useEffect, useState } from "react"
import { GlobalListenerMessage, Props } from "src/types/ActionMessage"
import { Container } from "src/webviews/components/Container/Container"
import { IssueContextProvider } from "src/webviews/contexts/IssueContext"
import { useProps } from "src/webviews/hooks/useProps"

import { resolveSettingsTabFromRequest } from "./settingsTabRequest"
import { DEFAULT_SETTINGS_TAB, SettingsTab, SettingsView } from "./SettingsView"

export function SettingsWebview() {
  const [initialProps, loaded] = useProps<"settings">()
  const [props, setProps] = useState<Props["settings"]>(initialProps)
  const [activeTab, setActiveTab] = useState<SettingsTab>(DEFAULT_SETTINGS_TAB)

  useEffect(() => {
    if (loaded) {
      setProps(initialProps)
    }
  }, [loaded, initialProps])

  useEffect(() => {
    setActiveTab((currentTab) =>
      resolveSettingsTabFromRequest(currentTab, props.tabRequestId, props.initialTab),
    )
  }, [props.tabRequestId, props.initialTab])

  useEffect(() => {
    function handleMessage(event: MessageEvent<GlobalListenerMessage>) {
      if (event.data.action === "settingsPropsUpdate") {
        setProps(event.data.payload)
      }
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [])

  const { issueId, connection } = props

  if (!loaded) {
    return <Container loading={true} />
  }

  const content = <SettingsView activeTab={activeTab} onActiveTabChange={setActiveTab} />

  if (issueId && connection) {
    return (
      <Container loading={false}>
        <IssueContextProvider issueId={issueId} connection={connection}>
          {content}
        </IssueContextProvider>
      </Container>
    )
  }

  return <Container loading={false}>{content}</Container>
}
