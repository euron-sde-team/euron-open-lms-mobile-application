/**
 * Security: change the password (the server then signs out every device), and two-factor
 * sign-in: set up with the secret or the authenticator link, turn off, or replace the
 * recovery codes. Recovery codes are shown once, right after the server returns them.
 * Secrets are selectable, with a Copy button; recovery codes can also go to the share sheet
 * (a password manager, a note).
 */
import Clipboard from "@react-native-clipboard/clipboard";
import { useState } from "react";
import { Alert, Linking, Share, StyleSheet, View } from "react-native";
import { isApiError } from "../../api/vendor/client/errors";
import { useMeta } from "../../app/meta";
import { useSession } from "../../app/session";
import { Button, type ButtonProps } from "../../ui/components/Button";
import { ChoiceList, Field } from "../../ui/components/Inputs";
import { Divider } from "../../ui/components/Layout";
import { Text } from "../../ui/components/Text";
import { fonts, space } from "../../ui/theme/tokens";
import { Notice, Page, SignInPrompt, errorMessage } from "./components";
import { digits6, groupSecret, recoveryCodesText } from "./lib/format";
import { signOutDevice } from "./lib/signout";
import { u } from "./styles";

/** Client checks for the password form; the server's field errors win when they come back. */
export function validatePasswordChange(v: { current: string; next: string; confirm: string }): Partial<Record<"current" | "next" | "confirm", string>> {
  const e: Partial<Record<"current" | "next" | "confirm", string>> = {};
  if (!v.current) e.current = "Enter your current password";
  if (v.next.length < 10) e.next = "Use at least 10 characters";
  else if (v.next.length > 128) e.next = "Use at most 128 characters";
  else if (v.next === v.current) e.next = "Choose a different password from your current one";
  if (!e.next && v.confirm !== v.next) e.confirm = "The passwords do not match";
  return e;
}

const codeError = (e: unknown) =>
  isApiError(e) && e.code === "INVALID_CREDENTIALS" ? "That password is not right." : isApiError(e) && e.code === "INVALID_TOTP" ? "That code did not match. Codes change every 30 seconds." : errorMessage(e);

export function SecurityScreen() {
  const { status, me } = useSession();
  if (status !== "signedIn" || !me) {
    return (
      <Page title="Security">
        <SignInPrompt title="Sign in to manage security" body="Change your password and turn on two-factor sign-in." />
      </Page>
    );
  }
  return (
    <Page title="Security" testID="account-security-screen">
      <PasswordBlock />
      <View style={{ marginTop: space[8] }}>
        <Divider />
      </View>
      <TwoFactorBlock />
    </Page>
  );
}

function PasswordBlock() {
  const session = useSession();
  const [v, setV] = useState({ current: "", next: "", confirm: "" });
  const [errors, setErrors] = useState<Partial<Record<"current" | "next" | "confirm", string>>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (t: string) => {
    setV((x) => ({ ...x, [k]: t }));
    setErrors((x) => ({ ...x, [k]: undefined }));
    setFailure(null);
  };
  const submit = async () => {
    const found = validatePasswordChange(v);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await session.api.auth.changePassword(v.current, v.next);
      Alert.alert("Password changed", "Every device was signed out. Sign in again with your new password.");
      await signOutDevice(session, { everywhere: true });
    } catch (e) {
      if (isApiError(e) && e.code === "INVALID_CREDENTIALS") setErrors({ current: "That is not your current password." });
      else if (isApiError(e) && e.code === "WEAK_PASSWORD") setErrors({ next: e.message });
      else if (isApiError(e) && e.code === "VALIDATION_FAILED") {
        const f = e.fieldErrors;
        setErrors({ current: f.currentPassword, next: f.newPassword ?? f.password });
      } else setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ marginTop: space[6] }}>
      <Text variant="heading">Password</Text>
      <Text tone="muted" variant="small" style={[u.mt4, { marginBottom: space[4] }]}>After a change you are signed out everywhere and sign in again.</Text>
      {failure ? <Notice tone="danger" body={failure} /> : null}
      <Field label="Current password" secureTextEntry autoComplete="current-password" textContentType="password" value={v.current} onChangeText={set("current")} error={errors.current} testID="account-password-current" />
      <Field label="New password" secureTextEntry autoComplete="new-password" textContentType="newPassword" value={v.next} onChangeText={set("next")} error={errors.next} hint="10 to 128 characters" maxLength={128} testID="account-password-new" />
      <Field label="Confirm new password" secureTextEntry autoComplete="new-password" value={v.confirm} onChangeText={set("confirm")} error={errors.confirm} maxLength={128} testID="account-password-confirm" />
      <Button label="Change password" variant="outline" loading={busy} onPress={() => { submit(); }} testID="account-password-save" />
    </View>
  );
}

