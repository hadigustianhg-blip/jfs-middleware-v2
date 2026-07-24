"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fetchAllPages } = require("../src/utils/pagination");

test("stops when a page is empty", async () => {
  const result = await fetchAllPages({
    fetchPage: async () => [],
    pageSize: 2,
    maxPages: 5
  });

  assert.deepEqual(result, {
    items: [],
    pageCount: 1,
    stoppedReason: "empty_items"
  });
});

test("stops when hasMore returns false", async () => {
  const result = await fetchAllPages({
    fetchPage: async () => ({ items: [1, 2], more: false }),
    pageSize: 2,
    maxPages: 5,
    hasMore: page => page.more
  });

  assert.equal(result.pageCount, 1);
  assert.equal(result.stoppedReason, "has_more_false");
  assert.deepEqual(result.items, [1, 2]);
});

test("stops at maxPages", async () => {
  const result = await fetchAllPages({
    fetchPage: async ({ page }) => [page],
    pageSize: 1,
    maxPages: 3,
    getPageKey: (_result, _items, page) => page
  });

  assert.equal(result.pageCount, 3);
  assert.equal(result.stoppedReason, "max_pages_reached");
  assert.deepEqual(result.items, [1, 2, 3]);
});

test("detects a repeated page without duplicating it", async () => {
  const repeated = [{ id: "same" }];
  const result = await fetchAllPages({
    fetchPage: async () => repeated,
    pageSize: 1,
    maxPages: 10,
    getPageKey: (_result, items) => items[0].id
  });

  assert.equal(result.pageCount, 2);
  assert.equal(result.stoppedReason, "repeated_page");
  assert.deepEqual(result.items, repeated);
});

test("wraps a page failure with the page number", async () => {
  await assert.rejects(
    fetchAllPages({
      fetchPage: async () => {
        throw new Error("mock failure");
      },
      pageSize: 1,
      maxPages: 2
    }),
    error => error.code === "PAGE_FETCH_FAILED" && error.page === 1
  );
});
