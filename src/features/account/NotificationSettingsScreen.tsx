/**
 * Notification settings: per-category switches for email and for push, saved at once with
 * an optimistic update of `me`. Receipts, refunds, access changes and security mail have
 * no category and always send; they are shown on and locked. The push section also shows
 * whether this phone allows notifications, with a way to the system settings.
 */
import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, View } from "react-native";
import { EMAIL_CATEGORIES, PUSH_DEFAULTS, type EmailCategory, type Me } from "../../api/vendor/types";
import { mobileFlags, useMeta } from "../../app/meta";
import { useSession } from "../../app/session";
import { askPushPermission, getPushMessaging, readPushPermission, registerThisDevice, type PushPermission } from "../../lib/push";
import { Button } from "../../ui/components/Button";
import { Text } from "../../ui/components/Text";
import { space } from "../../ui/theme/tokens";
import { GroupLabel, Notice, Page, SignInPrompt, SwitchRow, errorMessage } from "./components";
import { u } from "./styles";

export const CATEGORY_COPY: Record<EmailCategory, { title: string; body: string }> = {
  LEARNING: { title: "Learning", body: "Graded assignments, new certificates, and nudges to finish a course you started." },
  COMMUNITY: { title: "Questions and reviews", body: "Replies to your questions, accepted answers and replies to your reviews." },
  BILLING_REMINDERS: { title: "Billing reminders", body: "Notice before a renewal or a trial ends, and when a payment needs attention." },
  PRODUCT_UPDATES: { title: "News and new courses", body: "Occasional news about new courses and changes to courses you are taking." },
};

type Channel = "emailPreferences" | "pushPreferences";

export function NotificationSettingsScreen() {
  const { status, me } = useSession();
  if (status !== "signedIn" || !me) {
    return (
      <Page title="Notifications">
        <SignInPrompt title="Sign in to choose notifications" body="Pick which emails and push notifications you get." />
      </Page>
    );
  }
  return <Settings me={me} />;
}

function Settings({ me }: { me: Me }) {
  const { api, setMe } = useSession();
  const meta = useMeta();
  const pushOnServer = mobileFlags(meta.data).pushEnabled;
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<PushPermission>("unavailable");
  const messaging = getPushMessaging();

  const refreshPermission = useCallback(() => { readPushPermission(messaging).then(setPermission); }, [messaging]);
  useEffect(() => {
    refreshPermission();
    // Coming back from the system settings may have changed it.
    const sub = AppState.addEventListener("change", (s) => s === "active" && refreshPermission());
    return () => sub.remove();
  }, [refreshPermission]);

  const save = async (channel: Channel, c: EmailCategory, on: boolean) => {
    setError(null);
    const prev = me;
    setMe({ ...me, [channel]: { ...me[channel], [c]: on } } as Me);
    try {
      setMe(await api.users.updateMe({ [channel]: { [c]: on } }));
    } catch (e) {
      setMe(prev);
      setError(`Could not save that change. ${errorMessage(e)}`);
    }
  };

  const turnOn = async () => {
    const p = await askPushPermission(messaging);
    setPermission(p);
    if (p === "granted" && messaging) await registerThisDevice(api, messaging).catch(() => undefined);
  };

  const pushAvailable = pushOnServer && permission !== "unavailable";
  const push = me.pushPreferences ?? PUSH_DEFAULTS;

  return (
    <Page title="Notifications" testID="account-notification-settings-screen">
      {error ? <Notice tone="danger" body={error} /> : null}

      <GroupLabel>Push on this phone</GroupLabel>
      {!pushAvailable ? (
        <Text tone="muted" style={{ paddingVertical: space[3] }} testID="account-push-unavailable">This academy does not send push notifications yet. You still get them in the app and by email.</Text>
      ) : (
        <>
          {permission !== "granted" ? (
            <View style={{ paddingVertical: space[3] }} testID={`account-push-permission-${permission}`}>
              <Text tone="muted">{permission === "denied" ? "Notifications are off for this app in your phone's settings." : "Allow notifications to hear about replies, grades and certificates."}</Text>
              <Button
                label={permission === "denied" ? "Open settings" : "Allow notifications"}
                variant="outline"
                size="sm"
                style={[u.start, { marginTop: space[3] }]}
                onPress={() => {
                  if (permission === "denied") Linking.openSettings().catch(() => undefined);
                  else turnOn().catch(() => undefined);
                }}
                testID="account-push-permission-action"
              />
            </View>
          ) : null}
          {EMAIL_CATEGORIES.map((c) => (
            <SwitchRow key={c} label={CATEGORY_COPY[c].title} detail={CATEGORY_COPY[c].body} value={push[c]} onChange={(v) => { save("pushPreferences", c, v); }} testID={`account-push-pref-${c}`} />
          ))}
          <SwitchRow label="Payments and access" detail="Receipts, refunds and changes to your course access always arrive." value disabled last />
        </>
      )}

      <GroupLabel>Email</GroupLabel>
      {EMAIL_CATEGORIES.map((c) => (
        <SwitchRow key={c} label={CATEGORY_COPY[c].title} detail={CATEGORY_COPY[c].body} value={me.emailPreferences?.[c] ?? true} onChange={(v) => { save("emailPreferences", c, v); }} testID={`account-email-pref-${c}`} />
      ))}
      <SwitchRow label="Receipts and security" detail="Receipts, invoices and security emails (sign-in codes, password changes) are always sent." value disabled last />
    </Page>
  );
}
