type PaginatedConnection<T> = {
  nodes: T[]
  pageInfo: {
    hasPreviousPage: boolean
    hasNextPage?: boolean
  }
  fetchPrevious: () => Promise<PaginatedConnection<T>>
  fetchNext?: () => Promise<PaginatedConnection<T>>
}

export async function fetchAllConnectionPages<T>(connection: PaginatedConnection<T>): Promise<T[]> {
  while (connection.pageInfo.hasPreviousPage) {
    connection = await connection.fetchPrevious()
  }

  while (connection.pageInfo.hasNextPage && connection.fetchNext) {
    connection = await connection.fetchNext()
  }

  // The Linear SDK prepends/appends pages to the connection's existing nodes.
  return [...connection.nodes]
}

export async function fetchAllPreviousPages<T>(connection: PaginatedConnection<T>): Promise<T[]> {
  return fetchAllConnectionPages(connection)
}
