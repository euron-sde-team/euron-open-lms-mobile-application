import type { CatalogFacets } from "../../api/vendor/types";
import { activeFilterCount, clearFilters, countLine, filterSummary, fromParams, resultTotal, sortOptions, toCatalogQuery, toFacetQuery, withFilter } from "./filters";

const facets: CatalogFacets = {
  categories: [{ slug: "data", name: "Data", count: 4 }],
  levels: { BEGINNER: 3, INTERMEDIATE: 2, ADVANCED: 1, ALL_LEVELS: 0 },
  languages: [{ code: "en", count: 6 }],
  price: { free: 2, paid: 3, subscription: 1 },
  rating: { "3": 5, "3.5": 4, "4": 3, "4.5": 1 },
  length: { short: 2, medium: 3, long: 1 },
};

describe("Explore filters to the API query", () => {
  it("defaults to most popular, or best match while searching", () => {
    expect(toCatalogQuery({})).toEqual({ limit: 20, sort: "popular" });
    expect(toCatalogQuery({ q: "  sql " })).toEqual({ limit: 20, q: "sql", sort: "relevance" });
  });
  it("maps every server filter and keeps a chosen sort", () => {
    expect(toCatalogQuery({ q: "sql", category: "data", level: "BEGINNER", language: "en", price: "free", sort: "newest" }, 10)).toEqual({ limit: 10, q: "sql", category: "data", level: "BEGINNER", language: "en", price: "free", sort: "newest" });
  });
  it("sends rating as minRating (a number) and length as length", () => {
    expect(toCatalogQuery({ rating: "4.5", duration: "short" })).toEqual({ limit: 20, minRating: 4.5, length: "short", sort: "popular" });
    expect(toCatalogQuery({ rating: "3", level: "BEGINNER" })).toEqual({ limit: 20, level: "BEGINNER", minRating: 3, sort: "popular" });
    const q = toCatalogQuery({ rating: "4", duration: "long" }) as Record<string, unknown>;
    expect(q.rating).toBeUndefined();
    expect(q.duration).toBeUndefined();
  });
  it("drops Best match once the search is cleared", () => {
    expect(toCatalogQuery({ sort: "relevance" }).sort).toBe("popular");
    expect(withFilter({ q: "sql", sort: "relevance" }, "q", undefined)).toEqual({});
    expect(sortOptions(undefined).map((s) => s.value)).not.toContain("relevance");
    expect(sortOptions("sql").map((s) => s.value)).toContain("relevance");
  });
  it("counts facets for the same filters without sort or paging", () => {
    expect(toFacetQuery({ q: "sql", level: "ADVANCED", sort: "newest" })).toEqual({ q: "sql", level: "ADVANCED" });
    expect(toFacetQuery({ rating: "4", duration: "medium" })).toEqual({ minRating: 4, length: "medium" });
  });
});

describe("route params", () => {
  it("accepts q and a clean category slug only", () => {
    expect(fromParams({ q: " sql ", category: "Data" })).toEqual({ q: "sql", category: "data" });
    expect(fromParams({ category: "../etc" })).toEqual({});
    // Home's "See all" links: known sorts and prices only, never "Best match" without a search.
    expect(fromParams({ sort: "newest" })).toEqual({ sort: "newest" });
    expect(fromParams({ price: "free" })).toEqual({ price: "free" });
    expect(fromParams({ sort: "relevance", price: "gratis" })).toEqual({});
    expect(fromParams(undefined)).toEqual({});
  });
});

describe("summary, count and clearing", () => {
  it("summarises active filters as text", () => {
    expect(filterSummary({ category: "data", level: "BEGINNER", price: "free", rating: "4" }, facets)).toBe("Data · Beginner · Free · 4.0 and up");
    expect(filterSummary({ q: "sql" })).toBe("");
    expect(filterSummary({ rating: "3", duration: "medium" })).toBe("3.0 and up · 2 to 6 hours");
  });
  it("counts and clears filters but keeps the search and sort", () => {
    const s = { q: "sql", sort: "newest" as const, category: "data", duration: "long" as const };
    expect(activeFilterCount(s)).toBe(2);
    expect(clearFilters(s)).toEqual({ q: "sql", sort: "newest" });
  });
  it("uses the server total for every filter, rating and length included", () => {
    expect(resultTotal(facets, {})).toBe(6);
    expect(resultTotal(facets, { level: "BEGINNER" })).toBe(3);
    expect(resultTotal(facets, { level: "BEGINNER", rating: "4.5", duration: "short" })).toBe(3);
    expect(countLine(6)).toBe("6 courses");
    expect(countLine(1)).toBe("1 course");
    expect(countLine(1200)).toBe(`${(1200).toLocaleString()} courses`);
    expect(countLine(null)).toBeNull();
  });
});
