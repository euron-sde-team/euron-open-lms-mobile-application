/**
 * After every test, let in-flight queries and mutations finish inside act(), so a screen
 * that is still loading its secondary data (a summary, another tab) does not update after
 * the test ended, and let list virtualization flush its batched layout pass (a 50 ms
 * timer in VirtualizedList). Then forget the clients.
 */
import { act, waitFor } from "@testing-library/react-native";
import { liveClients } from "./render";

afterEach(async () => {
  if (liveClients.size) {
    await waitFor(() => {
      for (const c of liveClients) expect(c.isFetching() + c.isMutating()).toBe(0);
    }).catch(() => undefined);
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 80)));
  }
  for (const c of liveClients) c.clear();
  liveClients.clear();
});
