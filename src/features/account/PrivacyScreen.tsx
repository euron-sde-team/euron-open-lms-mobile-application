/**
 * Privacy and data: export everything the account holds as a JSON file (saved to the
 * cache, then shared), and delete the account. Deletion signs out everywhere at once; the
 * data is erased after the grace period the server returns, and signing in before then
 * cancels it.
 */
import { useNavigation } from "@react-navigation/native";
import { useState } from "react";
import { Alert, View } from "react-native";
import Share from "react-native-share";
import { isApiError } from "../../api/vendor/client/errors";
import { useSession } from "../../app/session";
import { Button } from "../../ui/components/Button";
import { Field } from "../../ui/components/Inputs";
import { Divider } from "../../ui/components/Layout";
import { Text } from "../../ui/components/Text";
import { space } from "../../ui/theme/tokens";
import { Notice, Page, SignInPrompt, errorMessage } from "./components";
import { blocksDeletion } from "./lib/billing";
import { dateOnly, digits6 } from "./lib/format";
import { exportFileName, fileUri, saveBlobToCache } from "./lib/files";
import { signOutDevice } from "./lib/signout";
import { u } from "./styles";

export function deleteErrorCopy(e: unknown): string {
  if (!isApiError(e)) return errorMessage(e);
  switch (e.code) {
    case "INVALID_CREDENTIALS":
      return "That password is not right.";
    case "INVALID_TOTP":
      return "That code did not match. Codes change every 30 seconds.";
    case "SUBSCRIPTION_ACTIVE":
      return "You still have a live plan. Cancel it in Subscription first (it keeps running until the period ends), then delete your account.";
    case "OWNER_MUST_TRANSFER":
    case "LAST_ADMIN":
      return "This account still owns something others rely on. Hand it over on the website first.";
    default:
      return errorMessage(e);
  }
}

export function PrivacyScreen() {
  const session = useSession();
  const { api, me, status } = session;
  const navigation = useNavigation();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (status !== "signedIn" || !me) {
    return (
      <Page title="Privacy and data">
        <SignInPrompt title="Sign in to manage your data" body="Download a copy of your data or delete your account." />
      </Page>
    );
  }

  const exportData = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const blob = await api.users.exportData();
      const path = await saveBlobToCache(blob, exportFileName(me.username));
      await Share.open({ url: fileUri(path), type: "application/json", filename: exportFileName(me.username), failOnCancel: false });
    } catch (e) {
      setExportError(isApiError(e) && e.status === 429 ? "You can export 3 times a day. Try again tomorrow." : errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const ready = typed.trim() === me.username && !!password && (!me.totpEnabled || totp.length === 6);
  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const r = await api.users.deleteMe({ password, ...(me.totpEnabled ? { totp } : {}) });
      const when = dateOnly(r?.purgeAfter);
      Alert.alert("Your account is scheduled for deletion", `${when ? `Your data is erased for good on ${when}.` : "Your data is erased after a grace period."} Sign in before then to cancel.`);
      await signOutDevice(session, { everywhere: true });
    } catch (e) {
      setDeleteError(deleteErrorCopy(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Page title="Privacy and data" testID="account-privacy-screen">
      <View style={{ marginTop: space[6] }}>
        <Text variant="heading">Download your data</Text>
        <Text tone="muted" variant="small" style={[u.mt4, { marginBottom: space[4] }]}>A JSON file with what your account holds: profile, learning progress, notes, submissions, posts and orders. You can export 3 times a day.</Text>
        {exportError ? <Notice tone="danger" body={exportError} /> : null}
        <Button label="Download my data" variant="outline" loading={exporting} onPress={() => { exportData(); }} testID="account-export-data" style={{ marginTop: space[2] }} />
      </View>
      <View style={{ marginTop: space[8] }}>
        <Divider />
      </View>
      <View style={{ marginTop: space[6] }}>
        <Text variant="heading">Delete account</Text>
        <Text tone="muted" variant="small" style={u.mt4}>You are signed out everywhere at once. Your notes, quiz answers, submissions and certificates are erased after a grace period; signing in before then cancels the deletion. Orders are kept for accounting without your name.</Text>
        {blocksDeletion(me.subscription) ? (
          <Notice tone="warning" body="You have a plan. Cancel it first; it can run until the end of the period you paid for.">
            <Button label="Manage subscription" variant="ghost" size="sm" style={[u.start, { marginTop: space[2] }]} onPress={() => navigation.navigate("Subscription")} />
          </Notice>
        ) : null}
        {deleteError ? <Notice tone="danger" body={deleteError} testID="account-delete-error" /> : null}
        <View style={{ marginTop: space[4] }}>
          <Field label={`Type your username, ${me.username}, to confirm`} value={typed} onChangeText={setTyped} autoCapitalize="none" autoCorrect={false} testID="account-delete-username" />
          <Field label="Password" secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword} testID="account-delete-password" />
          {me.totpEnabled ? <Field label="6 digit code from your app" keyboardType="number-pad" value={totp} onChangeText={(t) => setTotp(digits6(t))} maxLength={6} testID="account-delete-totp" /> : null}
        </View>
        <Button label="Delete account" variant="danger" disabled={!ready} loading={deleting} onPress={() => { deleteAccount(); }} testID="account-delete-confirm" />
      </View>
    </Page>
  );
}
