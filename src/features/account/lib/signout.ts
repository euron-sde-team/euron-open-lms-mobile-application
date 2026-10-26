/**
 * Signing out from the app: stop pushes to this device while the session still works,
 * then end the session (which also names the device to the server), then forget the token
 * locally. Signing out everywhere removes every device on the server.
 */
import type { SessionValue } from "../../../app/session";
import { forgetThisDevice, unregisterThisDevice } from "../../../lib/push";

export async function signOutDevice(session: Pick<SessionValue, "api" | "signOut">, opts: { everywhere?: boolean } = {}): Promise<void> {
  if (!opts.everywhere) await unregisterThisDevice(session.api);
  await session.signOut(opts);
  await forgetThisDevice();
}
