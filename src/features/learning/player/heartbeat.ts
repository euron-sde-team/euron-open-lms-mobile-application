/**
 * The state behind video progress heartbeats (POST /api/learn/items/:itemId/progress,
 * body `ProgressBeat`). Pure, so the rules are unit tested:
 *
 *   - `playedSeconds` is real playback measured from progress samples, like the web's
 *     beat accumulator: a step forward counts only when the wall clock and the playback
 *     rate allow it, so a seek or a scrub never counts as watching. Whole seconds are
 *     handed out and the fraction carries to the next beat.
 *   - `positionSeconds` is the current playhead, like the web player: it is where the
 *     learner resumes next time. Rewinding to rewatch a part cannot lose progress, because
 *     the server keeps its own furthest mark (item_progress.furthest_seconds) and computes
 *     completion from watched time, never from this position.
 *   - Nothing is sent before anything played (a mount and unmount would wipe the resume
 *     point), and an empty beat at the same position is skipped.
 */
import type { ProgressBeat } from "../../../api/vendor/types";

/** The cadence while playing. */
export const BEAT_INTERVAL_MS = 15_000;

/** A sample step is accepted when it is within this factor of what the wall clock allows. */
const SLACK_FACTOR = 1.5;
/** Fixed slack for timer jitter, in seconds. */
const SLACK_SECONDS = 0.35;

export interface Heartbeat {
  /** A position sample while playing. `nowMs` is the wall clock. */
  sample(positionSeconds: number, nowMs: number, rate?: number): void;
  /** The playhead jumped (a seek, a source reload): the next sample starts a new run. */
  discontinuity(): void;
  /** Playback paused or stopped: the gap is not watching. */
  pause(): void;
  /** Seed the playhead with the server's resume point, before anything is sampled. */
  seed(positionSeconds: number): void;
  /** The beat to send now, or null when there is nothing new. Consumes the played seconds. */
  take(durationSeconds?: number): ProgressBeat | null;
  /** The last sampled playhead, the position the next beat sends. */
  readonly current: number;
  readonly pendingPlayed: number;
}

export function createHeartbeat(): Heartbeat {
  let lastMedia: number | null = null;
  let lastWall = 0;
  let played = 0;
  let current = 0;
  let hasPlayed = false;
  let lastSent = -1;

  return {
    sample(position, nowMs, rate = 1) {
      if (!Number.isFinite(position) || position < 0) return;
      if (lastMedia === null) {
        lastMedia = position;
        lastWall = nowMs;
        hasPlayed = true;
        current = position;
        return;
      }
      const step = position - lastMedia;
      const wall = Math.max(0, (nowMs - lastWall) / 1000);
      const allowed = wall * Math.max(0.25, rate) * SLACK_FACTOR + SLACK_SECONDS;
      if (step > 0 && step <= allowed) played += step;
      lastMedia = position;
      lastWall = nowMs;
      hasPlayed = true;
      current = position;
    },
    discontinuity() {
      lastMedia = null;
    },
    pause() {
      lastMedia = null;
    },
    seed(position) {
      if (Number.isFinite(position) && position >= 0 && !hasPlayed) current = position;
    },
    take(durationSeconds) {
      if (!hasPlayed) return null;
      const whole = Math.floor(played);
      const position = Math.max(0, Math.round(current));
      if (whole === 0 && Math.abs(position - lastSent) < 1) return null;
      played -= whole;
      lastSent = position;
      const d = durationSeconds && Number.isFinite(durationSeconds) && durationSeconds > 0 ? Math.round(durationSeconds) : 0;
      return { positionSeconds: position, playedSeconds: whole, ...(d > 0 ? { durationSeconds: d } : {}) };
    },
    get current() {
      return current;
    },
    get pendingPlayed() {
      return played;
    },
  };
}

/** Codes after which an item stops sending heartbeats (they can never succeed). */
export const STOP_CODES: ReadonlySet<string> = new Set(["STAFF_PREVIEW", "PREVIEW", "COURSE_ACCESS_REQUIRED", "ENROLLMENT_NOT_ACTIVE", "NOT_A_VIDEO"]);
