import { createAutosaver } from "./autosave";

/** Lets pending promise callbacks run under fake timers. */
const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe("autosave debounce", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("waits for a pause in edits and saves the freshest batch once", async () => {
    const save = jest.fn(async () => undefined);
    const saver = createAutosaver<string>({ delay: 700, save });
    let value = "a";
    saver.schedule(() => value);
    jest.advanceTimersByTime(500);
    value = "ab";
    saver.schedule(() => value);
    jest.advanceTimersByTime(500);
    expect(save).not.toHaveBeenCalled();
    value = "abc";
    jest.advanceTimersByTime(200);
    await settle();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("abc");
  });

  it("skips the save when nothing is pending", async () => {
    const save = jest.fn(async () => undefined);
    const saver = createAutosaver<string>({ delay: 100, save });
    saver.schedule(() => null);
    jest.advanceTimersByTime(100);
    await settle();
    expect(save).not.toHaveBeenCalled();
  });

  it("never overlaps saves: a change during a save goes up after it", async () => {
    let release: () => void = () => undefined;
    const save = jest.fn((_batch: string) => new Promise<void>((r) => (release = r)));
    const saved: string[] = [];
    const saver = createAutosaver<string>({ delay: 100, save, onSaved: (b) => saved.push(b) });
    saver.schedule(() => "one");
    jest.advanceTimersByTime(100);
    await settle();
    expect(save).toHaveBeenCalledTimes(1);
    saver.schedule(() => "two");
    jest.advanceTimersByTime(100);
    await settle();
    expect(save).toHaveBeenCalledTimes(1);
    release();
    await settle();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("two");
    release();
    await settle();
    expect(saved).toEqual(["one", "two"]);
  });

  it("flushes right away and reports errors", async () => {
    const err = new Error("offline");
    const save = jest.fn(async () => Promise.reject(err));
    const onError = jest.fn();
    const onStart = jest.fn();
    const saver = createAutosaver<string>({ delay: 10_000, save, onError, onStart });
    saver.schedule(() => "x");
    await saver.flush();
    expect(save).toHaveBeenCalledWith("x");
    expect(onStart).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(err);
  });

  it("does nothing after stop", async () => {
    const save = jest.fn(async () => undefined);
    const saver = createAutosaver<string>({ delay: 100, save });
    saver.schedule(() => "x");
    saver.stop();
    jest.advanceTimersByTime(1000);
    await saver.flush();
    saver.schedule(() => "y");
    jest.advanceTimersByTime(1000);
    await settle();
    expect(save).not.toHaveBeenCalled();
  });
});
