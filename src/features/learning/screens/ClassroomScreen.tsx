/**
 * The classroom. Loads the classroom for `courseSlug` (curriculum with per-item progress)
 * and opens `itemId` or where the learner left off. On a phone: a 16:9 player on top for
 * videos (articles, PDFs, quizzes and assignments fill the scrolling area instead), then
 * the item title with the course progress ring, Previous / Next, and underline tabs:
 * Lessons, Notes, Q&A, Resources, Overview. Guests and learners without access see the
 * public curriculum as a preview: free previews open, the rest are locked with a way back
 * to the course page. One FlatList carries the lesson rows; the other tabs render below
 * its header so the screen keeps one scroll.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from "react-native";
import { ChevronLeft, ChevronRight, Download } from "lucide-react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { mobileFlags, useMeta } from "../../../app/meta";
import { qk } from "../../../app/query";
import type { RootScreen } from "../../../app/routes";
import { useSession } from "../../../app/session";
import { isApiError } from "../../../api/vendor/client/errors";
import type { Classroom, ClassroomItem, ItemContent } from "../../../api/vendor/types";
import { Button, IconButton } from "../../../ui/components/Button";
import { ErrorState, ProgressRing, Skeleton } from "../../../ui/components/Feedback";
import { Tabs } from "../../../ui/components/Inputs";
import { Text } from "../../../ui/components/Text";
import { useTheme } from "../../../ui/theme/ThemeProvider";
import { space } from "../../../ui/theme/tokens";
import { canOpen, findItem, initialItemId, isVideo, itemKindLabel, neighbours, patchItem } from "../curriculum";
import { downloadManager } from "../downloads/engine";
import { isLoopbackAvailable } from "../downloads/loopback";
import { effectiveState, type DownloadEntry } from "../downloads/state";
import { downloadsOffered, useDownloads } from "../downloads/useDownloads";
import { formatDuration, progressLine } from "../format";
import type { PlayerHandle } from "../player/Player";
import { SheetLabel } from "../components/Sheet";
import { useApplyProgress, useClassroomLoad, useCourseDetail, useItem } from "../classroom/hooks";
import { OverviewTab, ResourcesTab } from "../classroom/InfoTabs";
import { ArticleLesson, AssignmentIntro, CompletionLine, LockedPanel, PdfLesson, QuizIntro } from "../classroom/ItemPanels";
import { curriculumRows, ItemRow, SectionRow, type CurriculumRow } from "../classroom/LessonRows";
import { NotesTab } from "../classroom/NotesTab";
import { QaTab } from "../classroom/QaTab";
import { VideoLesson, VideoNotice, VideoSkeleton } from "../classroom/VideoLesson";
import { u } from "../styles";

type Tab = "lessons" | "notes" | "qa" | "resources" | "overview";

export function ClassroomScreen({ route, navigation }: RootScreen<"Classroom">) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const slug = route.params.courseSlug;
  const load = useClassroomLoad(slug);
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate("Course", { slug }));

  if (load.state === "ready") return <ClassroomReady key={slug} classroom={load.classroom} preview={load.preview} requested={route.params.itemId ?? null} navigation={navigation} onBack={back} />;

  return (
    <View style={[styles.fill, { backgroundColor: colors.background, paddingTop: insets.top }]} testID="learning-classroom">
      <View style={styles.topBar}>
        <IconButton label="Back" onPress={back} icon={<ChevronLeft size={26} color={colors.foreground} />} />
      </View>
      {load.state === "loading" ? (
        <View testID="learning-classroom-loading">
          <VideoSkeleton />
          <View style={{ padding: space[4], gap: space[3] }}>
            <Skeleton height={24} width="70%" />
            <Skeleton height={14} width="40%" />
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} height={44} />
            ))}
          </View>
        </View>
      ) : load.state === "blocked" ? (
        <LockedPanel
          title={load.lapsed ? "Your access to this course ended" : "You need access to this course"}
          body={load.lapsed ? "Your progress is saved. Renew access from the course page to continue." : "Enroll from the course page to open the lessons."}
          onCourse={() => navigation.navigate("Course", { slug })}
        />
      ) : (
        <ErrorState onRetry={load.retry} />
      )}
    </View>
  );
}

function ClassroomReady({ classroom, preview, requested, navigation, onBack }: { classroom: Classroom; preview: boolean; requested: string | null; navigation: RootScreen<"Classroom">["navigation"]; onBack: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { status, api } = useSession();
  const meta = useMeta();
  const slug = classroom.course.slug;
  const signedIn = status === "signedIn";

  const [currentId, setCurrentId] = useState<string | null>(() => initialItemId(classroom, requested));
  useEffect(() => {
    if (requested && requested !== currentId && findItem(classroom.sections, requested)) setCurrentId(requested);
    // Only a new deep link moves the classroom; local moves update the param themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested]);

  const current = findItem(classroom.sections, currentId);
  const openable = !!current && canOpen(classroom.role, current.item);
  const item = useItem(openable ? currentId : null);
  const course = useCourseDetail(slug);
  const [tab, setTab] = useState<Tab>("lessons");
  const [fullscreen, setFullscreen] = useState(false);
  const [finished, setFinished] = useState<{ serial: string | null } | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => (current ? { [current.section.id]: true } : classroom.sections[0] ? { [classroom.sections[0].id]: true } : {}));
  const player = useRef<PlayerHandle | null>(null);
  const list = useRef<FlatList<CurriculumRow>>(null);

  const currentSectionId = current?.section.id;
  const assessmentId = current && current.item.kind !== "LECTURE" ? current.item.id : null;
  useEffect(() => {
    if (currentSectionId) setOpenSections((o) => (o[currentSectionId] ? o : { ...o, [currentSectionId]: true }));
  }, [currentSectionId]);

  // Coming back from a quiz or an assignment: their state changed on the server.
  useEffect(
    () =>
      navigation.addListener("focus", () => {
        if (!assessmentId) return;
        qc.invalidateQueries({ queryKey: qk.item(assessmentId) });
        qc.invalidateQueries({ queryKey: qk.classroom(slug) });
      }),
    [navigation, assessmentId, qc, slug]
  );

  const onFinished = useCallback((serial: string | null) => setFinished({ serial }), []);
  const applyProgress = useApplyProgress(slug, onFinished);

  const open = useCallback(
    (target: ClassroomItem | string) => {
      const id = typeof target === "string" ? target : target.id;
      setCurrentId(id);
      navigation.setParams({ itemId: id });
      list.current?.scrollToOffset({ offset: 0, animated: true });
    },
    [navigation]
  );

  const bookmark = useMutation({
    mutationFn: ({ itemId, on }: { itemId: string; on: boolean }) => (on ? api.learn.bookmark(itemId) : api.learn.unbookmark(itemId)),
    onMutate: async ({ itemId, on }) => {
      await qc.cancelQueries({ queryKey: qk.classroom(slug) });
      const prev = qc.getQueryData<Classroom>(qk.classroom(slug));
      qc.setQueryData<Classroom>(qk.classroom(slug), (c) => (c ? patchItem(c, itemId, (i) => ({ ...i, bookmarked: on })) : c));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(qk.classroom(slug), ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.learning("bookmarks") }),
  });
  const onBookmark = useCallback((i: ClassroomItem) => bookmark.mutate({ itemId: i.id, on: !i.bookmarked }), [bookmark]);

  // Downloads: every switch must be on (academy, course, native server, signed in, real access).
  const offered = downloadsOffered({ academyEnabled: mobileFlags(meta.data).downloadsEnabled, courseAllows: classroom.course.allowDownloads, nativeReady: isLoopbackAvailable(), signedIn, previewOnly: classroom.role === "PREVIEW" });
  const downloads = useDownloads();
  const byItem = useMemo(() => new Map(downloads.map((d) => [d.itemId, d])), [downloads]);
  const onDownload = useCallback((i: ClassroomItem) => downloadAction(i, byItem.get(i.id), classroom), [byItem, classroom]);

  const { prev, next } = neighbours(classroom, currentId);
  const rows = useMemo(() => curriculumRows(classroom.sections, openSections), [classroom.sections, openSections]);
  const toggleSection = useCallback((id: string) => setOpenSections((o) => ({ ...o, [id]: !o[id] })), []);

  const renderRow = useCallback(
    ({ item: row }: { item: CurriculumRow }) => {
      if (row.type === "section") return <SectionRow section={row.section} number={row.number} open={row.open} onToggle={toggleSection} />;
      const d = byItem.get(row.item.id);
      return (
        <ItemRow
          item={row.item}
          active={row.item.id === currentId}
          openable={canOpen(classroom.role, row.item)}
          onOpen={open}
          onBookmark={classroom.role !== "PREVIEW" && signedIn ? onBookmark : undefined}
          download={offered && isVideo(row.item) ? { state: d ? effectiveState(d) : null, progress: d?.progress ?? 0, onPress: onDownload } : null}
        />
      );
    },
    [toggleSection, byItem, currentId, classroom.role, open, signedIn, onBookmark, offered, onDownload]
  );

  const content = item.data;
  const videoItem = !!current && isVideo(current.item) && openable;
  const accessMode = course.data?.accessMode ?? null;
  const goCourse = () => navigation.navigate("Course", { slug });
  const signIn = signedIn ? undefined : () => navigation.navigate("SignIn");

  const lockedPanel = (
    <LockedPanel
      title={signedIn ? "This lesson is for enrolled learners" : "Sign in or enroll to open this lesson"}
      body={signedIn ? "Enroll from the course page to open it." : "Free previews open without an account."}
      onCourse={goCourse}
      onSignIn={signIn}
    />
  );

  const itemError = item.isError ? (isApiError(item.error) && (item.error.code === "COURSE_ACCESS_REQUIRED" || item.error.code === "SIGN_IN_REQUIRED") ? lockedPanel : <ErrorState onRetry={() => item.refetch()} />) : null;

  const downloadEntry = currentId ? byItem.get(currentId) : undefined;
  const downloadRow =
    offered && current && content?.kind === "LECTURE" && content.lecture.lectureKind === "VIDEO" && content.lecture.provider !== "YOUTUBE" ? (
      <>
        <SheetLabel>Offline</SheetLabel>
        <Pressable accessibilityRole="button" onPress={() => onDownload(current.item)} style={styles.sheetRow} testID="learning-player-download">
          <Download size={18} color={colors.foreground} />
          <Text style={u.flex1}>{downloadLabel(downloadEntry)}</Text>
        </Pressable>
      </>
    ) : null;

  // The viewer: a fixed player for video, otherwise part of the scrolling content.
  let topViewer: React.ReactNode = null;
  let inlineViewer: React.ReactNode = null;
  if (!current) {
    inlineViewer = <VideoNotice title="This course has no lessons yet" body="Check back soon." />;
  } else if (!openable) {
    inlineViewer = lockedPanel;
  } else if (itemError) {
    if (videoItem) topViewer = itemError;
    else inlineViewer = itemError;
  } else if (!content) {
    if (videoItem) topViewer = <VideoSkeleton />;
    else inlineViewer = <DocSkeleton />;
  } else if (content.kind === "LECTURE" && content.lecture.lectureKind === "VIDEO") {
    topViewer = (
      <VideoLesson
        ref={player}
        content={content}
        lecture={content.lecture}
        role={classroom.role}
        accessMode={accessMode}
        nextItem={next}
        fullscreen={fullscreen}
        onFullscreenChange={setFullscreen}
        onProgress={applyProgress}
        onNext={open}
        downloadRow={downloadRow}
      />
    );
  } else inlineViewer = <ItemBody content={content} role={classroom.role} onProgress={applyProgress} onQuiz={() => navigation.navigate("Quiz", { courseSlug: slug, itemId: content.item.id })} onAssignment={() => navigation.navigate("Assignment", { courseSlug: slug, itemId: content.item.id })} />;

  const tabs: { value: Tab; label: string }[] = [
    { value: "lessons", label: "Lessons" },
    ...(classroom.role !== "PREVIEW" && signedIn ? [{ value: "notes" as Tab, label: "Notes" }, { value: "qa" as Tab, label: "Q&A" }] : []),
    ...(content?.kind === "LECTURE" ? [{ value: "resources" as Tab, label: "Resources" }] : []),
    { value: "overview", label: "Overview" },
  ];
  const activeTab: Tab = tabs.some((t) => t.value === tab) ? tab : "lessons";
  const e = classroom.enrollment;

  const header = (
    <View>
      {finished ? (
        <CompletionLine
          courseTitle={classroom.course.title}
          serial={finished.serial ?? classroom.certificate?.serial ?? null}
          certificateEnabled={classroom.course.certificateEnabled}
          onCertificate={(serial) => navigation.navigate("Certificate", { serial })}
          onCertificates={() => navigation.navigate("Tabs", { screen: "Learning", params: { tab: "certificates" } })}
          onDismiss={() => setFinished(null)}
        />
      ) : null}
      {inlineViewer}
      {/* Quiz and assignment intros carry their own title; the header would repeat it. */}
      {current && !(openable && (current.item.kind === "QUIZ" || current.item.kind === "ASSIGNMENT")) ? (
        <View style={styles.headLine}>
          <View style={u.flex1}>
            <Text variant="small" tone="muted" numberOfLines={1}>{current.section.title}</Text>
            <Text variant="heading" style={u.mt2} testID="learning-item-title">{current.item.title}</Text>
            <Text variant="small" tone="muted" style={u.mt2}>{`${itemKindLabel(current.item)}${current.item.durationSeconds > 0 ? ` · ${formatDuration(current.item.durationSeconds)}` : ""}`}</Text>
          </View>
          {e ? (
            <View style={styles.ring} accessibilityLabel={`Course ${e.progressPercent}% complete`} testID="learning-course-progress">
              <ProgressRing value={e.progressPercent} size={40} stroke={3} done={e.progressPercent >= 100} />
              <Text variant="caption" tone="muted" style={u.mt2}>{`${Math.floor(e.progressPercent)}%`}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {current && openable ? (
        <View style={styles.prevNext}>
          <Button label="Previous" variant="outline" size="sm" disabled={!prev} onPress={() => prev && open(prev)} icon={<ChevronLeft size={16} color={colors.foreground} />} testID="learning-prev" />
          <Button label="Next" variant="outline" size="sm" disabled={!next} onPress={() => next && open(next)} trailingIcon={<ChevronRight size={16} color={colors.foreground} />} testID="learning-next" />
        </View>
      ) : null}
      {classroom.role === "STAFF" ? <Text variant="small" tone="muted" style={styles.note}>Staff view: progress is not recorded.</Text> : null}
      {preview ? <Text variant="small" tone="muted" style={styles.note}>Preview: enroll to open every lesson.</Text> : null}
      <View style={{ paddingHorizontal: space[4], marginTop: space[4] }}>
        <Tabs value={activeTab} onChange={setTab} items={tabs} testID="learning-classroom-tabs" />
      </View>
    </View>
  );

  const footer =
    activeTab === "lessons" ? (
      <View style={{ height: space[8] + insets.bottom }} />
    ) : (
      <View style={{ paddingHorizontal: space[4], paddingBottom: space[10] + insets.bottom }}>
        {activeTab === "notes" && currentId ? <NotesTab slug={slug} itemId={currentId} isVideo={videoItem} player={player} onOpenItem={open} /> : null}
        {activeTab === "qa" && currentId ? <QaTab courseId={classroom.course.id} itemId={currentId} /> : null}
        {activeTab === "resources" && content?.kind === "LECTURE" ? <ResourcesTab resources={content.resources} /> : null}
        {activeTab === "overview" && content ? <OverviewTab content={content} courseTitle={classroom.course.title} course={course.data} onCourse={goCourse} onInstructor={(id) => navigation.navigate("Instructor", { id })} /> : null}
        {activeTab === "overview" && !content ? <OverviewFallback title={classroom.course.title} onCourse={goCourse} /> : null}
      </View>
    );

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]} testID="learning-classroom">
      {!fullscreen ? (
        <View style={[styles.topBar, { paddingTop: insets.top, borderBottomColor: colors.border }]}>
          <IconButton label="Back" onPress={onBack} icon={<ChevronLeft size={26} color={colors.foreground} />} />
          <View style={u.flex1}>
            <Text variant="smallStrong" numberOfLines={1}>{classroom.course.title}</Text>
            {e ? <Text variant="caption" tone="muted">{progressLine(e.progressPercent, e.completedItems, e.totalItems)}</Text> : null}
          </View>
        </View>
      ) : null}
      {topViewer}
      {!fullscreen ? (
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <FlatList
            ref={list}
            data={activeTab === "lessons" ? rows : []}
            keyExtractor={(r) => r.key}
            renderItem={renderRow}
            ListHeaderComponent={header}
            ListFooterComponent={footer}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={20}
            windowSize={9}
            testID="learning-classroom-list"
          />
        </KeyboardAvoidingView>
      ) : null}
    </View>
  );
}

