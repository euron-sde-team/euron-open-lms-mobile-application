/**
 * Screen capture protection while paid video plays: Android FLAG_SECURE and an iOS overlay
 * on capture, through react-native-screenguard. The rule is a pure function so it is
 * tested on its own: a downloaded copy is always protected; online, a video is protected
 * unless the course is free or the lesson is a free preview.
 */
import { useEffect } from "react";
import ScreenGuard from "react-native-screenguard";
import type { AccessMode } from "../../../api/vendor/types";
import { config } from "../../../config";

export interface ProtectInput {
  /** Playing a downloaded copy. */
  offline: boolean;
  isPreview: boolean;
  /** The course's access mode; null while the course page has not loaded (treated as paid). */
  accessMode: AccessMode | null;
}

export function shouldProtect({ offline, isPreview, accessMode }: ProtectInput, guardOn: boolean = config.captureGuard): boolean {
  if (!guardOn) return false;
  if (offline) return true;
  if (isPreview) return false;
  return accessMode !== "FREE";
}

let initialised: Promise<unknown> | null = null;
let holders = 0;

type Guard = typeof ScreenGuard & { initSettings?: (d: object) => Promise<unknown> };

async function enable(backgroundColor: string) {
  const g = ScreenGuard as Guard;
  if (!initialised) {
    // Capture and recording both off means the secure layer is on (see the library's applySecureState).
    initialised = (g.initSettings?.({ enableCapture: false, enableRecord: false, displayScreenGuardOverlay: false, displayScreenguardOverlayAndroid: false }) ?? Promise.resolve()).catch(() => {
      initialised = null;
    });
  }
  await initialised;
  await g.register({ backgroundColor });
}

/** Holds protection on while `on` and the component is mounted. Nested holders are counted. */
export function useScreenProtection(on: boolean, backgroundColor: string) {
  useEffect(() => {
    if (!on) return;
    holders += 1;
    enable(backgroundColor).catch(() => undefined);
    return () => {
      holders = Math.max(0, holders - 1);
      if (holders === 0) Promise.resolve(ScreenGuard.unregister()).catch(() => undefined);
    };
  }, [on, backgroundColor]);
}
