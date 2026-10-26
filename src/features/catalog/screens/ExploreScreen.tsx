/**
 * Explore tab: search (debounced 300 ms, immediate on return), the result count, the
 * filter sheet and a keyset infinite list of course rows. Active filters read as one line
 * of text under the search with a "Clear" link, never chips. Accepts `q` and `category`
 * route params (deep links and Home's topic tiles).
 */
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from "react-native";
import { Search, SlidersHorizontal, X } from "lucide-react-native";
import { flattenPages, nextCursor } from "../../../api/vendor/client/pagination";
import type { CatalogFacets, CourseCard as Course } from "../../../api/vendor/types";
import { qk } from "../../../app/query";
import type { TabParams } from "../../../app/routes";
import { useSession } from "../../../app/session";
import { HeaderActions } from "../../account/HeaderActions";
import { Button } from "../../../ui/components/Button";
import { EmptyState, ErrorState, Spinner } from "../../../ui/components/Feedback";
import { ChoiceList } from "../../../ui/components/Inputs";
import { Row } from "../../../ui/components/Layout";
import { Text } from "../../../ui/components/Text";
import { useTheme } from "../../../ui/theme/ThemeProvider";
import { fonts, radius, space } from "../../../ui/theme/tokens";
import { CourseRow, CourseRowSkeleton } from "../components/CourseCard";
import { TabTitle } from "../components/Rail";
import { Sheet } from "../components/Sheet";
import {
  DURATIONS, LEVELS, PRICES, RATINGS, activeFilterCount, clearFilters, countLine, defaultSort, filterSummary, fromParams, resultTotal, sortOptions, toCatalogQuery, toFacetQuery, withFilter,
  type ExploreState,
} from "../filters";
import { languageName, levelLabel } from "../format";
import { usePurchaseContext, useViewerKey } from "../hooks";
import { u } from "../styles";

const PAGE = 20;

