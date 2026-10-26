/**
 * The academy's public configuration (GET /api/meta): its name and logo, currencies,
 * payment routing and the mobile switches set by admins. Cached between launches so the
 * app opens with the right name even before the network answers.
 */
import { useQuery } from "@tanstack/react-query";
import { Platform } from "react-native";
import type { AcademyMeta } from "../api/vendor/types";
import { prefs } from "../lib/storage";
import { qk } from "./query";
import { useApi } from "./session";

const KEY = "meta.cache";

export function useMeta() {
  const api = useApi();
  return useQuery({
    queryKey: qk.meta,
    queryFn: async () => {
      const m = await api.meta.get();
      prefs.setJson(KEY, m);
      return m;
    },
    initialData: () => prefs.getJson<AcademyMeta>(KEY),
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60_000,
  });
}

export interface MobileFlags {
  /** iOS only: show a "continue on the web" link on paid course pages. */
  iosWebPurchaseLink: boolean;
  downloadsEnabled: boolean;
  pushEnabled: boolean;
  minSupportedVersion: string | null;
}

/** Safe defaults for an older server that does not send `mobile` yet: nothing extra turned on. */
export function mobileFlags(meta: AcademyMeta | undefined): MobileFlags {
  const m = (meta as (AcademyMeta & { mobile?: Partial<MobileFlags> }) | undefined)?.mobile;
  return {
    iosWebPurchaseLink: !!m?.iosWebPurchaseLink,
    downloadsEnabled: !!m?.downloadsEnabled,
    pushEnabled: !!m?.pushEnabled,
    minSupportedVersion: m?.minSupportedVersion ?? null,
  };
}

/**
 * What a paid item's purchase area may show on this device. Android checks out in the app
 * (Razorpay, or Stripe in a browser tab); iOS never offers a purchase inside the app and at
 * most links to the academy's website, when the admin has turned that on.
 */
export type PurchaseMode = "in-app" | "web-link" | "none";

export function purchaseMode(meta: AcademyMeta | undefined, os: string = Platform.OS): PurchaseMode {
  if (os === "android") return "in-app";
  return mobileFlags(meta).iosWebPurchaseLink ? "web-link" : "none";
}
