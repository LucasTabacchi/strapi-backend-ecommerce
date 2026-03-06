const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeProductTargetInput,
  readProductTargets,
  readStringList,
} = require("../dist/src/api/promotion/utils/promotion-targets.js");

test("readStringList soporta arrays, JSON string y delimitadores", () => {
  assert.deepEqual(readStringList([" hogar ", "ofertas"]), ["hogar", "ofertas"]);
  assert.deepEqual(readStringList('["a","b"]'), ["a", "b"]);
  assert.deepEqual(readStringList("a;b|c"), ["a", "b", "c"]);
});

test("readProductTargets separa ids y documentIds", () => {
  assert.deepEqual(readProductTargets([1, "2", "Prod-ABC"]), {
    ids: [1, 2],
    documentIds: ["prod-abc"],
  });
});

test("normalizeProductTargetInput devuelve referencias deduplicadas y limpias", () => {
  assert.deepEqual(normalizeProductTargetInput([1, "1", " doc-1 ", "DOC-1"]), [
    1,
    "doc-1",
  ]);
});
