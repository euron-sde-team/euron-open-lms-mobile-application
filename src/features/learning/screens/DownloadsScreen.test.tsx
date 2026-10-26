import { NativeModules } from "react-native";
import { screen } from "@testing-library/react-native";
import { FakeSession, renderWithProviders } from "../../../../test/render";
import { downloadStatus, DownloadsScreen } from "./DownloadsScreen";
import type { DownloadEntry } from "../downloads/state";

const entry = (over: Partial<DownloadEntry> = {}): DownloadEntry => ({
  itemId: "01HXA", userId: "u_1", courseId: "c1", courseSlug: "botany", courseTitle: "Botany", title: "Leaves", kind: "hls", state: "done", progress: 1, bytes: 5 * 1024 * 1024, durationSeconds: 600,
  watermark: null, offlineExpiresAt: "2026-05-13T12:00:00Z", createdAt: "2026-05-01T00:00:00Z", updatedAt: "2026-05-01T00:00:00Z", error: null, autoResume: false, ...over,
});

describe("DownloadsScreen", () => {
  afterEach(() => {
    delete (NativeModules as Record<string, unknown>).OpenLmsLoopback;
  });

  it("explains when this build cannot save videos", async () => {
    await renderWithProviders(
      <FakeSession api={{}} status="signedOut">
        <DownloadsScreen />
      </FakeSession>
    );
    expect(await screen.findByTestId("learning-downloads-unavailable")).toBeTruthy();
  });

  it("shows the empty state when nothing is saved", async () => {
    (NativeModules as Record<string, unknown>).OpenLmsLoopback = { start: jest.fn(), stop: jest.fn(), setKey: jest.fn() };
    await renderWithProviders(
      <FakeSession api={{}} status="signedOut">
        <DownloadsScreen />
      </FakeSession>
    );
    expect(await screen.findByTestId("learning-downloads-empty")).toBeTruthy();
  });

  it("describes each state", () => {
    const now = Date.parse("2026-05-01T12:00:00Z");
    expect(downloadStatus(entry(), now)).toBe("5.0 MB · Expires in 12 days");
    expect(downloadStatus(entry({ state: "downloading", progress: 0.42, bytes: 0 }), now)).toBe("Downloading 42%");
    expect(downloadStatus(entry({ state: "paused", progress: 0.5 }), now)).toBe("Paused at 50%");
    expect(downloadStatus(entry({ state: "failed", error: "This video cannot be downloaded." }), now)).toBe("This video cannot be downloaded.");
    expect(downloadStatus(entry({ offlineExpiresAt: "2026-04-01T00:00:00Z" }), now)).toBe("Expired. Connect to the internet to renew");
  });
});
