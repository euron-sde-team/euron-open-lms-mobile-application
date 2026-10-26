/**
 * Query keys the account area adds on top of app/query.ts `qk`. Each sits under a `qk`
 * prefix, so invalidating the shared key also refreshes these.
 */
import { qk } from "../../../app/query";

export const akq = {
  notificationList: [...qk.notifications, "list"] as const,
  invoices: [...qk.orders, "invoices"] as const,
  quote: (req: object) => ["billing", "quote", req] as const,
};
