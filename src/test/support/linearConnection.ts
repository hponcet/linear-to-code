import { Connection, PageInfo } from "@linear/sdk"

const noRequest = async (): Promise<never> => {
  throw new Error("Unexpected API request")
}

export function createLinearConnection<T>(pages: T[][], startIndex = 0): Connection<T> {
  const getPage = (index: number): Connection<T> =>
    new Connection(
      noRequest,
      async (variables) =>
        getPage(
          variables?.before != null ? Number(variables.before) - 1 : Number(variables?.after) + 1,
        ),
      pages[index] ?? [],
      new PageInfo(noRequest, {
        __typename: "PageInfo",
        startCursor: String(index),
        endCursor: String(index),
        hasPreviousPage: index > 0,
        hasNextPage: index < pages.length - 1,
      }),
    )

  return getPage(startIndex)
}
