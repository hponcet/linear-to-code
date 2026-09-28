import * as assert from "assert"

import { normalizeIssueTitle } from "../../linear/issueTitle"

suite("Issue title", () => {
  test("normalizes pasted titles as plain text and rejects empty or invalid values", () => {
    assert.strictEqual(normalizeIssueTitle("  Fix\r\nlogin\tflow  "), "Fix login flow")
    assert.strictEqual(
      normalizeIssueTitle("Fix **bold** & <tag> `code`"),
      "Fix **bold** & <tag> `code`",
    )
    for (const value of ["", " \n\t ", null, undefined, 42]) {
      assert.throws(() => normalizeIssueTitle(value), /Issue title/)
    }
  })
})
