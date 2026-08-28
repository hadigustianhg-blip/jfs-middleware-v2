"use strict";

function defaultGetItems(pageResult) {
  if (Array.isArray(pageResult)) {
    return pageResult;
  }

  return pageResult?.items || [];
}

function defaultPageKey(pageResult, items) {
  if (pageResult?.pageKey !== undefined) {
    return String(pageResult.pageKey);
  }

  return JSON.stringify(items);
}

async function fetchAllPages({
  fetchPage,
  startPage = 1,
  pageSize,
  maxPages,
  getItems = defaultGetItems,
  hasMore,
  getPageKey = defaultPageKey
}) {
  if (typeof fetchPage !== "function") {
    throw new TypeError("fetchPage must be a function");
  }

  if (!Number.isInteger(startPage) || startPage < 1) {
    throw new RangeError("startPage must be a positive integer");
  }

  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new RangeError("pageSize must be a positive integer");
  }

  if (!Number.isInteger(maxPages) || maxPages < 1) {
    throw new RangeError("maxPages must be a positive integer");
  }

  const items = [];
  const seenPageKeys = new Set();
  let pageCount = 0;
  let stoppedReason = "max_pages_reached";

  for (let offset = 0; offset < maxPages; offset += 1) {
    const page = startPage + offset;
    let pageResult;

    try {
      pageResult = await fetchPage({ page, pageSize });
    } catch (cause) {
      const error = new Error(`Failed to fetch page ${page}`, { cause });
      error.code = "PAGE_FETCH_FAILED";
      error.page = page;
      throw error;
    }

    pageCount += 1;
    const pageItems = getItems(pageResult);

    if (!Array.isArray(pageItems)) {
      throw new TypeError(`Items for page ${page} must be an array`);
    }

    if (pageItems.length === 0) {
      stoppedReason = "empty_items";
      break;
    }

    const pageKey = getPageKey(pageResult, pageItems, page);
    if (pageKey !== undefined && pageKey !== null) {
      const normalizedKey = String(pageKey);
      if (seenPageKeys.has(normalizedKey)) {
        stoppedReason = "repeated_page";
        break;
      }
      seenPageKeys.add(normalizedKey);
    }

    items.push(...pageItems);

    if (typeof hasMore === "function" && hasMore(pageResult, pageItems, page) === false) {
      stoppedReason = "has_more_false";
      break;
    }

    if (typeof hasMore !== "function" && pageItems.length < pageSize) {
      stoppedReason = "has_more_false";
      break;
    }
  }

  return {
    items,
    pageCount,
    stoppedReason
  };
}

module.exports = {
  fetchAllPages
};
