import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import type { AssignmentView, ItemContent, Submission } from "../../../api/vendor/types";
import { FakeSession } from "../../../../test/render";
import { fakeNavigation, renderScreen } from "../test-render";
import { AssignmentScreen } from "./AssignmentScreen";

// lucide's react-native entry is untransformed ESM under Jest; icons are not under test here.
jest.mock("lucide-react-native", () => new Proxy({ __esModule: true }, { get: (t: Record<string | symbol, unknown>, k) => (k in t ? t[k] : () => null) }));

const view = (over: Partial<AssignmentView> = {}): AssignmentView => ({
  instructionsHtml: "<p>Press a leaf and describe its venation.</p>",
  rubric: [
    { id: "r1", title: "Observation", description: "Accurate drawing", maxPoints: 6 },
    { id: "r2", title: "Write-up", description: null, maxPoints: 4 },
  ],
  maxPoints: 10,
  passPoints: 6,
  dueAt: null,
  allowLate: false,
  accepts: { text: true, files: true, url: true, maxFiles: 2 },
  submissions: [],
  ...over,
});

const submission = (over: Partial<Submission> = {}): Submission => ({ id: "s1", version: 1, status: "SUBMITTED", body: "My notes", bodyHtml: "<p>My notes</p>", url: null, files: [], isLate: false, submittedAt: "2026-01-05T10:00:00Z", review: null, ...over });

const content = (a: AssignmentView): ItemContent =>
  ({ kind: "ASSIGNMENT", item: { id: "as1", kind: "ASSIGNMENT", title: "Leaf study", lectureKind: null, durationSeconds: 0, isPreview: false, sectionId: "s" }, assignment: a, progress: {}, prevItemId: null, nextItemId: null }) as unknown as ItemContent;

async function setup(a: AssignmentView, submit = jest.fn(async () => submission())) {
  const nav = fakeNavigation();
  const api = { learn: { item: jest.fn(async () => content(a)) }, assignments: { submit }, media: { discard: jest.fn(async () => undefined) } };
  const utils = await renderScreen(
    <FakeSession api={api as never}>
      <AssignmentScreen route={{ key: "a", name: "Assignment", params: { courseSlug: "botany", itemId: "as1" } } as never} navigation={nav as never} />
    </FakeSession>
  );
  return { ...utils, api, nav };
}

describe("AssignmentScreen", () => {
  it("shows instructions, the rubric and an open composer, and submits text and a link", async () => {
    const { api } = await setup(view());
    expect(await screen.findByTestId("assignment")).toBeTruthy();
    expect(screen.getByText("10 points · Pass at 6 · No due date")).toBeTruthy();
    expect(screen.getByText("Press a leaf and describe its venation.")).toBeTruthy();
    expect(screen.getByTestId("assignment-rubric")).toBeTruthy();
    expect(screen.getByText("Observation")).toBeTruthy();
    expect(screen.getByText("Total")).toBeTruthy();
    expect(screen.getByTestId("assignment-composer")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("assignment-submit"));
    expect(screen.getByText("Add your work before submitting: text, a link or a file.")).toBeTruthy();
    expect(api.assignments.submit).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId("assignment-url"), "http://github.com/juniper/leaf");
    await fireEvent.press(screen.getByTestId("assignment-submit"));
    expect(screen.getByText("Use a secure link that starts with https://")).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId("assignment-url"), "https://github.com/juniper/leaf");
    await fireEvent.changeText(screen.getByTestId("assignment-body"), "Pinnate venation.");
    await fireEvent.press(screen.getByTestId("assignment-submit"));
    await waitFor(() => expect(api.assignments.submit).toHaveBeenCalledWith("as1", { body: "Pinnate venation.", url: "https://github.com/juniper/leaf" }));
  });

  it("explains the wait while a version is with the reviewer", async () => {
    await setup(view({ submissions: [submission()] }));
    expect(await screen.findByTestId("assignment-closed")).toBeTruthy();
    expect(screen.getByTestId("assignment-status").props.children).toBe("Version 1 · Waiting for review");
    expect(screen.queryByTestId("assignment-composer")).toBeNull();
  });

  it("shows the version history with feedback and rubric scores, and reopens after changes are requested", async () => {
    const reviewed = submission({
      status: "CHANGES_REQUESTED",
      review: { scores: { r1: 4, r2: 1 }, totalPoints: 5, feedbackHtml: "<p>Label the midrib.</p>", reviewer: { displayName: "Ada Moss" } as never, reviewedAt: "2026-01-06T09:00:00Z" },
    });
    await setup(view({ submissions: [reviewed] }));
    expect(await screen.findByTestId("assignment-version-1")).toBeTruthy();
    expect(screen.getByTestId("assignment-status").props.children).toBe("Version 1 · Changes requested · 5 of 10");
    expect(screen.getByText("Label the midrib.")).toBeTruthy();
    expect(screen.getByText("4 / 6")).toBeTruthy();
    expect(screen.getByText("1 / 4")).toBeTruthy();
    expect(screen.getByText("5 / 10")).toBeTruthy();
    expect(screen.getByText("Submit a new version")).toBeTruthy();
    expect(screen.getByTestId("assignment-composer")).toBeTruthy();
  });

  it("is closed once approved, and past due without late work", async () => {
    const first = await setup(view({ submissions: [submission({ status: "APPROVED" })] }));
    expect(await screen.findByText("Your work is approved. Nothing more to do here.")).toBeTruthy();
    await first.unmount();
    await setup(view({ dueAt: "2020-01-01T00:00:00Z", allowLate: false }));
    expect(await screen.findByText("The due date has passed and this assignment does not accept late work.")).toBeTruthy();
    expect(screen.getByText(/No late submissions/)).toBeTruthy();
  });

  it("warns when late work will be marked late", async () => {
    await setup(view({ dueAt: "2020-01-01T00:00:00Z", allowLate: true }));
    expect(await screen.findByText("The due date has passed. This submission will be marked late.")).toBeTruthy();
  });

  it("asks guests to sign in", async () => {
    const nav = fakeNavigation();
    await renderScreen(
      <FakeSession status="signedOut">
        <AssignmentScreen route={{ key: "a", name: "Assignment", params: { courseSlug: "b", itemId: "as1" } } as never} navigation={nav as never} />
      </FakeSession>
    );
    await fireEvent.press(screen.getByText("Sign in"));
    expect(nav.navigate).toHaveBeenCalledWith("SignIn");
  });
});
