/**
 * About: the app's version and build, the server it talks to, the academy and its
 * website, and the open-source notices (the app is MIT licensed; the fonts are under the
 * SIL Open Font License).
 */
import { Linking } from "react-native";
import DeviceInfo from "react-native-device-info";
import { useMeta } from "../../app/meta";
import { config } from "../../config";
import { safeExternalUrl } from "../../lib/urls";
import { Row } from "../../ui/components/Layout";
import { Text } from "../../ui/components/Text";
import { space } from "../../ui/theme/tokens";
import { GroupLabel, Page } from "./components";

export const REPO_URL = "https://github.com/euron-sde-team/euron-open-lms-mobile-application";

export function hostOf(url: string): string {
  const m = url.match(/^[a-z]+:\/\/([^/?#]+)/i);
  return m ? m[1] : url;
}

const open = (url: string) => {
  const safe = safeExternalUrl(url);
  if (safe) Linking.openURL(safe).catch(() => undefined);
};

export function AboutScreen() {
  const meta = useMeta();
  const academy = meta.data?.academyName ?? "This academy";
  return (
    <Page title="About" testID="account-about-screen">
      <GroupLabel first>This app</GroupLabel>
      <Row label="Version" value={`${DeviceInfo.getVersion()} (${DeviceInfo.getBuildNumber()})`} testID="account-about-version" />
      <Row label="Server" value={hostOf(config.apiBaseUrl)} testID="account-about-server" last />

      <GroupLabel>{academy}</GroupLabel>
      {meta.data?.tagline ? <Text tone="muted" style={{ paddingVertical: space[2] }}>{meta.data.tagline}</Text> : null}
      <Row label="Website" detail={hostOf(config.webBaseUrl)} onPress={() => open(config.webBaseUrl)} testID="account-about-website" />
      {meta.data?.support.email ? <Row label="Support" detail={meta.data.support.email} onPress={() => { Linking.openURL(`mailto:${meta.data!.support.email}`).catch(() => undefined); }} last /> : null}

      <GroupLabel>Open source</GroupLabel>
      <Row label="Source code" detail="Euron Open LMS Mobile is free software under the MIT License." onPress={() => open(REPO_URL)} testID="account-about-source" />
      <Row label="Fonts" detail="Bricolage Grotesque and Hanken Grotesk, under the SIL Open Font License 1.1." last />
    </Page>
  );
}
