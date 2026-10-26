import { NativeModules } from "react-native";

const native = { start: jest.fn(async () => ({ port: 51234, token: "a1b2c3d4e5f60718293a4b5c6d7e8f90" })), stop: jest.fn(async () => undefined), setKey: jest.fn(async () => undefined) };

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
});

describe("loopback wrapper", () => {
  it("is unavailable, and refuses to start, when the native module is not linked", async () => {
    delete (NativeModules as Record<string, unknown>).OpenLmsLoopback;
    const lb = require("./loopback") as typeof import("./loopback");
    expect(lb.isLoopbackAvailable()).toBe(false);
    await expect(lb.ensureStarted("/docs/downloads")).rejects.toThrow("LOOPBACK_UNAVAILABLE");
  });

  it("starts once per root and builds the playlist URL", async () => {
    (NativeModules as Record<string, unknown>).OpenLmsLoopback = native;
    const lb = require("./loopback") as typeof import("./loopback");
    expect(lb.isLoopbackAvailable()).toBe(true);
    const a = await lb.ensureStarted("/docs/downloads");
    const b = await lb.ensureStarted("/docs/downloads");
    expect(a).toBe(b);
    expect(native.start).toHaveBeenCalledTimes(1);
    expect(lb.playlistUrl(a, "01HXYZABCDEFGHJKMNPQRSTVWX")).toBe("http://127.0.0.1:51234/a1b2c3d4e5f60718293a4b5c6d7e8f90/01HXYZABCDEFGHJKMNPQRSTVWX/index.m3u8");
    await lb.setKey("01HXYZABCDEFGHJKMNPQRSTVWX", "AAEC");
    expect(native.setKey).toHaveBeenCalledWith("01HXYZABCDEFGHJKMNPQRSTVWX", "AAEC");
  });

  it("never puts an unsafe id into a path", async () => {
    (NativeModules as Record<string, unknown>).OpenLmsLoopback = native;
    const lb = require("./loopback") as typeof import("./loopback");
    const server = { port: 1, token: "a1b2c3d4e5f60718" };
    expect(() => lb.playlistUrl(server, "../secret")).toThrow();
    expect(() => lb.playlistUrl(server, "a/b")).toThrow();
    expect(() => lb.playlistUrl({ port: 1, token: "../x" }, "abc")).toThrow();
    await expect(lb.setKey("..", "AAEC")).rejects.toThrow();
    expect(lb.isSafeId("01HXYZ_a-b")).toBe(true);
  });
});
