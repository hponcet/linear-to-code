import * as assert from "assert"

import { fetchAllConnectionPages } from "../../linear/pagination"
import { createLinearConnection } from "../support/linearConnection"

suite("pagination utils", () => {
  for (const startIndex of [0, 1, 2]) {
    test(`collects SDK connection pages once when starting at page ${startIndex + 1}`, async () => {
      const pages = [[{ id: "label-1" }], [{ id: "label-2" }], [{ id: "Feature" }]]
      const connection = createLinearConnection(pages, startIndex)

      assert.deepStrictEqual(await fetchAllConnectionPages(connection), pages.flat())
      assert.deepStrictEqual(await fetchAllConnectionPages(connection), pages.flat())
    })
  }
})