function ItemBody({ content, role, onProgress, onQuiz, onAssignment }: { content: ItemContent; role: Classroom["role"]; onProgress: Parameters<typeof ArticleLesson>[0]["onProgress"]; onQuiz: () => void; onAssignment: () => void }) {
  if (content.kind === "QUIZ") return <QuizIntro content={content} onOpen={onQuiz} role={role} />;
  if (content.kind === "ASSIGNMENT") return <AssignmentIntro content={content} onOpen={onAssignment} role={role} />;
  const l = content.lecture;
  if (l.lectureKind === "ARTICLE") return <ArticleLesson content={content} html={l.html} role={role} onProgress={onProgress} />;
  if (l.lectureKind === "PDF") return <PdfLesson content={content} pdf={l.pdf} role={role} onProgress={onProgress} />;
  return null;
}

function OverviewFallback({ title, onCourse }: { title: string; onCourse: () => void }) {
  return (
    <View style={{ paddingTop: space[4] }}>
      <Text variant="heading">{title}</Text>
      <Button label="About this course" variant="ghost" size="sm" onPress={onCourse} style={[u.selfStart, { marginTop: space[2] }]} />
    </View>
  );
}

function DocSkeleton() {
  return (
    <View style={{ padding: space[4], gap: space[3] }}>
      <Skeleton height={28} width="80%" />
      <Skeleton height={14} />
      <Skeleton height={14} />
      <Skeleton height={14} width="60%" />
    </View>
  );
}

