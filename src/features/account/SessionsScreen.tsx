/**
 * Where you are signed in: every session with its device and last activity, this one
 * first. Any other session can be signed out; "Sign out everywhere" ends all of them,
 * this one included.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import type { SessionInfo } from "../../api/vendor/client/endpoints/core";
import { qk } from "../../app/query";
import { useSession } from "../../app/session";
import { Button } from "../../ui/components/Button";
import { ErrorState } from "../../ui/components/Feedback";
import { Text } from "../../ui/components/Text";
import { useTheme } from "../../ui/theme/ThemeProvider";
import { space } from "../../ui/theme/tokens";
import { ListSkeleton, Notice, Page, SignInPrompt, errorMessage } from "./components";
import { relativeTime, summarizeUserAgent } from "./lib/format";
import { signOutDevice } from "./lib/signout";
import { u } from "./styles";

export function sortSessions(list: SessionInfo[]): SessionInfo[] {
  return [...list].sort((a, b) => Number(b.current) - Number(a.current) || (b.lastUsedAt ?? b.createdAt).localeCompare(a.lastUsedAt ?? a.createdAt));
}

export function SessionsScreen() {
  const session = useSession();
  const { api, status } = session;
  const { colors } = useTheme();
  const qc = useQueryClient();
  const signedIn = status === "signedIn";
  const q = useQuery({ queryKey: qk.sessions, queryFn: () => api.users.sessions(), enabled: signedIn });
  const revoke = useMutation({
    mutationFn: (id: string) => api.users.revokeSession(id),
    onMutate: (id) => {
      const prev = qc.getQueryData<SessionInfo[]>(qk.sessions);
      qc.setQueryData<SessionInfo[]>(qk.sessions, (s) => s?.filter((x) => x.id !== id));
      return { prev };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(qk.sessions, ctx?.prev),
  });

  if (!signedIn) {
    return (
      <Page title="Sessions">
        <SignInPrompt title="Sign in to see your sessions" body="See every device signed in to your account." />
      </Page>
    );
  }

  const everywhere = () =>
    Alert.alert("Sign out everywhere?", "Every device, including this one, is signed out. You will need to sign in again.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out everywhere", style: "destructive", onPress: () => { signOutDevice(session, { everywhere: true }); } },
    ]);

  return (
    <Page
      title="Sessions"
      testID="account-sessions-screen"
      refreshing={q.isRefetching}
      onRefresh={() => { q.refetch(); }}
      footer={<Button label="Sign out everywhere" variant="outline" block onPress={everywhere} testID="account-sessions-sign-out-all" />}
    >
      <Text tone="muted" style={{ marginTop: space[5] }}>Sign out any device you do not recognise, then change your password.</Text>
      {revoke.isError ? <Notice tone="danger" body={errorMessage(revoke.error)} /> : null}
      <View style={{ marginTop: space[4] }}>
        {q.isPending ? (
          <ListSkeleton rows={3} testID="account-sessions-loading" />
        ) : q.isError ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => { q.refetch(); }} />
        ) : (
          sortSessions(q.data).map((s, i, all) => (
            <View key={s.id} style={[styles.row, i < all.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]} testID="account-session-row">
              <View style={u.flex}>
                <Text variant="bodyStrong">{summarizeUserAgent(s.userAgent)}</Text>
                <Text variant="small" tone="muted">
                  {[s.current ? "This device" : null, s.lastUsedAt ? `Active ${relativeTime(s.lastUsedAt).toLowerCase()}` : `Signed in ${relativeTime(s.createdAt).toLowerCase()}`, s.ip].filter(Boolean).join(" · ")}
                </Text>
              </View>
              {!s.current ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`Sign out ${summarizeUserAgent(s.userAgent)}`} onPress={() => revoke.mutate(s.id)} hitSlop={8} style={styles.action} testID="account-session-revoke">
                  <Text variant="smallStrong" tone="danger">Sign out</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        )}
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: space[4], gap: space[3] },
  action: { minHeight: 44, justifyContent: "center", paddingHorizontal: space[1] },
});
