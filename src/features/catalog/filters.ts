/**
 * Explore's filters: the state the sheet edits, the API query it maps to, and the text
 * summary under the search field. Every filter goes to the server (GET /catalog/courses):
 * rating as `minRating` and length as `length`, so the list, its keyset paging and the
 * facet counts always agree. Pure, so each mapping is unit-tested.
 */
import type { CatalogQuery } from "../../api/vendor/client/endpoints/catalog";
import { COURSE_LEVELS, type CatalogFacets, type CatalogMinRating, type CatalogSort, type CourseLength, type CourseLevel } from "../../api/vendor/types";
import { languageName, levelLabel } from "./format";

export type PriceFilter = "free" | "paid" | "subscription";
/** A minimum rating as the sheet's choice value ("4.5"); sent to the API as a number. */
export type RatingFilter = `${CatalogMinRating}`;
export type DurationFilter = CourseLength;

export interface ExploreState {
  q?: string;
  category?: string;
  level?: CourseLevel;
  language?: string;
  price?: PriceFilter;
  rating?: RatingFilter;
  duration?: DurationFilter;
  sort?: CatalogSort;
}

export const SORTS: { value: CatalogSort; label: string }[] = [
  { value: "relevance", label: "Best match" },
  { value: "popular", label: "Most popular" },
  { value: "newest", label: "Newest" },
  { value: "rating", label: "Highest rated" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

export const PRICES: { value: PriceFilter; label: string }[] = [
  { value: "free", label: "Free" },
  { value: "paid", label: "Paid" },
  { value: "subscription", label: "Included in a plan" },
];

export const RATINGS: { value: RatingFilter; label: string }[] = [
  { value: "4.5", label: "4.5 and up" },
  { value: "4", label: "4.0 and up" },
  { value: "3.5", label: "3.5 and up" },
  { value: "3", label: "3.0 and up" },
];

/** Course length buckets over the total duration; the server owns the boundaries. */
export const DURATIONS: { value: DurationFilter; label: string }[] = [
  { value: "short", label: "Under 2 hours" },
  { value: "medium", label: "2 to 6 hours" },
  { value: "long", label: "Over 6 hours" },
];

export const LEVELS = COURSE_LEVELS.map((l) => ({ value: l, label: levelLabel(l) }));

/** The sort the API uses when none is chosen: best match while searching, else most popular. */
export function defaultSort(q: string | undefined): CatalogSort {
  return q?.trim() ? "relevance" : "popular";
}

/** Sorts that make sense now ("Best match" only while searching). */
export function sortOptions(q: string | undefined): typeof SORTS {
  return q?.trim() ? SORTS : SORTS.filter((s) => s.value !== "relevance");
}

/** Route params (deep links, Home's category tiles) into a state, dropping junk. */
export function fromParams(p: { q?: string; category?: string; sort?: string; price?: string } | undefined): ExploreState {
  const out: ExploreState = {};
  const q = p?.q?.trim();
  if (q) out.q = q.slice(0, 200);
  const cat = p?.category?.trim().toLowerCase();
  if (cat && /^[a-z0-9-]{1,80}$/.test(cat)) out.category = cat;
  const sort = SORTS.find((s) => s.value === p?.sort && s.value !== "relevance");
  if (sort) out.sort = sort.value;
  const price = PRICES.find((x) => x.value === p?.price);
  if (price) out.price = price.value;
  return out;
}

/** One filter changed (undefined clears it). A search cleared drops a "Best match" sort. */
export function withFilter<K extends keyof ExploreState>(state: ExploreState, key: K, value: ExploreState[K] | undefined): ExploreState {
  const next: ExploreState = { ...state };
  if (value === undefined || value === "") delete next[key];
  else next[key] = value;
  if (key === "q" && next.sort === "relevance" && !next.q?.trim()) delete next.sort;
  return next;
}

/** Filters other than the search text and the sort (what "Clear" removes). */
export function activeFilterCount(s: ExploreState): number {
  return [s.category, s.level, s.language, s.price, s.rating, s.duration].filter(Boolean).length;
}

export function clearFilters(s: ExploreState): ExploreState {
  const out: ExploreState = {};
  if (s.q) out.q = s.q;
  if (s.sort) out.sort = s.sort;
  return out;
}

/** The state as the API query (`limit` per page). */
export function toCatalogQuery(s: ExploreState, limit = 20): CatalogQuery {
  const q: CatalogQuery = { limit };
  const text = s.q?.trim();
  if (text) q.q = text;
  if (s.category) q.category = s.category;
  if (s.level) q.level = s.level;
  if (s.language) q.language = s.language;
  if (s.price) q.price = s.price;
  if (s.rating) q.minRating = Number(s.rating) as CatalogMinRating;
  if (s.duration) q.length = s.duration;
  q.sort = s.sort && !(s.sort === "relevance" && !text) ? s.sort : defaultSort(text);
  return q;
}

/** The filters facets are counted for (the same as the list, without paging or sort). */
export function toFacetQuery(s: ExploreState): Omit<CatalogQuery, "sort" | "limit" | "cursor"> {
  const q = toCatalogQuery(s);
  delete q.sort;
  delete q.limit;
  return q;
}

/**
 * How many courses match on the server. Every course has exactly one level and facets
 * ignore their own dimension (the level counts still apply rating, length and the rest),
 * so the total is the chosen level's count or the sum.
 */
export function resultTotal(facets: CatalogFacets | undefined, s: ExploreState): number | null {
  if (!facets) return null;
  if (s.level) return facets.levels[s.level] ?? 0;
  return Object.values(facets.levels).reduce((a, b) => a + b, 0);
}

/** "Data · Beginner · Free · 4.0 and up", the active filters as text under the search. */
export function filterSummary(s: ExploreState, facets?: CatalogFacets): string {
  const parts: string[] = [];
  if (s.category) parts.push(facets?.categories.find((c) => c.slug === s.category)?.name ?? s.category);
  if (s.level) parts.push(levelLabel(s.level));
  if (s.language) parts.push(languageName(s.language));
  if (s.price) parts.push(PRICES.find((p) => p.value === s.price)?.label ?? s.price);
  if (s.rating) parts.push(RATINGS.find((r) => r.value === s.rating)?.label ?? s.rating);
  if (s.duration) parts.push(DURATIONS.find((d) => d.value === s.duration)?.label ?? s.duration);
  return parts.join(" · ");
}

/** The count line: "24 courses", from the server total. */
export function countLine(total: number | null): string | null {
  if (total === null) return null;
  return `${total.toLocaleString()} ${total === 1 ? "course" : "courses"}`;
}
