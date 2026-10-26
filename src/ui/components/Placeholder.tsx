/** A screen that is not built yet. Only used while a feature is in progress. */
import { Screen } from "./Layout";
import { EmptyState } from "./Feedback";

export function placeholder(title: string) {
  return function PlaceholderScreen() {
    return (
      <Screen>
        <EmptyState title={title} body="This screen is being built." />
      </Screen>
    );
  };
}