export function ExploreScreen() {
  const route = useRoute<RouteProp<TabParams, "Explore">>();
  const navigation = useNavigation();
  const { api, me } = useSession();
  const viewer = useViewerKey();
  const ctx = usePurchaseContext();
  const { colors } = useTheme();
  const planName = me?.subscription?.grantsAccess ? me.subscription.plan.name : null;

  const [state, setState] = useState<ExploreState>(() => fromParams(route.params));
  const [text, setText] = useState(state.q ?? "");
  const [sheet, setSheet] = useState(false);

  // New params (a topic tapped on Home, a deep link) replace the current search.
  const pq = route.params?.q;
  const pc = route.params?.category;
  const ps = route.params?.sort;
  const pp = route.params?.price;
  useEffect(() => {
    if (pq === undefined && pc === undefined && ps === undefined && pp === undefined) return;
    const next = fromParams({ q: pq, category: pc, sort: ps, price: pp });
    setState(next);
    setText(next.q ?? "");
  }, [pq, pc, ps, pp]);

  // Debounced search: 300 ms after the last keystroke.
  useEffect(() => {
    const t = setTimeout(() => setState((s) => ((s.q ?? "") === text.trim() ? s : withFilter(s, "q", text.trim() || undefined))), 300);
    return () => clearTimeout(t);
  }, [text]);
  const submit = () => setState((s) => withFilter(s, "q", text.trim() || undefined));

  const query = useMemo(() => toCatalogQuery(state, PAGE), [state]);
  const facetQuery = useMemo(() => toFacetQuery(state), [state]);
  const list = useInfiniteQuery({
    queryKey: [...qk.catalog(query), viewer],
    queryFn: ({ pageParam }) => api.catalog.courses({ ...query, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    placeholderData: keepPreviousData,
  });
  const facets = useQuery({ queryKey: [...qk.facets, facetQuery], queryFn: () => api.catalog.facets(facetQuery), placeholderData: keepPreviousData, staleTime: 60_000 });
  const categories = useQuery({ queryKey: qk.categories, queryFn: () => api.catalog.categories(), staleTime: 5 * 60_000 });

  const items = useMemo(() => flattenPages(list.data?.pages), [list.data]);

  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([list.refetch(), facets.refetch()]);
    setRefreshing(false);
  }, [list, facets]);

  const open = useCallback((c: Course) => navigation.navigate("Course", { slug: c.slug }), [navigation]);
  const renderItem = useCallback(({ item }: { item: Course }) => <CourseRow course={item} mode={ctx.mode} planName={planName} onPress={open} />, [ctx.mode, planName, open]);

  const nFilters = activeFilterCount(state);
  const summary = filterSummary(state, facets.data);
  const count = countLine(resultTotal(facets.data, state));
  const searching = !!state.q;

  const empty = () => {
    if (list.isPending) {
      return (
        <View style={styles.pad}>
          {[0, 1, 2, 3, 4].map((i) => (
            <CourseRowSkeleton key={i} />
          ))}
        </View>
      );
    }
    if (list.isError) return <ErrorState message="The courses did not load." onRetry={() => list.refetch()} />;
    if (list.isFetching) return <Spinner />;
    if (!searching && !nFilters) return <EmptyState title="No courses yet" body="This academy has not published a course yet. Check back soon." testID="catalog-explore-empty" />;
    const suggestions = (categories.data ?? []).filter((c) => c.courseCount > 0 && c.slug !== state.category).slice(0, 4);
    return (
      <View testID="catalog-explore-no-results">
        <EmptyState
          title={searching ? `No courses match "${state.q}"` : "No courses match these filters"}
          body={nFilters ? "Try clearing a filter or two." : "Try a different word, or browse a topic."}
          action={nFilters ? { label: "Clear filters", onPress: () => setState(clearFilters(state)) } : { label: "Clear search", onPress: () => { setText(""); setState(withFilter(state, "q", undefined)); } }}
        />
        {suggestions.length ? (
          <View style={styles.pad}>
            <Text variant="eyebrow" tone="subtle" style={{ marginBottom: space[1] }}>Browse a topic</Text>
            {suggestions.map((c, i) => (
              <Row key={c.id} label={c.name} value={`${c.courseCount}`} last={i === suggestions.length - 1} onPress={() => { setText(""); setState({ category: c.slug }); }} testID={`catalog-suggest-${c.slug}`} />
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]} testID="catalog-explore">
      <TabTitle title="Explore" right={<HeaderActions />} />
      <View style={styles.pad}>
        <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.input }]}>
          <Search size={18} color={colors.subtleForeground} />
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={submit}
            returnKeyType="search"
            placeholder="Search by topic, skill or instructor"
            placeholderTextColor={colors.subtleForeground}
            accessibilityLabel="Search courses"
            autoCorrect={false}
            style={[styles.searchInput, { color: colors.foreground }]}
            testID="catalog-explore-search"
          />
          {text ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => { setText(""); setState((s) => withFilter(s, "q", undefined)); }}>
              <X size={18} color={colors.subtleForeground} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.bar}>
          <Text variant="small" tone="muted" style={u.flex} testID="catalog-explore-count">{count ?? " "}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={nFilters ? `Filters, ${nFilters} on` : "Filters"} onPress={() => setSheet(true)} hitSlop={8} style={styles.filtersBtn} testID="catalog-explore-filters">
            <SlidersHorizontal size={18} color={colors.foreground} />
            <Text variant="smallStrong">{nFilters ? `Filters (${nFilters})` : "Filters"}</Text>
          </Pressable>
        </View>
        {summary ? (
          <View style={styles.summary}>
            <Text variant="small" style={u.flex} numberOfLines={2} testID="catalog-explore-summary">{summary}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Clear filters" hitSlop={10} onPress={() => setState(clearFilters(state))} testID="catalog-explore-clear">
              <Text variant="smallStrong" tone="link">Clear</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.pad, { paddingBottom: space[8] }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) list.fetchNextPage();
        }}
        ListEmptyComponent={empty() ?? undefined}
        ListFooterComponent={list.isFetchingNextPage && items.length ? <Spinner /> : undefined}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />}
        testID="catalog-explore-list"
      />
      <FilterSheet visible={sheet} state={state} facets={facets.data} onClose={() => setSheet(false)} onApply={(s) => { setState(s); setSheet(false); }} />
    </View>
  );
}

const ANY = "" as const;

