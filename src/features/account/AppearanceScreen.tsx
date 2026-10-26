/** Appearance: follow the system, or keep the app light or dark. Remembered across launches. */
import { ChoiceList } from "../../ui/components/Inputs";
import { Text } from "../../ui/components/Text";
import { useTheme, type ThemeMode } from "../../ui/theme/ThemeProvider";
import { space } from "../../ui/theme/tokens";
import { Page } from "./components";

const OPTIONS: Array<{ value: ThemeMode; label: string; detail?: string }> = [
  { value: "system", label: "System", detail: "Match your phone's setting" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function AppearanceScreen() {
  const { mode, setMode } = useTheme();
  return (
    <Page title="Appearance" testID="account-appearance-screen">
      <Text tone="muted" style={{ marginTop: space[5], marginBottom: space[2] }}>Choose how the app looks.</Text>
      <ChoiceList options={OPTIONS} selected={[mode]} onToggle={setMode} />
    </Page>
  );
}
