export const MAX_LINEAR_FILE_SIZE = 10 * 1024 * 1024

export function openFilePicker(
  input: Pick<HTMLInputElement, "value" | "oncancel" | "click">,
  onCancel: () => void,
): void {
  input.value = ""
  // Window focus can return before the browser delivers the selected files.
  input.oncancel = onCancel
  input.click()
}

type UploadApi = {
  uploadLinearFile: (request: {
    uploadId: string
    name: string
    mimeType: string
    size: number
    base64: string
  }) => Promise<{ assetUrl: string }>
  cancelLinearFileUpload: (uploadId: string) => Promise<{ cancelled: boolean }>
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"))
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Failed to encode file"))
        return
      }
      resolve(reader.result.slice(reader.result.indexOf(",") + 1))
    }
    reader.readAsDataURL(file)
  })
}

function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(new DOMException("Upload cancelled", "AbortError"))

  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort)
      reject(new DOMException("Upload cancelled", "AbortError"))
    }

    signal.addEventListener("abort", abort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener("abort", abort)
        reject(error)
      },
    )
  })
}

export async function uploadFileToLinear(
  file: File,
  api: UploadApi,
  onProgress?: (event: { progress: number }) => void,
  signal?: AbortSignal,
): Promise<string> {
  if (!file.name.trim()) throw new Error("File name is required")
  if (file.size <= 0 || file.size > MAX_LINEAR_FILE_SIZE) {
    throw new Error("Files must be between 1 byte and 10 MB")
  }
  if (signal?.aborted) throw new DOMException("Upload cancelled", "AbortError")

  const uploadId = crypto.randomUUID()
  const cancel = () => {
    void api.cancelLinearFileUpload(uploadId).catch(() => undefined)
  }
  signal?.addEventListener("abort", cancel, { once: true })

  try {
    onProgress?.({ progress: 5 })
    const base64 = await readFileAsBase64(file)
    if (signal?.aborted) throw new DOMException("Upload cancelled", "AbortError")

    onProgress?.({ progress: 20 })
    let result: { assetUrl: string }
    try {
      result = await raceWithAbort(
        api.uploadLinearFile({
          uploadId,
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          base64,
        }),
        signal,
      )
    } catch (error) {
      if (!signal?.aborted) cancel()
      throw error
    }
    if (signal?.aborted) throw new DOMException("Upload cancelled", "AbortError")

    onProgress?.({ progress: 100 })
    return result.assetUrl
  } finally {
    signal?.removeEventListener("abort", cancel)
  }
}
