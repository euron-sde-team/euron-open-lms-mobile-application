/**
 * The app's API client: the learner endpoint groups vendored from euron-open-lms (catalog,
 * learning, assessments, commerce, account, notifications) over the native transport,
 * plus the native-only session calls.
 */
import { config } from "../config";
import { HttpClient, type ApiClientOptions, type NativeAuthResult } from "./http";
import { assessmentEndpoints } from "./vendor/client/endpoints/assessments";
import { catalogEndpoints } from "./vendor/client/endpoints/catalog";
import { commerceEndpoints } from "./vendor/client/endpoints/commerce";
import { coreEndpoints } from "./vendor/client/endpoints/core";
import { helpers } from "./vendor/client/endpoints/helpers";
import { learningEndpoints } from "./vendor/client/endpoints/learning";

export function createApiClient(opts: ApiClientOptions) {
  const http = new HttpClient(opts);
  const h = helpers(http as never);
  const core = coreEndpoints(h);
  return {
    http,
    ...core,
    ...catalogEndpoints(h),
    ...learningEndpoints(h),
    ...assessmentEndpoints(h),
    ...commerceEndpoints(h),
    /** Session calls that carry the refresh token in the body (native token mode). */
    session: {
      refresh: () => http.refreshSession(),
      logout: (refreshToken: string, deviceToken?: string | null) =>
        http.request<void>("POST", "/auth/logout", { body: { refreshToken, ...(deviceToken ? { deviceToken } : {}) }, noRefresh: true }),
      logoutAll: () => http.request<void>("POST", "/auth/logout-all"),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
export type { NativeAuthResult };
export const API_BASE_URL = config.apiBaseUrl;
