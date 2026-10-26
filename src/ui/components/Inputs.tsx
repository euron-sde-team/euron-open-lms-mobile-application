/**
 * Form controls and choice controls. Choices are an underlined tab strip or a list of
 * rows with a check, never a row of capsules.
 */
import { forwardRef, useState, type ComponentRef } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { Check } from "lucide-react-native";
import { useTheme } from "../theme/ThemeProvider";
import { fonts, radius, space } from "../theme/tokens";
import { Text } from "./Text";

const CLEAR = "transparent";

export interface FieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  hint?: string;
}

export type FieldRef = ComponentRef<typeof TextInput>;

export const Field = forwardRef<FieldRef, FieldProps>(function FieldInput({ label, error, hint, style, onFocus, onBlur, ...rest }, ref) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text variant="smallStrong" style={styles.label}>{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.subtleForeground}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        style={[
          styles.input,
          { color: colors.foreground, backgroundColor: colors.card, borderColor: error ? colors.danger : focused ? colors.ring : colors.input },
          rest.multiline && styles.multiline,
          style,
        ]}
        {...rest}
      />
      {error ? <Text variant="small" tone="danger" style={styles.help}>{error}</Text> : hint ? <Text variant="small" tone="subtle" style={styles.help}>{hint}</Text> : null}
    </View>
  );
});

/** An underlined tab strip that scrolls when the labels do not fit. */
export function Tabs<T extends string>({ value, onChange, items, testID }: { value: T; onChange: (v: T) => void; items: Array<{ value: T; label: string; count?: number }>; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }} testID={testID}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[5] }}>
        {items.map((it) => {
          const on = it.value === value;
          return (
            <Pressable key={it.value} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(it.value)} testID={testID ? `${testID}-${it.value}` : undefined} style={styles.tab}>
              <Text variant="smallStrong" tone={on ? "default" : "muted"}>
                {it.label}
                {it.count !== undefined ? <Text variant="small" tone="subtle">{`  ${it.count}`}</Text> : null}
              </Text>
              <View style={[styles.tabLine, { backgroundColor: on ? colors.foreground : CLEAR }]} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** A single or multiple choice list: one row per option, a check for the chosen ones. */
export function ChoiceList<T extends string>({ options, selected, onToggle, multiple }: { options: Array<{ value: T; label: string; detail?: string; count?: number }>; selected: T[]; onToggle: (v: T) => void; multiple?: boolean }) {
  const { colors } = useTheme();
  return (
    <View>
      {options.map((o, i) => {
        const on = selected.includes(o.value);
        return (
          <Pressable
            key={o.value}
            accessibilityRole={multiple ? "checkbox" : "radio"}
            accessibilityState={{ checked: on }}
            onPress={() => onToggle(o.value)}
            style={[styles.choice, i < options.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
          >
            <View style={[multiple ? styles.box : styles.dot, { borderColor: on ? colors.foreground : colors.input, backgroundColor: on ? colors.foreground : CLEAR }]}>
              {on ? <Check size={13} color={colors.background} strokeWidth={3} /> : null}
            </View>
            <View style={styles.grow}>
              <Text variant="body">{o.label}</Text>
              {o.detail ? <Text variant="small" tone="muted">{o.detail}</Text> : null}
            </View>
            {o.count !== undefined ? <Text variant="small" tone="subtle">{o.count.toLocaleString()}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: space[4] },
  grow: { flex: 1 },
  label: { marginBottom: 6 },
  help: { marginTop: 6 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 15, fontFamily: fonts.body.regular },
  multiline: { minHeight: 120, paddingTop: 12, textAlignVertical: "top" },
  tab: { paddingTop: space[3] },
  tabLine: { height: 2, marginTop: space[3], borderRadius: 1 },
  choice: { flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[4] },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
});
