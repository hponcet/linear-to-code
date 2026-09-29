import { useEffect, useState } from "react"

export function useAsyncMemo<T>(
  asyncFunction: (currentValue: T | null) => Promise<T>,
  dependencies: React.DependencyList,
): [T | null, boolean] {
  const [value, setValue] = useState<T | null>(null)
  const [isLoading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    // Cleared synchronously when dependencies change, so a slower earlier request cannot win.
    let current = true

    setLoading(true)
    void (async () => {
      try {
        const result = await asyncFunction(value)
        if (current) {
          setValue(result)
        }
      } catch (error) {
        console.error(error)
      } finally {
        if (current) {
          setLoading(false)
        }
      }
    })()

    return () => {
      current = false
    }
  }, dependencies)

  return [value, isLoading]
}
