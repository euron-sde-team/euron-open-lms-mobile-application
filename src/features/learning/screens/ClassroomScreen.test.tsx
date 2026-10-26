import { QueryClient } from "@tanstack/react-query";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import type { ItemContent } from "../../../api/vendor/types";
import { FakeSession, renderWithProviders } from "../../../../test/render";
import { classroom } from "../test/fixtures";
import { ClassroomScreen } from "./ClassroomScreen";

const progress = { completed: false, completedAt: null, positionSeconds: 30, watchedPercent: 10 };

const videoContent = (id: string): ItemContent =>
  ({ kind: "LECTURE", item: { id, kind: "LECTURE", title: `Lesson ${id}`, lectureKind: "VIDEO", durationSeconds: 300, isPreview: false, sectionId: "s2" }, lecture: { lectureKind: "VIDEO", provider: "EVS", videoStatus: "READY", notesHtml: null }, resources: [], progress, prevItemId: null, nextItemId: null }) as ItemContent;

const articleContent = (id: string): ItemContent =>
  ({ kind: "LECTURE", item: { id, kind: "LECTURE", title: `Lesson ${id}`, lectureKind: "ARTICLE", durationSeconds: 0, isPreview: true, sectionId: "s1" }, lecture: { lectureKind: "ARTICLE", html: "<p>Leaves turn light into sugar.</p>" }, resources: [{ id: "r1", title: "Worksheet", url: "https://files.test/w.pdf", external: false, fileName: "w.pdf", sizeBytes: 2048 }], progress, prevItemId: null, nextItemId: null }) as ItemContent;

function makeApi() {
  return {
    meta: { get: jest.fn(async () => ({ academyName: "A", mobile: { downloadsEnabled: false } })) },
    catalog: { course: jest.fn(async () => ({ accessMode: "PAID", instructors: [], subtitle: null, sections: [] })) },
    learn: {
      classroom: jest.fn(async () => classroom()),
      item: jest.fn(async (id: string) => (id === "b" ? articleContent(id) : videoContent(id))),
      playback: jest.fn(async () => ({ provider: "EVS", manifestUrl: "https://evs.test/m.m3u8", thumbnailsUrl: null, posterUrl: null, watermark: "juniper.vale@example.com", expiresAt: "2099-01-01T00:00:00Z", resumeAt: 30 })),
      progress: jest.fn(),
      complete: jest.fn(async () => ({ progress: { ...progress, completed: true }, justCompleted: true, course: { progressPercent: 50, completedAt: null }, certificate: null })),
      bookmark: jest.fn(async () => undefined),
      unbookmark: jest.fn(async () => undefined),
    },
  };
}

function nav() {
  return { navigate: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn(), addListener: jest.fn(() => () => undefined) };
}

async function setup(itemId?: string) {
  const api = makeApi();
  const navigation = nav();
  const route = { key: "Classroom-1", name: "Classroom", params: { courseSlug: "botany", ...(itemId ? { itemId } : {}) } };
  // Mutations keep a 5 minute GC timer by default, which would hold Jest open.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  await renderWithProviders(
    <FakeSession api={api}>
      <ClassroomScreen route={route as never} navigation={navigation as never} />
    </FakeSession>,
    { queryClient }
  );
  return { api, navigation };
}

describe("ClassroomScreen", () => {
  it("opens the resume video in the player with the watermark and the curriculum", async () => {
    const { api } = await setup();
    expect(await screen.findByTestId("player")).toBeTruthy();
    expect(api.learn.item).toHaveBeenCalledWith("c");
    expect(api.learn.playback).toHaveBeenCalledWith("c");
    expect(screen.getByTestId("learning-item-title").props.children).toBe("Lesson c");
    expect(screen.getByTestId("player-watermark", { includeHiddenElements: true }).props.children).toBe("juniper.vale@example.com");
    expect(screen.getByTestId("video").props.source).toMatchObject({ uri: "https://evs.test/m.m3u8" });
    expect(screen.getByTestId("learning-curriculum-item-active")).toBeTruthy();
    expect(screen.getByText("25% · 1 of 4")).toBeTruthy();
  });

  it("moves to the next openable lesson", async () => {
    const { api, navigation } = await setup("a");
    await screen.findByTestId("player");
    await fireEvent.press(screen.getByTestId("learning-next"));
    await waitFor(() => expect(api.learn.item).toHaveBeenCalledWith("b"));
    expect(navigation.setParams).toHaveBeenCalledWith({ itemId: "b" });
  });

  it("shows an article with Mark as done and the resources tab", async () => {
    const { api } = await setup("b");
    expect(await screen.findByTestId("learning-article")).toBeTruthy();
    expect(screen.queryByTestId("player")).toBeNull();
    expect(screen.getByText("Leaves turn light into sugar.")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("learning-mark-done"));
    await waitFor(() => expect(api.learn.complete).toHaveBeenCalledWith("b"));
    expect(await screen.findByTestId("learning-completed")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("learning-classroom-tabs-resources"));
    expect(await screen.findByText("Worksheet")).toBeTruthy();
    expect(screen.getByText("w.pdf · 2 KB")).toBeTruthy();
  });
});
