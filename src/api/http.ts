/**
 * The native transport behind the vendored endpoint groups (src/api/vendor/client).
 * Same contract as the web client in euron-open-lms packages/api-client/src/http.ts, with
 * one difference: the session is in native token mode. Every request says
 * `X-Client: native`, so the API returns the refresh token in the body instead of a
 * cookie, and the app keeps it in the Keychain (lib/secure-store.ts). The access token
 * stays in memory only.
 */
import { ApiError, REFRESHABLE_CODES, networkError, toApiError } from "./vendor/client/errors";
import type { AuthResult } from "./vendor/types";

export type QueryValue = string | number | boolean | null | undefined | readonly (string | number)[];
export type Query = Record<string, QueryValue>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Kept for contract parity with the web client; native mode never uses cookies. */
  withCredentials?: boolean;
  /** Skip the refresh-and-retry dance (the auth endpoints themselves). */
  noRefresh?: boolean;
  /** Return the raw Response (PDFs and other non-JSON bodies). */
  raw?: boolean;
  keepalive?: boolean;
}

export type SignOutReason = "SESSION_EXPIRED" | "SIGNED_OUT" | "REVOKED";

/** What a native session refresh returns: the usual result plus the rotated refresh token. */
export type NativeAuthResult = AuthResult & { refreshToken: string; refreshExpiresAt: string };

export interface ApiClientOptions {
  /** API base including /api, for example "http://localhost:5026/api". */
  baseUrl: string;
  getAccessToken: () => string | null;
  /** The stored refresh token (Keychain), or null when signed out. */
  getRefreshToken: () => Promise<string | null>;
  /** Called with every successful refresh: store the rotated refresh token and the access token. */
  onRefresh?: (result: NativeAuthResult) => void | Promise<void>;
  onSignedOut?: (reason: SignOutReason) => void;
  fetch?: typeof fetch;
  /** Sent as X-App-Version so the server can log which build called it. */
  appVersion?: string;
}

export function buildQuery(query?: Query): string {
  if (!query) return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export class HttpClient {
  private inflightRefresh: Promise<NativeAuthResult | null> | null = null;
  private readonly fetchImpl: typeof fetch;
  readonly baseUrl: string;

  constructor(private readonly opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? ((...args) => globalThis.fetch(...args));
  }

  url(path: string, query?: Query): string {
    return `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}${buildQuery(query)}`;
  }

  /**
   * Single-flight refresh: concurrent 401s share one POST /auth/refresh, because the
   * refresh token rotates and a second use of the old one would revoke the session.
   * Resolves null when the session is over; rejects on transport errors so a flaky
   * network never signs anyone out.
   */
  refreshSession(): Promise<NativeAuthResult | null> {
    if (!this.inflightRefresh) {
      this.inflightRefresh = this.doRefresh().finally(() => {
        this.inflightRefresh = null;
      });
    }
    return this.inflightRefresh;
  }

  private async doRefresh(): Promise<NativeAuthResult | null> {
    const refreshToken = await this.opts.getRefreshToken();
    if (!refreshToken) return null;
    try {
      const result = await this.send<NativeAuthResult | undefined>("POST", "/auth/refresh", { noRefresh: true, body: { refreshToken } }, null);
      if (!result) return null;
      await this.opts.onRefresh?.(result);
      return result;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return null;
      throw e;
    }
  }

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const token = this.opts.getAccessToken();
    try {
      return await this.send<T>(method, path, options, token);
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401 || options.noRefresh) throw e;
      if (!REFRESHABLE_CODES.has(e.code) && !(token && e.code === "UNAUTHENTICATED")) throw e;
      const refreshed = await this.refreshSession();
      if (!refreshed) {
        this.opts.onSignedOut?.("SESSION_EXPIRED");
        throw e;
      }
      return this.send<T>(method, path, options, refreshed.accessToken);
    }
  }

  private async send<T>(method: string, path: string, options: RequestOptions, token: string | null): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json", "X-Client": "native", ...options.headers };
    if (this.opts.appVersion) headers["X-App-Version"] = this.opts.appVersion;
    let body: string | FormData | undefined;
    if (options.body !== undefined) {
      if (typeof FormData !== "undefined" && options.body instanceof FormData) body = options.body;
      else {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(options.body);
      }
    }
    if (token) headers.Authorization = `Bearer ${token}`;

    let res: Response;
    try {
      res = await this.fetchImpl(this.url(path, options.query), { method, headers, body, signal: options.signal, credentials: "omit" });
    } catch (e) {
      if (isAbort(e)) throw e;
      throw networkError(e);
    }
    if (options.raw && res.ok) return res as unknown as T;
    const payload = await readBody(res);
    if (!res.ok) throw toApiError(res.status, payload);
    return payload as T;
  }
}

function isAbort(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { name?: string }).name === "AbortError";
}

async function readBody(res: Response): Promise<unknown> {
  if (res.status === 204 || res.status === 205) return undefined;
  const text = await res.text().catch(() => "");
  if (!text) return undefined;
  if ((res.headers.get("content-type") ?? "").includes("json")) {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }
  return text;
}
