/**
 * Sign in, sign up, two-factor, forgot password and email verification. Presented as a
 * modal stack over the app, so a guest who taps "Enroll" comes back to where they were.
 */
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import { X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isApiError } from "../../api/vendor/client/errors";
import type { NativeAuthResult } from "../../api/client";
import { useMeta } from "../../app/meta";
import type { RootScreen } from "../../app/routes";
import { useSession } from "../../app/session";
import { config } from "../../config";
import { Button, IconButton } from "../../ui/components/Button";
import { Field, type FieldRef } from "../../ui/components/Inputs";
import { Text } from "../../ui/components/Text";
import { useTheme } from "../../ui/theme/ThemeProvider";
import { space } from "../../ui/theme/tokens";

/** Matches the server's username rule (apps/api/src/domain/username.ts). */
const USERNAME = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/i;

function message(e: unknown): string {
  if (isApiError(e)) {
    if (e.code === "NETWORK_ERROR") return "Cannot reach the academy. Check your connection.";
    if (e.code === "RATE_LIMITED") return "Too many attempts. Wait a minute and try again.";
    return e.message;
  }
  return e instanceof Error ? e.message : "Something went wrong.";
}

function AuthFrame({ title, lead, children, onClose }: { title: string; lead?: string; children: React.ReactNode; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const meta = useMeta().data;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.fill, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.top}>
        <Text variant="smallStrong" tone="muted">{meta?.academyName ?? ""}</Text>
        <IconButton label="Close" onPress={onClose} icon={<X size={24} color={colors.foreground} />} />
      </View>
      <View style={[styles.body, { paddingBottom: insets.bottom + space[6] }]}>
        <Text variant="title">{title}</Text>
        {lead ? <Text tone="muted" style={{ marginTop: space[2], marginBottom: space[6] }}>{lead}</Text> : <View style={{ height: space[6] }} />}
        {children}
      </View>
    </KeyboardAvoidingView>
  );
}

function TextLink({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={8} testID={testID}>
      <Text variant="smallStrong" tone="link">{label}</Text>
    </Pressable>
  );
}

export function SignInScreen({ navigation }: RootScreen<"SignIn">) {
  const { signIn } = useSession();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<FieldRef>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await signIn({ login: login.trim(), password, ...(needsCode ? (useRecovery ? { recoveryCode: code.trim() } : { totp: code.trim() }) : {}) });
      if (r.ok) navigation.goBack();
      else if ("totpRequired" in r) setNeedsCode(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title={needsCode ? "Two-step verification" : "Sign in"} lead={needsCode ? (useRecovery ? "Enter one of your recovery codes." : "Enter the six-digit code from your authenticator app.") : "Pick up where you left off."} onClose={() => navigation.goBack()}>
      {needsCode ? (
        <>
          <Field label={useRecovery ? "Recovery code" : "Code"} value={code} onChangeText={setCode} autoFocus keyboardType={useRecovery ? "default" : "number-pad"} autoCapitalize="none" autoComplete="one-time-code" textContentType="oneTimeCode" testID="signin-code" onSubmitEditing={submit} />
          <TextLink label={useRecovery ? "Use your authenticator app" : "Use a recovery code"} onPress={() => { setUseRecovery((v) => !v); setCode(""); }} />
        </>
      ) : (
        <>
          <Field label="Email or username" value={login} onChangeText={setLogin} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="username" textContentType="username" returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} testID="signin-login" />
          <Field ref={passwordRef} label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" returnKeyType="go" onSubmitEditing={submit} testID="signin-password" />
          <TextLink label="Forgot your password?" onPress={() => navigation.navigate("ForgotPassword")} testID="signin-forgot" />
        </>
      )}
      {error ? <Text tone="danger" variant="small" style={{ marginTop: space[4] }} testID="signin-error">{error}</Text> : null}
      <Button label={needsCode ? "Verify" : "Sign in"} size="lg" block loading={busy} disabled={!login || !password || (needsCode && !code)} onPress={submit} style={{ marginTop: space[6] }} testID="signin-submit" />
      {!needsCode ? (
        <View style={styles.switchRow}>
          <Text variant="small" tone="muted">New here?</Text>
          <TextLink label="Create an account" onPress={() => navigation.replace("SignUp")} testID="signin-to-signup" />
        </View>
      ) : null}
    </AuthFrame>
  );
}

