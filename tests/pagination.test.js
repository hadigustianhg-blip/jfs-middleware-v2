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

test("stops on a short page when hasMore is unavailable", async () => {
  const result = await fetchAllPages({
    fetchPage: async () => [1],
    pageSize: 2,
    maxPages: 5
  });

  assert.equal(result.stoppedReason, "has_more_false");
  assert.equal(result.pageCount, 1);
});

test("keeps identical data when explicit page keys are different", async () => {
  const result = await fetchAllPages({
    fetchPage: async ({ page }) => ({
      items: [{ id: "same" }],
      pageKey: `page-${page}`
    }),
    pageSize: 1,
    maxPages: 2
  });

  assert.equal(result.stoppedReason, "max_pages_reached");
  assert.deepEqual(result.items, [{ id: "same" }, { id: "same" }]);
});

test("reports an error on the second page", async () => {
  await assert.rejects(
    fetchAllPages({
      fetchPage: async ({ page }) => {
        if (page === 2) {
          throw new Error("second page failure");
        }
        return [{ id: "first" }];
      },
      pageSize: 1,
      maxPages: 3,
      getPageKey: (_result, _items, page) => page
    }),
    error => error.code === "PAGE_FETCH_FAILED" && error.page === 2
  );
});

test("rejects invalid pagination configuration", async () => {
  await assert.rejects(
    fetchAllPages({
      fetchPage: "not-a-function",
      pageSize: 1,
      maxPages: 1
    }),
    /fetchPage must be a function/
  );
  await assert.rejects(
    fetchAllPages({
      fetchPage: async () => [],
      startPage: 0,
      pageSize: 1,
      maxPages: 1
    }),
    /startPage must be a positive integer/
  );
  await assert.rejects(
    fetchAllPages({
      fetchPage: async () => [],
      pageSize: 0,
      maxPages: 1
    }),
    /pageSize must be a positive integer/
  );
  await assert.rejects(
    fetchAllPages({
      fetchPage: async () => [],
      pageSize: 1,
      maxPages: 0
    }),
    /maxPages must be a positive integer/
  );
});

test("IBK-style repeated first page is detected without an infinite loop", async () => {
  let calls = 0;
  const result = await fetchAllPages({
    fetchPage: async () => {
      calls += 1;
      return {
        records: [{ id: "IBK-TEST-1" }],
        pageKey: "first-page"
      };
    },
    pageSize: 1,
    maxPages: 20,
    getItems: page => page.records
  });

  assert.equal(result.stoppedReason, "repeated_page");
  assert.equal(calls, 2);
  assert.deepEqual(result.items, [{ id: "IBK-TEST-1" }]);
});
