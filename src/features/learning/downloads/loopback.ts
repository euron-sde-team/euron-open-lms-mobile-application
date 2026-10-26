/**
 * The app side of the loopback server (modules/loopback-server, package
 * "open-lms-loopback"): a tiny HTTP server on 127.0.0.1 that serves downloaded HLS files
 * and holds each video's AES key in native memory only. Read through NativeModules so
 * the app still builds and runs when the native module is not linked; downloads are then
 * hidden (`isLoopbackAvailable()` is false).
 */
import { NativeModules } from "react-native";

interface NativeLoopback {
  start(rootDir: string): Promise<{ port: number; token: string }>;
  stop(): Promise<void>;
  setKey(itemId: string, base64Key: string): Promise<void>;
}

export interface LoopbackServer {
  port: number;
  token: string;
}

function native(): NativeLoopback | null {
  const m = (NativeModules as Record<string, unknown>).OpenLmsLoopback as NativeLoopback | undefined;
  return m && typeof m.start === "function" ? m : null;
}

export function isLoopbackAvailable(): boolean {
  return native() !== null;
}

/** Item ids are ULIDs; anything else never reaches a path. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function isSafeId(id: string): boolean {
  return SAFE_ID.test(id);
}

/** The URL the player opens for a downloaded HLS copy. */
export function playlistUrl(server: LoopbackServer, itemId: string): string {
  if (!isSafeId(itemId)) throw new Error("Invalid item id");
  if (!/^[A-Za-z0-9]{8,128}$/.test(server.token)) throw new Error("Invalid loopback token");
  return `http://127.0.0.1:${server.port}/${server.token}/${itemId}/index.m3u8`;
}

let running: { rootDir: string; server: Promise<LoopbackServer> } | null = null;

/** Starts the server once per root directory (the same port and token while it runs). */
export function ensureStarted(rootDir: string): Promise<LoopbackServer> {
  const n = native();
  if (!n) return Promise.reject(new Error("LOOPBACK_UNAVAILABLE"));
  if (running && running.rootDir === rootDir) return running.server;
  const server = n.start(rootDir).catch((e: unknown) => {
    running = null;
    throw e;
  });
  running = { rootDir, server };
  return server;
}

export async function setKey(itemId: string, base64Key: string): Promise<void> {
  const n = native();
  if (!n) throw new Error("LOOPBACK_UNAVAILABLE");
  if (!isSafeId(itemId)) throw new Error("Invalid item id");
  await n.setKey(itemId, base64Key);
}

/** Stops the server and forgets every key it held. */
export async function stopLoopback(): Promise<void> {
  const n = native();
  running = null;
  if (n) await n.stop().catch(() => undefined);
}