export function SignUpScreen({ navigation }: RootScreen<"SignUp">) {
  const { signUp } = useSession();
  const meta = useMeta().data;
  const [form, setForm] = useState({ displayName: "", email: "", username: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const closed = meta?.registration === "CLOSED";

  async function submit() {
    const local: Record<string, string> = {};
    if (!form.displayName.trim()) local.displayName = "Enter your name.";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) local.email = "Enter a valid email address.";
    if (!USERNAME.test(form.username.trim())) local.username = "3 to 40 letters, digits or hyphens, starting and ending with a letter or digit.";
    if (form.password.length < 10) local.password = "Use at least 10 characters.";
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    setError(null);
    try {
      const r = await signUp({ displayName: form.displayName.trim(), email: form.email.trim().toLowerCase(), username: form.username.trim().toLowerCase(), password: form.password });
      if (r.ok) navigation.goBack();
      else if ("verificationRequired" in r) navigation.replace("CheckEmail", { email: r.email });
    } catch (e) {
      if (isApiError(e) && Object.keys(e.fieldErrors).length) setErrors(e.fieldErrors);
      else setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  if (closed) {
    return (
      <AuthFrame title="Registration is closed" lead="This academy is not taking new sign-ups in the app right now." onClose={() => navigation.goBack()}>
        <Button label="Sign in instead" variant="outline" block onPress={() => navigation.replace("SignIn")} />
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title="Create your account" lead="Learn at your pace, on any device." onClose={() => navigation.goBack()}>
      <Field label="Name" value={form.displayName} onChangeText={set("displayName")} autoComplete="name" textContentType="name" error={errors.displayName} testID="signup-name" />
      <Field label="Email" value={form.email} onChangeText={set("email")} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" error={errors.email} testID="signup-email" />
      <Field label="Username" value={form.username} onChangeText={set("username")} autoCapitalize="none" autoCorrect={false} error={errors.username} testID="signup-username" />
      <Field label="Password" value={form.password} onChangeText={set("password")} secureTextEntry autoComplete="new-password" textContentType="newPassword" hint="At least 10 characters." error={errors.password} testID="signup-password" />
      {error ? <Text tone="danger" variant="small" testID="signup-error">{error}</Text> : null}
      <Button label="Create account" size="lg" block loading={busy} onPress={submit} style={{ marginTop: space[4] }} testID="signup-submit" />
      <View style={styles.switchRow}>
        <Text variant="small" tone="muted">Already have an account?</Text>
        <TextLink label="Sign in" onPress={() => navigation.replace("SignIn")} />
      </View>
    </AuthFrame>
  );
}

export function CheckEmailScreen({ navigation, route }: RootScreen<"CheckEmail">) {
  const { api } = useSession();
  const [sent, setSent] = useState(false);
  return (
    <AuthFrame title="Check your email" lead={`We sent a link to ${route.params.email}. Open it to verify your address, then sign in here.`} onClose={() => navigation.goBack()}>
      <Button label="I've verified, sign in" size="lg" block onPress={() => navigation.replace("SignIn")} testID="check-email-signin" />
      <Button label={sent ? "Sent again" : "Send the link again"} variant="ghost" block disabled={sent} onPress={() => api.auth.resendVerification(route.params.email).then(() => setSent(true)).catch(() => setSent(true))} style={{ marginTop: space[2] }} />
    </AuthFrame>
  );
}

export function ForgotPasswordScreen({ navigation }: RootScreen<"ForgotPassword">) {
  const { api } = useSession();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <AuthFrame title="Reset your password" lead={done ? "If an account uses that address, a reset link is on its way. Open it on this phone or a computer." : "We will email you a link to choose a new password."} onClose={() => navigation.goBack()}>
      {done ? (
        <Button label="Back to sign in" size="lg" block onPress={() => navigation.replace("SignIn")} />
      ) : (
        <>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
          <Button
            label="Send link"
            size="lg"
            block
            loading={busy}
            disabled={!email}
            onPress={async () => {
              setBusy(true);
              // The API answers the same either way, so this never reveals whether an account exists.
              await api.auth.forgotPassword(email.trim().toLowerCase()).catch(() => undefined);
              setBusy(false);
              setDone(true);
            }}
          />
        </>
      )}
    </AuthFrame>
  );
}

/** Opened by the verification link when app links point at the app. */
export function VerifyEmailScreen({ navigation, route }: RootScreen<"VerifyEmail">) {
  const { api, adopt } = useSession();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api.auth
      .verifyEmail(route.params.token)
      .then(async (r) => {
        if (!alive) return;
        if ("refreshToken" in r) await adopt(r as NativeAuthResult);
        navigation.replace("Tabs");
      })
      .catch((e) => alive && setError(message(e)));
    return () => {
      alive = false;
    };
  }, [api, adopt, navigation, route.params.token]);
  return (
    <AuthFrame title={error ? "This link did not work" : "Verifying your email"} lead={error ?? "One moment."} onClose={() => navigation.replace("Tabs")}>
      {error ? <Button label="Open the website" variant="outline" block onPress={() => Linking.openURL(config.webBaseUrl)} /> : null}
    </AuthFrame>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: space[4], paddingRight: space[1], height: 52 },
  body: { flex: 1, paddingHorizontal: space[5], paddingTop: space[6] },
  switchRow: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", marginTop: space[6] },
});
