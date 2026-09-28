import { makeid } from "src/utils/makeid"
import { ExtensionContext, ExtensionMode, Uri, Webview } from "vscode"

export function getWebviewScriptPolicy(
  cspSource: string,
  nonce: string,
  extensionMode: ExtensionMode,
): string {
  return extensionMode === ExtensionMode.Production
    ? `${cspSource} 'nonce-${nonce}'`
    : `${cspSource} 'unsafe-eval'`
}

export function getWebviewAssetDirectory(extensionMode: ExtensionMode): string {
  return extensionMode === ExtensionMode.Production ? "dist" : "dist-webviews-dev"
}

export function getWebviewContent(
  context: ExtensionContext,
  webview: Webview,
  viewId: string,
): string {
  const assetDirectory = getWebviewAssetDirectory(context.extensionMode)
  const scriptSrc = webview.asWebviewUri(
    Uri.joinPath(context.extensionUri, assetDirectory, `${viewId}.js`),
  )

  const styleSrc = webview.asWebviewUri(
    Uri.joinPath(context.extensionUri, assetDirectory, `${viewId}.css`),
  )

  const font = webview.asWebviewUri(
    Uri.joinPath(context.extensionUri, "resources", "Inter-VariableFont.ttf"),
  )

  const fontItalic = webview.asWebviewUri(
    Uri.joinPath(context.extensionUri, "resources", "Inter-Italic-VariableFont.ttf"),
  )

  const nonce = makeid(16)
  const styleLink =
    context.extensionMode === ExtensionMode.Production
      ? `<link rel="stylesheet" type="text/css" href="${styleSrc}" nonce="${nonce}" />`
      : ""

  return `<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta
          http-equiv="Content-Security-Policy"
          content="default-src 'self' ${
            webview.cspSource
          } https://*.linear.app; img-src 'self' https: blob: data:; media-src 'self' ${
            webview.cspSource
          } https://linear.app https://*.linear.app https://storage.googleapis.com https://www.youtube.com https://www.loom.com blob: data:; frame-src ${
            webview.cspSource
          } https://www.youtube.com https://www.youtube-nocookie.com https://www.loom.com; script-src ${getWebviewScriptPolicy(
            webview.cspSource,
            nonce,
            context.extensionMode,
          )} https://www.youtube.com; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src ${
            webview.cspSource
          } data: https:; style-src-elem 'self' 'unsafe-inline' ${webview.cspSource}; connect-src ${
            webview.cspSource
          } https://linear.app https://*.linear.app ws://*.linear.app https://storage.googleapis.com https://cdn.jsdelivr.net/npm/emojibase-data@latest/en/data.json https://cdn.jsdelivr.net/npm/emojibase-data@latest/en/messages.json"
        />
       
        <meta id="webview" name="webview" content="${viewId}" />
        ${styleLink}
        <style nonce="${nonce}">
          @font-face {
            font-family: "Inter Variable";
            src: url("${font}") format("truetype-variations");
            font-weight: 100 900;
            font-style: normal;
            font-display: swap;
          }

          @font-face {
            font-family: "Inter Variable";
            src: url("${fontItalic}") format("truetype-variations");
            font-weight: 100 900;
            font-style: italic;
            font-display: swap;
          }
        </style>
        <base href="${Uri.joinPath(context.extensionUri, "resources").toString()}/" />
      </head>
      <body>
        <noscript>You need to enable JavaScript to run this app.</noscript>
        <div id="root"></div>
        <script src="${scriptSrc}" nonce="${nonce}"></script>
      </body>
    </html>
    `
}