function TwoFactorBlock() {
  const { me, api, setMe } = useSession();
  const academy = useMeta().data?.academyName ?? "Academy";
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<null | "start" | "enable" | "disable" | "regenerate">(null);
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  if (!me) return null;

  const reloadMe = () => api.users.me().then(setMe).catch(() => undefined);
  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(codeError(e));
    } finally {
      setBusy(null);
    }
  };

  if (codes) return <RecoveryCodes codes={codes} academy={academy} onDone={() => setCodes(null)} />;

  if (me.totpEnabled) {
    const ready = !!password && code.length === 6;
    return (
      <View style={{ marginTop: space[8] }} testID="account-totp-on">
        <Text variant="heading">Two-factor sign-in</Text>
        <Text tone="success" variant="smallStrong" style={u.mt4}>On</Text>
        <Text tone="muted" variant="small" style={[u.mt4, { marginBottom: space[4] }]}>Signing in asks for a code from your authenticator app. To turn it off or replace your recovery codes, confirm your password and a current code.</Text>
        <Field label="Password" secureTextEntry autoComplete="current-password" value={password} onChangeText={(t) => { setPassword(t); setError(null); }} />
        <Field label="6 digit code from your app" keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" value={code} onChangeText={(t) => { setCode(digits6(t)); setError(null); }} error={error} maxLength={6} testID="account-totp-confirm-code" />
        <View style={{ gap: space[3] }}>
          <Button
            label="New recovery codes"
            variant="outline"
            disabled={!ready || !!busy}
            loading={busy === "regenerate"}
            testID="account-totp-regenerate"
            onPress={() => { run("regenerate", async () => {
              const r = await api.auth.totpRecoveryCodes(password, code);
              setPassword("");
              setCode("");
              setCodes(r.recoveryCodes);
            }); }}
          />
          <Button
            label="Turn off two-factor"
            variant="ghost"
            disabled={!ready || !!busy}
            loading={busy === "disable"}
            testID="account-totp-disable"
            onPress={() => { run("disable", async () => {
              await api.auth.totpDisable(password, code);
              setPassword("");
              setCode("");
              await reloadMe();
            }); }}
          />
        </View>
      </View>
    );
  }

  if (!setup) {
    return (
      <View style={{ marginTop: space[8] }} testID="account-totp-off">
        <Text variant="heading">Two-factor sign-in</Text>
        <Text tone="muted" variant="smallStrong" style={u.mt4}>Off</Text>
        <Text tone="muted" variant="small" style={[u.mt4, { marginBottom: space[4] }]}>Add a code from an authenticator app to every sign-in, so a stolen password is not enough.</Text>
        {error ? <Notice tone="danger" body={error} /> : null}
        <Button label="Set up two-factor" variant="outline" loading={busy === "start"} testID="account-totp-start" onPress={() => { run("start", async () => setSetup(await api.auth.totpSetup())); }} />
      </View>
    );
  }

  const grouped = groupSecret(setup.secret);
  const otpauth = /^otpauth:\/\//.test(setup.otpauthUrl) ? setup.otpauthUrl : null;
  return (
    <View style={{ marginTop: space[8] }} testID="account-totp-setup">
      <Text variant="heading">Set up two-factor sign-in</Text>
      <Text tone="muted" variant="small" style={u.mt4}>Add this account to an authenticator app, then enter the 6 digit code it shows.</Text>
      {otpauth ? (
        <Button
          label="Open in authenticator"
          variant="outline"
          style={{ marginTop: space[4] }}
          testID="account-totp-open"
          onPress={() => { Linking.openURL(otpauth).catch(() => setError("No authenticator app opened. Enter the key by hand instead.")); }}
        />
      ) : null}
      <Text variant="smallStrong" style={{ marginTop: space[5] }}>Or enter this key</Text>
      <Text selectable style={styles.secret} testID="account-totp-secret">{grouped}</Text>
      <CopyButton label="Copy key" value={setup.secret} variant="ghost" size="sm" style={[u.start, { marginTop: space[1] }]} testID="account-totp-copy" />
      <View style={{ marginTop: space[4] }}>
        <Field label="6 digit code" keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" value={code} onChangeText={(t) => { setCode(digits6(t)); setError(null); }} error={error} maxLength={6} testID="account-totp-code" />
      </View>
      <View style={{ gap: space[3] }}>
        <Button
          label="Turn on"
          disabled={code.length !== 6}
          loading={busy === "enable"}
          testID="account-totp-enable"
          onPress={() => { run("enable", async () => {
            const r = await api.auth.totpEnable(code);
            setSetup(null);
            setCode("");
            if (r?.recoveryCodes?.length) setCodes(r.recoveryCodes);
            await reloadMe();
          }); }}
        />
        <Button label="Cancel" variant="ghost" onPress={() => { setSetup(null); setCode(""); setError(null); }} />
      </View>
    </View>
  );
}

