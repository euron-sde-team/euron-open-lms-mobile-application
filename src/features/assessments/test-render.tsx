/**
 * Test-only render for this area. Testing Library 14 renders asynchronously, so this
 * awaits the render (the shared test/render.tsx helper spreads the pending promise). It
 * wraps the same providers: theme, a fresh query client and a navigation container.
 */
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { NavigationContainer } from "@react-navigation/native";
import { render } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { testQueryClient } from "../../../test/render";
import { ThemeProvider } from "../../ui/theme/ThemeProvider";

export async function renderScreen(ui: ReactElement, opts: { queryClient?: QueryClient } = {}) {
  const client = opts.queryClient ?? testQueryClient();
  const utils = await render(
    <ThemeProvider initialMode="light">
      <QueryClientProvider client={client}>
        <NavigationContainer>{ui}</NavigationContainer>
      </QueryClientProvider>
    </ThemeProvider>
  );
  return { client, ...utils };
}

/** A stand-in for the native stack's navigation prop, recording listeners so tests can fire them. */
export function fakeNavigation() {
  const listeners: Record<string, (e: unknown) => void> = {};
  return {
    listeners,
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: jest.fn(() => true),
    dispatch: jest.fn(),
    addListener: jest.fn((name: string, fn: (e: unknown) => void) => {
      listeners[name] = fn;
      return () => {
        delete listeners[name];
      };
    }),
  };
}
