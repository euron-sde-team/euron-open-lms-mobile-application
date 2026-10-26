/**
 * Profile: photo, display name, headline, bio, website and the name printed on
 * certificates. Saving updates the session's `me` at once and rolls back if the server
 * refuses. A new photo is uploaded natively from its file path, then attached on save.
 */
import { keepLocalCopy, pick, types, isErrorWithCode, errorCodes } from "@react-native-documents/picker";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Camera } from "lucide-react-native";
import { isApiError } from "../../api/vendor/client/errors";
import type { Me } from "../../api/vendor/types";
import { useSession } from "../../app/session";
import { Button } from "../../ui/components/Button";
import { Field } from "../../ui/components/Inputs";
import { Avatar } from "../../ui/components/Media";
import { Text } from "../../ui/components/Text";
import { useTheme } from "../../ui/theme/ThemeProvider";
import { space } from "../../ui/theme/tokens";
import { Notice, Page, SignInPrompt, errorMessage } from "./components";
import { uploadFromUri } from "./lib/files";
import { u } from "./styles";

export interface ProfileValues {
  displayName: string;
  certificateName: string;
  headline: string;
  bio: string;
  website: string;
}

const nullable = (v: string) => (v.trim() ? v.trim() : null);

/** Client checks matching the web form; the server enforces the same and answers with field errors. */
export function validateProfile(v: ProfileValues): Partial<Record<keyof ProfileValues, string>> {
  const e: Partial<Record<keyof ProfileValues, string>> = {};
  if (!v.displayName.trim()) e.displayName = "Enter your name";
  else if (v.displayName.trim().length > 80) e.displayName = "Use at most 80 characters";
  if (v.certificateName.trim().length > 120) e.certificateName = "Use at most 120 characters";
  if (v.headline.trim().length > 120) e.headline = "Use at most 120 characters";
  if (v.bio.trim().length > 2000) e.bio = "Use at most 2000 characters";
  if (v.website.trim() && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(v.website.trim())) e.website = "Enter a full link starting with https://";
  return e;
}

export function ProfileScreen() {
  const { me, status } = useSession();
  if (status !== "signedIn" || !me) {
    return (
      <Page title="Profile">
        <SignInPrompt title="Sign in to edit your profile" body="Your name and photo show next to your reviews and questions." />
      </Page>
    );
  }
  return <ProfileForm me={me} />;
}

function ProfileForm({ me }: { me: Me }) {
  const { api, setMe } = useSession();
  const { colors } = useTheme();
  const initial: ProfileValues = { displayName: me.displayName, certificateName: me.certificateName ?? "", headline: me.headline ?? "", bio: me.bio ?? "", website: me.website ?? "" };
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileValues, string>>>({});
  const [photo, setPhoto] = useState<{ uri: string; uploadId: string | null; progress: number; failed: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const set = (k: keyof ProfileValues) => (text: string) => {
    setV((x) => ({ ...x, [k]: text }));
    setErrors((x) => ({ ...x, [k]: undefined }));
    setMessage(null);
  };

  const pickPhoto = async () => {
    try {
      const [file] = await pick({ type: [types.images] });
      const [copy] = await keepLocalCopy({ files: [{ uri: file.uri, fileName: file.name ?? "photo.jpg" }], destination: "cachesDirectory" });
      if (copy.status !== "success") throw new Error("Could not read that image.");
      setPhoto({ uri: copy.localUri, uploadId: null, progress: 0, failed: false });
      const media = await uploadFromUri(api, "AVATAR", { uri: copy.localUri, name: file.name ?? "photo.jpg", type: file.type, size: file.size ?? 0 }, (p) => setPhoto((x) => (x ? { ...x, progress: p } : x)));
      setPhoto({ uri: copy.localUri, uploadId: media.id, progress: 1, failed: false });
    } catch (e) {
      if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) return;
      setPhoto((x) => (x ? { ...x, failed: true } : null));
      setMessage({ tone: "danger", text: errorMessage(e) });
    }
  };

  const uploading = !!photo && !photo.uploadId && !photo.failed;
  const dirty = JSON.stringify(v) !== JSON.stringify(initial) || !!photo?.uploadId;

  const save = async () => {
    const found = validateProfile(v);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    const prev = me;
    // Optimistic: the account tab and header show the new name at once.
    setMe({ ...me, displayName: v.displayName.trim(), certificateName: nullable(v.certificateName), headline: nullable(v.headline), bio: nullable(v.bio), website: nullable(v.website) });
    try {
      const updated = await api.users.updateMe({
        displayName: v.displayName.trim(),
        certificateName: nullable(v.certificateName),
        headline: nullable(v.headline),
        bio: nullable(v.bio),
        website: nullable(v.website),
        ...(photo?.uploadId ? { avatarUploadId: photo.uploadId } : {}),
      });
      setMe(updated);
      setPhoto(null);
      setMessage({ tone: "success", text: "Profile saved." });
    } catch (e) {
      setMe(prev);
      if (isApiError(e) && e.code === "VALIDATION_FAILED") setErrors(e.fieldErrors as Partial<Record<keyof ProfileValues, string>>);
      else if (isApiError(e) && e.code === "CERTIFICATE_NAME_INVALID") setErrors({ certificateName: e.message });
      else if (isApiError(e) && e.code === "URL_INVALID") setErrors({ website: e.message });
      else setMessage({ tone: "danger", text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page
      title="Profile"
      testID="account-profile-screen"
      footer={<Button label={uploading ? "Uploading photo" : "Save changes"} block loading={saving} disabled={!dirty || uploading} onPress={() => { save(); }} testID="account-profile-save" />}
    >
        <View style={[u.center, { marginTop: space[6] }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Change profile photo" onPress={() => { pickPhoto(); }} testID="account-profile-photo" style={u.center}>
            <View style={uploading ? u.dim : u.opaque}>
              <Avatar uri={photo?.uri ?? me.avatarUrl} name={v.displayName} size={88} />
            </View>
            <View style={[u.rowCenter, u.target, { gap: space[2], marginTop: space[3] }]}>
              <Camera size={16} color={colors.link} />
              <Text variant="smallStrong" tone="link">{uploading ? `Uploading ${Math.round((photo?.progress ?? 0) * 100)}%` : "Change photo"}</Text>
            </View>
          </Pressable>
        </View>
        {message ? <Notice tone={message.tone} body={message.text} testID="account-profile-message" /> : null}
        <View style={{ marginTop: space[6] }}>
          <Field label="Display name" value={v.displayName} onChangeText={set("displayName")} error={errors.displayName} autoComplete="name" maxLength={80} testID="account-profile-name" />
          <Field label="Name on certificates" value={v.certificateName} onChangeText={set("certificateName")} error={errors.certificateName} hint={`Printed as: ${v.certificateName.trim() || v.displayName.trim() || "Your name"}`} maxLength={120} testID="account-profile-certificate-name" />
          <Field label="Headline" value={v.headline} onChangeText={set("headline")} error={errors.headline} hint="One line, for example: Data analyst learning machine learning" maxLength={120} />
          <Field label="Bio" value={v.bio} onChangeText={set("bio")} error={errors.bio} multiline maxLength={2000} testID="account-profile-bio" />
          <Field label="Website" value={v.website} onChangeText={set("website")} error={errors.website} placeholder="https://" keyboardType="url" autoCapitalize="none" autoCorrect={false} maxLength={300} testID="account-profile-website" />
        </View>
    </Page>
  );
}
