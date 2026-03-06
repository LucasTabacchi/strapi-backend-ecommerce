const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildOrderIdentifierFilter,
  buildQuoteItems,
  makeOrderNumber,
  mergeFiltersWithAnd,
} = require("../dist/src/api/order/utils/order-utils.js");

test("makeOrderNumber normaliza ids numéricos", () => {
  assert.equal(makeOrderNumber(7), "AMG-0007");
  assert.equal(makeOrderNumber("12"), "AMG-0012");
  assert.equal(makeOrderNumber("abc"), null);
});

test("buildQuoteItems filtra entradas inválidas y normaliza qty", () => {
  const items = buildQuoteItems([
    { productId: 10, qty: 2 },
    { documentId: "prod-doc", quantity: 3 },
    { id: "bad", qty: 1 },
  ]);

  assert.deepEqual(items, [
    { id: 10, documentId: null, slug: null, qty: 2 },
    { id: null, documentId: "prod-doc", slug: null, qty: 3 },
  ]);
});

test("mergeFiltersWithAnd preserva filtros existentes", () => {
  const merged = mergeFiltersWithAnd(
    { orderStatus: { $eq: "paid" } },
    { user: { id: { $eq: 99 } } }
  );

  assert.deepEqual(merged, {
    $and: [
      { orderStatus: { $eq: "paid" } },
      { user: { id: { $eq: 99 } } },
    ],
  });
});

test("buildOrderIdentifierFilter acepta documentId, id numérico y orderNumber", () => {
  assert.deepEqual(buildOrderIdentifierFilter("AMG-0015"), {
    orderNumber: { $eqi: "AMG-0015" },
  });

  assert.deepEqual(buildOrderIdentifierFilter("44"), {
    $or: [{ documentId: { $eq: "44" } }, { id: { $eq: 44 } }],
  });

  assert.deepEqual(buildOrderIdentifierFilter("doc_123"), {
    documentId: { $eq: "doc_123" },
  });
});