export function downloadLabel(d: DownloadEntry | undefined): string {
  if (!d) return "Download for offline viewing";
  switch (effectiveState(d)) {
    case "done":
      return "Downloaded. Tap to remove";
    case "downloading":
      return `Downloading ${Math.round(d.progress * 100)}%`;
    case "queued":
      return "Waiting to download";
    case "paused":
      return "Paused. Tap to resume";
    case "failed":
      return d.error ?? "The download stopped. Tap to retry";
    case "expired":
      return "Expired. Connect to renew";
  }
}

/** What tapping a download glyph does, by the item's download state. */
function downloadAction(item: ClassroomItem, d: DownloadEntry | undefined, classroom: Classroom) {
  const m = downloadManager();
  if (!d) {
    try {
      m.start({ itemId: item.id, courseSlug: classroom.course.slug, courseTitle: classroom.course.title, title: item.title, durationSeconds: item.durationSeconds });
    } catch (e) {
      Alert.alert("Download not started", e instanceof Error ? e.message : "Try again.");
    }
    return;
  }
  const state = effectiveState(d);
  if (state === "paused" || state === "failed") return m.resume(item.id);
  if (state === "downloading" || state === "queued") {
    Alert.alert(item.title, `Downloading ${Math.round(d.progress * 100)}%.`, [
      { text: "Pause", onPress: () => m.pause(item.id) },
      { text: "Cancel download", style: "destructive", onPress: () => m.remove(item.id) },
      { text: "Keep going", style: "cancel" },
    ]);
    return;
  }
  Alert.alert(state === "expired" ? "This download expired" : "Remove this download?", state === "expired" ? "Connect to the internet to renew it, or remove it." : "You can download it again later.", [
    { text: "Cancel", style: "cancel" },
    { text: "Remove", style: "destructive", onPress: () => m.remove(item.id) },
  ]);
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: { flexDirection: "row", alignItems: "center", paddingRight: space[4], paddingBottom: space[1], gap: space[1], borderBottomWidth: StyleSheet.hairlineWidth },
  headLine: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: space[4], paddingTop: space[4], gap: space[3] },
  ring: { alignItems: "center", minWidth: 44 },
  prevNext: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: space[4], marginTop: space[4] },
  note: { paddingHorizontal: space[4], marginTop: space[3] },
  sheetRow: { flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[4] },
});