function FilterSheet({ visible, state, facets, onClose, onApply }: { visible: boolean; state: ExploreState; facets: CatalogFacets | undefined; onClose: () => void; onApply: (s: ExploreState) => void }) {
  const [draft, setDraft] = useState(state);
  useEffect(() => {
    if (visible) setDraft(state);
  }, [visible, state]);
  const set = <K extends keyof ExploreState>(k: K) => (v: string) => setDraft((d) => withFilter(d, k, (v || undefined) as ExploreState[K]));

  // Counts are optional: an older server may not send every facet, and the sheet must still open.
  const categoryOptions = [{ value: ANY, label: "Any topic" }, ...(facets?.categories ?? []).map((c) => ({ value: c.slug, label: c.name, count: c.count }))];
  const levelOptions = [{ value: ANY, label: "Any level" }, ...LEVELS.map((l) => ({ value: l.value, label: levelLabel(l.value), count: facets?.levels ? facets.levels[l.value] ?? 0 : undefined }))];
  const languageOptions = [{ value: ANY, label: "Any language" }, ...(facets?.languages ?? []).map((l) => ({ value: l.code, label: languageName(l.code), count: l.count }))];
  const priceOptions = [{ value: ANY, label: "Any price" }, ...PRICES.map((p) => ({ value: p.value, label: p.label, count: facets?.price ? facets.price[p.value] ?? 0 : undefined }))];
  const ratingOptions = [{ value: ANY, label: "Any rating" }, ...RATINGS.map((r) => ({ value: r.value, label: r.label, count: facets?.rating ? facets.rating[r.value] ?? 0 : undefined }))];
  const durationOptions = [{ value: ANY, label: "Any length" }, ...DURATIONS.map((d) => ({ value: d.value, label: d.label, count: facets?.length ? facets.length[d.value] ?? 0 : undefined }))];
  const sorts = sortOptions(draft.q);

  return (
    <Sheet
      visible={visible}
      title="Filters"
      onClose={onClose}
      testID="catalog-filter-sheet"
      footer={
        <>
          <Button label="Clear all" variant="ghost" onPress={() => setDraft(clearFilters({ q: draft.q }))} style={u.flex} testID="catalog-filter-clear" />
          <Button label="Show results" onPress={() => onApply(draft)} style={u.flex} testID="catalog-filter-apply" />
        </>
      }
    >
      <FilterGroup title="Sort by">
        <ChoiceList options={sorts} selected={[draft.sort ?? defaultSort(draft.q)]} onToggle={(v) => setDraft((d) => ({ ...d, sort: v === defaultSort(d.q) ? undefined : v }))} />
      </FilterGroup>
      {categoryOptions.length > 1 ? (
        <FilterGroup title="Topic">
          <ChoiceList options={categoryOptions} selected={[draft.category ?? ANY]} onToggle={set("category")} />
        </FilterGroup>
      ) : null}
      <FilterGroup title="Level">
        <ChoiceList options={levelOptions} selected={[draft.level ?? ANY]} onToggle={set("level")} />
      </FilterGroup>
      {languageOptions.length > 2 ? (
        <FilterGroup title="Language">
          <ChoiceList options={languageOptions} selected={[draft.language ?? ANY]} onToggle={set("language")} />
        </FilterGroup>
      ) : null}
      <FilterGroup title="Price">
        <ChoiceList options={priceOptions} selected={[draft.price ?? ANY]} onToggle={set("price")} />
      </FilterGroup>
      <FilterGroup title="Rating">
        <ChoiceList options={ratingOptions} selected={[draft.rating ?? ANY]} onToggle={set("rating")} />
      </FilterGroup>
      <FilterGroup title="Length">
        <ChoiceList options={durationOptions} selected={[draft.duration ?? ANY]} onToggle={set("duration")} />
      </FilterGroup>
    </Sheet>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: space[6] }}>
      <Text variant="eyebrow" tone="subtle">{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pad: { paddingHorizontal: space[4] },
  search: { flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 48, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space[3], marginTop: space[2] },
  searchInput: { flex: 1, fontFamily: fonts.body.regular, fontSize: 15, paddingVertical: space[3] },
  bar: { flexDirection: "row", alignItems: "center", marginTop: space[2], minHeight: 44 },
  filtersBtn: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingLeft: space[3] },
  summary: { flexDirection: "row", alignItems: "center", gap: space[3], paddingBottom: space[2] },
});