function RecoveryCodes({ codes, academy, onDone }: { codes: string[]; academy: string; onDone: () => void}) {
  const [saved, setSaved] = useState(false);
  return (
    <View style={{ marginTop: space[8] }} testID="account-recovery-codes">
      <Text variant="heading">Save your recovery codes</Text>
      <Text tone="muted" variant="small" style={u.mt4}>If you lose your authenticator app, each code signs you in once. They are not shown again.</Text>
      <View style={styles.codes}>
        {codes.map((c) => (
          <Text key={c} selectable style={styles.code}>{c}</Text>
        ))}
      </View>
      <View style={styles.codeActions}>
        <CopyButton label="Copy" value={recoveryCodesText(codes, academy)} variant="outline" testID="account-recovery-copy" />
        <Button
          label="Share"
          variant="ghost"
          testID="account-recovery-share"
          onPress={() => { Share.share({ message: recoveryCodesText(codes, academy), title: `${academy} recovery codes` }).catch(() => undefined); }}
        />
      </View>
      <View style={{ marginTop: space[3] }}>
        <ChoiceList multiple options={[{ value: "saved", label: "I saved them somewhere safe" }]} selected={saved ? ["saved"] : []} onToggle={() => setSaved((s) => !s)} />
      </View>
      <Button label="Done" disabled={!saved} onPress={onDone} testID="account-recovery-done" />
    </View>
  );
}

/** Copies a value and says so for two seconds. */
function CopyButton({ label, value, ...rest }: { label: string; value: string } & Omit<ButtonProps, "label" | "onPress">) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      {...rest}
      label={copied ? "Copied" : label}
      onPress={() => {
        Clipboard.setString(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    />
  );
}

const styles = StyleSheet.create({
  codeActions: { flexDirection: "row", gap: space[2] },
  secret: { fontFamily: fonts.body.semibold, fontSize: 18, lineHeight: 26, letterSpacing: 1, marginTop: 4 },
  codes: { flexDirection: "row", flexWrap: "wrap", marginTop: space[4], paddingVertical: space[3] },
  code: { width: "50%", fontFamily: fonts.body.semibold, fontSize: 15, lineHeight: 28 },
});
