const test = require("node:test");
const assert = require("node:assert/strict");

const { isStoreAdmin } = require("../dist/src/utils/store-role.js");

test("isStoreAdmin reconoce variantes esperadas", () => {
  assert.equal(isStoreAdmin({ isStoreAdmin: true }), true);
  assert.equal(isStoreAdmin({ isStoreAdmin: 1 }), true);
  assert.equal(isStoreAdmin({ isStoreAdmin: "true" }), true);
  assert.equal(isStoreAdmin({ isStoreAdmin: false }), false);
  assert.equal(isStoreAdmin(null), false);
});
