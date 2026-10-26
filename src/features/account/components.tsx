/**
 * Small pieces shared by the account screens: the back header, group labels and switch
 * rows on hairlines, list skeletons, the inline notice (a rule and type, not a box), the
 * guest prompt and the PDF viewer sheet with Share.
 */
import { useNavigation } from "@react-navigation/native";
import type { ReactNode } from "react";
import { StyleSheet, Switch, View } from "react-native";
import Pdf from "react-native-pdf";
import Share from "react-native-share";
import { isApiError } from "../../api/vendor/client/errors";
import { AccountSheet } from "../../ui/components/AccountSheet";
import { Button } from "../../ui/components/Button";
import { EmptyState, Skeleton } from "../../ui/components/Feedback";
import { Header, Screen } from "../../ui/components/Layout";
import { Text } from "../../ui/components/Text";
import { useTheme } from "../../ui/theme/ThemeProvider";
import { space } from "../../ui/theme/tokens";
import { fileUri } from "./lib/files";
import { u } from "./styles";

/** The API's message for a failed call; switch on `code` before falling back to this. */
export function errorMessage(e: unknown): string {
  if (isApiError(e)) return e.message;
  return e instanceof Error && e.message ? e.message : "Something went wrong. Try again.";
}

export function BackHeader({ title, right }: { title: string; right?: ReactNode }) {
  const navigation = useNavigation();
  return <Header title={title} onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined} right={right} />;
}

/** A pushed account screen: the back header, then a scrolling body with an optional footer. */
export function Page({ title, right, footer, refreshing, onRefresh, children, testID, scroll = true }: { title: string; right?: ReactNode; footer?: ReactNode; refreshing?: boolean; onRefresh?: () => void; children: ReactNode; testID?: string; scroll?: boolean }) {
  return (
    <Screen scroll={false} padded={false} testID={testID}>
      <BackHeader title={title} right={right} />
      <Screen footer={footer} refreshing={refreshing} onRefresh={onRefresh} scroll={scroll} padded={scroll}>
        {children}
      </Screen>
    </Screen>
  );
}

export function GroupLabel({ children, first }: { children: string; first?: boolean }) {
  return (
    <Text variant="eyebrow" tone="muted" style={{ marginTop: first ? space[6] : space[8], marginBottom: space[1] }}>
      {children}
    </Text>
  );
}

export function SwitchRow({ label, detail, value, onChange, disabled, testID, last }: { label: string; detail?: string; value: boolean; onChange?: (v: boolean) => void; disabled?: boolean; testID?: string; last?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.switchRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      <View style={[u.flex, { paddingRight: space[3] }]}>
        <Text variant="bodyStrong" tone={disabled ? "muted" : "default"}>{label}</Text>
        {detail ? <Text variant="small" tone="muted" style={u.mt2}>{detail}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        disabled={disabled || !onChange}
        onValueChange={onChange}
        trackColor={{ true: colors.primary, false: colors.input }}
        thumbColor={colors.card}
        ios_backgroundColor={colors.input}
        testID={testID}
      />
    </View>
  );
}

export function ListSkeleton({ rows = 4, testID }: { rows?: number; testID?: string }) {
  return (
    <View testID={testID} accessibilityLabel="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.skeletonRow}>
          <Skeleton width="62%" height={15} />
          <Skeleton width="38%" height={12} style={{ marginTop: space[2] }} />
        </View>
      ))}
    </View>
  );
}

/** A message set off by a rule on its leading edge (warnings, problems, notes). */
export function Notice({ title, body, tone = "default", children, testID }: { title?: string; body?: string; tone?: "default" | "danger" | "warning" | "success"; children?: ReactNode; testID?: string }) {
  const { colors } = useTheme();
  const rule = tone === "danger" ? colors.danger : tone === "warning" ? colors.warning : tone === "success" ? colors.success : colors.foreground;
  return (
    <View style={[styles.notice, { borderLeftColor: rule }]} accessibilityRole="alert" testID={testID}>
      {title ? <Text variant="bodyStrong">{title}</Text> : null}
      {body ? <Text variant="small" tone="muted" style={title ? u.mt2 : null}>{body}</Text> : null}
      {children}
    </View>
  );
}

export function SignInPrompt({ title, body }: { title: string; body: string }) {
  const navigation = useNavigation();
  return <EmptyState title={title} body={body} action={{ label: "Sign in", onPress: () => navigation.navigate("SignIn") }} testID="account-sign-in-prompt" />;
}

/** A downloaded PDF in a sheet, with Share. */
export function PdfSheet({ path, title, onClose }: { path: string | null; title: string; onClose: () => void}) {
  const { colors } = useTheme();
  return (
    <AccountSheet visible={!!path} title={title} onClose={onClose} scroll={false} full testID="account-pdf-sheet">
      {path ? (
        <View style={u.flex}>
          <Pdf source={{ uri: fileUri(path) }} style={[u.flex, { backgroundColor: colors.muted }]} trustAllCerts={false} />
          <View style={{ padding: space[4] }}>
            <Button
              label="Share"
              variant="outline"
              block
              testID="account-pdf-share"
              onPress={() => { Share.open({ url: fileUri(path), type: "application/pdf", filename: title, failOnCancel: false }).catch(() => undefined); }}
            />
          </View>
        </View>
      ) : null}
    </AccountSheet>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: "row", alignItems: "center", paddingVertical: space[4], minHeight: 56 },
  skeletonRow: { paddingVertical: space[4] },
  notice: { borderLeftWidth: 2, paddingLeft: space[4], paddingVertical: space[1], marginTop: space[4] },
});
