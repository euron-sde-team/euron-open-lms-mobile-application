/**
 * Renders the sanitized HTML the API sends (articles, descriptions, quiz prompts,
 * feedback). The server already sanitized it; this only maps tags to native text with the
 * app's type scale. Links open in the system browser, never inside the app with a session.
 */
import { memo, useMemo } from "react";
import { Linking, useWindowDimensions } from "react-native";
import RenderHtml, { type MixedStyleDeclaration } from "react-native-render-html";
import { useTheme } from "../theme/ThemeProvider";
import { fonts } from "../theme/tokens";
import { safeExternalUrl } from "../../lib/urls";

export const Html = memo(function HtmlView({ html, compact }: { html: string; compact?: boolean }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const base: MixedStyleDeclaration = useMemo(() => ({ color: colors.foreground, fontFamily: fonts.body.regular, fontSize: compact ? 14 : 16, lineHeight: compact ? 20 : 25 }), [colors, compact]);
  const tags = useMemo<Record<string, MixedStyleDeclaration>>(
    () => ({
      h1: { fontFamily: fonts.display.bold, fontSize: 24, lineHeight: 30, marginTop: 20, marginBottom: 8 },
      h2: { fontFamily: fonts.display.bold, fontSize: 20, lineHeight: 26, marginTop: 18, marginBottom: 6 },
      h3: { fontFamily: fonts.body.bold, fontSize: 17, lineHeight: 23, marginTop: 16, marginBottom: 4 },
      p: { marginTop: 0, marginBottom: compact ? 8 : 12 },
      a: { color: colors.link, textDecorationLine: "underline" },
      strong: { fontFamily: fonts.body.bold },
      b: { fontFamily: fonts.body.bold },
      code: { fontFamily: "Menlo", fontSize: 13, backgroundColor: colors.muted },
      pre: { backgroundColor: colors.muted, padding: 12, borderRadius: 10, fontFamily: "Menlo", fontSize: 13 },
      blockquote: { borderLeftWidth: 3, borderLeftColor: colors.brand, paddingLeft: 12, marginLeft: 0, color: colors.mutedForeground },
      li: { marginBottom: 4 },
      hr: { backgroundColor: colors.border, height: 1, marginVertical: 16 },
      img: { borderRadius: 10 },
    }),
    [colors, compact]
  );
  return (
    <RenderHtml
      contentWidth={width - 32}
      source={{ html }}
      baseStyle={base}
      tagsStyles={tags}
      systemFonts={[...Object.values(fonts.body), ...Object.values(fonts.display), "Menlo"]}
      enableExperimentalMarginCollapsing
      renderersProps={{
        a: {
          onPress: (_e: unknown, href: string) => {
            const safe = safeExternalUrl(href);
            if (safe) Linking.openURL(safe).catch(() => undefined);
          },
        },
      }}
    />
  );
});
