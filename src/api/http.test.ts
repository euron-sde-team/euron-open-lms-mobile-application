import { HttpClient, buildQuery, type NativeAuthResult } from "./http";

const session = (n: number): NativeAuthResult =>
  ({ accessToken: `access-${n}`, expiresIn: 900, refreshToken: `refresh-${n}`, refreshExpiresAt: "2099-01-01T00:00:00.000Z", user: { id: "u1" } }) as unknown as NativeAuthResult;

function json(status: number, body?: unknown) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => "application/json" }, text: async () => (body === undefined ? "" : JSON.stringify(body)) } as unknown as Response;
}

describe("native transport", () => {
  it("sends X-Client: native and the bearer token, never cookies", async () => {
    const fetch = jest.fn(async () => json(200, { ok: true }));
    const http = new HttpClient({ baseUrl: "http://api.test/api/", getAccessToken: () => "tok", getRefreshToken: async () => null, fetch });
    await http.request("GET", "/auth/me");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("http://api.test/api/auth/me");
    expect(init.headers["X-Client"]).toBe("native");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(init.credentials).toBe("omit");
  });

  it("refreshes once for concurrent 401s and retries each request with the new token", async () => {
    let access = "stale";
    let refreshCalls = 0;
    const fetch = jest.fn(async (url: string, init: RequestInit & { headers: Record<string, string> }) => {
      if (url.endsWith("/auth/refresh")) {
        refreshCalls += 1;
        expect(JSON.parse(String(init.body))).toEqual({ refreshToken: "refresh-0" });
        return json(200, session(1));
      }
      return init.headers.Authorization === "Bearer access-1" ? json(200, { ok: true }) : json(401, { error: "expired", code: "TOKEN_EXPIRED" });
    });
    const onRefresh = jest.fn(async (r: NativeAuthResult) => {
      access = r.accessToken;
    });
    const http = new HttpClient({ baseUrl: "http://api.test/api", getAccessToken: () => access, getRefreshToken: async () => "refresh-0", onRefresh, fetch: fetch as never });
    await Promise.all([http.request("GET", "/a"), http.request("GET", "/b"), http.request("GET", "/c")]);
    expect(refreshCalls).toBe(1);
    expect(onRefresh).toHaveBeenCalledWith(expect.objectContaining({ refreshToken: "refresh-1" }));
  });

  it("signs out when the refresh token is rejected, and keeps the session on a network error", async () => {
    const onSignedOut = jest.fn();
    const rejected = new HttpClient({
      baseUrl: "http://api.test/api",
      getAccessToken: () => "stale",
      getRefreshToken: async () => "refresh-0",
      onSignedOut,
      fetch: (async (url: string) => (url.endsWith("/auth/refresh") ? json(401, { error: "reused", code: "REFRESH_REUSED" }) : json(401, { error: "expired", code: "TOKEN_EXPIRED" }))) as never,
    });
    await expect(rejected.request("GET", "/a")).rejects.toMatchObject({ status: 401 });
    expect(onSignedOut).toHaveBeenCalledWith("SESSION_EXPIRED");

    const offline = jest.fn();
    const flaky = new HttpClient({
      baseUrl: "http://api.test/api",
      getAccessToken: () => "stale",
      getRefreshToken: async () => "refresh-0",
      onSignedOut: offline,
      fetch: (async (url: string) => {
        if (url.endsWith("/auth/refresh")) throw new TypeError("Network request failed");
        return json(401, { error: "expired", code: "TOKEN_EXPIRED" });
      }) as never,
    });
    await expect(flaky.request("GET", "/a")).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(offline).not.toHaveBeenCalled();
  });

  it("builds queries without empty values and repeats arrays", () => {
    expect(buildQuery({ q: "sql", level: ["BEGINNER", "ADVANCED"], cursor: undefined, empty: "" })).toBe("?q=sql&level=BEGINNER&level=ADVANCED");
    expect(buildQuery({})).toBe("");
  });
});
