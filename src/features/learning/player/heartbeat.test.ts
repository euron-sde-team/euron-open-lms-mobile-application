import { createHeartbeat } from "./heartbeat";

/** Plays from `from` to `to` in 0.5 s ticks at real speed. */
function play(hb: ReturnType<typeof createHeartbeat>, from: number, to: number, t0: number) {
  let t = t0;
  for (let p = from; p <= to + 1e-9; p += 0.5) {
    hb.sample(p, t);
    t += 500;
  }
  return t;
}

describe("heartbeat", () => {
  it("sends nothing before anything played", () => {
    expect(createHeartbeat().take(600)).toBeNull();
  });

  it("counts real playback and keeps the fraction for the next beat", () => {
    const hb = createHeartbeat();
    play(hb, 0, 10.5, 0);
    expect(hb.take(600)).toEqual({ positionSeconds: 11, playedSeconds: 10, durationSeconds: 600 });
    expect(hb.pendingPlayed).toBeCloseTo(0.5);
  });

  it("does not count a seek forward as watching", () => {
    const hb = createHeartbeat();
    let t = play(hb, 0, 5, 0);
    hb.sample(200, t); // a jump of 195 s in half a second
    t += 500;
    hb.sample(200.5, t);
    const beat = hb.take();
    expect(beat?.playedSeconds).toBe(5);
    expect(beat?.positionSeconds).toBe(201);
  });

  it("sends the current playhead after seeking back, so the learner resumes where they stopped", () => {
    const hb = createHeartbeat();
    const t = play(hb, 0, 60, 0);
    expect(hb.take()?.positionSeconds).toBe(60);
    hb.discontinuity();
    play(hb, 20, 30, t + 1000); // rewound to rewatch
    const beat = hb.take();
    expect(beat?.positionSeconds).toBe(30);
    expect(beat?.playedSeconds).toBe(10);
    expect(hb.current).toBe(30);
  });

  it("starts from the seeded resume point, follows the playhead and skips empty repeats", () => {
    const hb = createHeartbeat();
    hb.seed(120);
    expect(hb.current).toBe(120);
    play(hb, 120, 132, 0);
    expect(hb.take()?.positionSeconds).toBe(132);
    expect(hb.take()).toBeNull();
  });

  it("does not count time across a pause", () => {
    const hb = createHeartbeat();
    play(hb, 0, 4, 0);
    hb.pause();
    hb.sample(4.5, 60_000);
    hb.sample(5, 60_500);
    expect(hb.take()?.playedSeconds).toBe(4);
  });

  it("allows faster steps at a higher speed", () => {
    const hb = createHeartbeat();
    let t = 0;
    for (let p = 0; p <= 10; p += 1) {
      hb.sample(p, t, 2);
      t += 500;
    }
    expect(hb.take()?.playedSeconds).toBe(10);
  });
});
