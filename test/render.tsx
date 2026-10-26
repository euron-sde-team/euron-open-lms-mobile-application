/**
 * Renders a component inside the app's providers (theme, query client, a fake session),
 * so screen tests read like the app.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NavigationContainer } from "@react-navigation/native";
import { render, type RenderOptions } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { ThemeProvider } from "../src/ui/theme/ThemeProvider";

/** Every client made for a test, so test/after-each.ts can wait for it to go quiet. */
export const liveClients = new Set<QueryClient>();

export function testQueryClient(): QueryClient {
  // gcTime Infinity: no cache-cleanup timers left running after a test (Jest waits on them).
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  liveClients.add(client);
  return client;
}

/** Testing Library 14 renders asynchronously, so this is async too: `await renderWithProviders(...)`. */
export async function renderWithProviders(ui: ReactElement, opts: RenderOptions & { queryClient?: QueryClient; navigation?: boolean } = {}) {
  const { queryClient, navigation, ...renderOptions } = opts;
  const client = queryClient ?? testQueryClient();
  liveClients.add(client);
  const tree = (
    <ThemeProvider initialMode="light">
      <QueryClientProvider client={client}>{navigation === false ? ui : <NavigationContainer>{ui}</NavigationContainer>}</QueryClientProvider>
    </ThemeProvider>
  );
  const result = await render(tree, renderOptions);
  return { client, ...result };
}

import type { ReactNode } from "react";
import type { ApiClient } from "../src/api/client";
import type { Me } from "../src/api/vendor/types";
import { SessionContext, type SessionValue } from "../src/app/session";

/** A signed-in learner for tests; override any field. */
export function fakeMe(over: Partial<Me> = {}): Me {
  return { id: "u_1", username: "juniper", displayName: "Juniper Vale", avatarUrl: null, email: "juniper.vale@example.com", status: "ACTIVE", emailVerified: true, totpEnabled: false, role: "LEARNER", ...over } as unknown as Me;
}

/**
 * Provides a fake session. Pass only the API groups the screen uses, as jest.fn()s:
 *   <FakeSession api={{ catalog: { list: jest.fn(async () => page) } }}>...</FakeSession>
 */
export function FakeSession({ children, api = {}, me = fakeMe(), status = "signedIn", ...rest }: { children: ReactNode; api?: object; me?: Me | null; status?: SessionValue["status"] } & Partial<Omit<SessionValue, "api" | "me" | "status">>) {
  const value: SessionValue = {
    status,
    me: status === "signedIn" ? me : null,
    api: api as unknown as ApiClient,
    signIn: jest.fn(async () => ({ ok: true as const })),
    signUp: jest.fn(async () => ({ ok: true as const })),
    adopt: jest.fn(async () => undefined),
    signOut: jest.fn(async () => undefined),
    setMe: jest.fn(),
    retry: jest.fn(),
    ...rest,
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
