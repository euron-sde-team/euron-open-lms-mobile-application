/** open-lms-loopback: a local HTTP server for offline HLS playback. */
export interface LoopbackServer {
  /** The random port the server listens on, on 127.0.0.1 only. */
  port: number;
  /** A random path prefix every request must start with (/<token>/...). */
  token: string;
}
export function isAvailable(): boolean;
/** Starts serving files under `rootDir` (an absolute directory). Calling it again returns the running server. */
export function start(rootDir: string): Promise<LoopbackServer>;
/** Stops the server and forgets every key. */
export function stop(): Promise<void>;
/** Holds a video's AES-128 key (base64) in memory, served at /<token>/<itemId>/key while the server runs. */
export function setKey(itemId: string, base64Key: string): Promise<void>;
