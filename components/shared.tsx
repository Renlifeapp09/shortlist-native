import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  TextInputProps,
} from "react-native";

// ── Colors ──
const colors = {
  black: "#1a1a1a",
  white: "#ffffff",
  warmWhite: "#faf9f7",
  brown: "#8b7d6b",
  light: "#e8e4df",
  mint: "#d6ede6",
  mintDeep: "#a8d5c5",
  mintText: "#2a6b55",
  error: "#c0392b",
};

// ── PrimaryButton ──
interface PrimaryButtonProps {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  variant = "primary",
}: PrimaryButtonProps) {
  const isPrimary = variant === "primary";
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={[
        styles.primaryButton,
        {
          backgroundColor: isPrimary ? colors.black : "transparent",
          borderWidth: isPrimary ? 0 : 1,
          borderColor: isPrimary ? undefined : colors.light,
          opacity: disabled ? 0.35 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.primaryButtonText,
          { color: isPrimary ? colors.white : colors.black },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ── FieldInput ──
interface FieldInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: TextInputProps["keyboardType"];
  autoCapitalize?: TextInputProps["autoCapitalize"];
}

export function FieldInput({
  label,
  value,
  onChange,
  placeholder = "",
  secureTextEntry = false,
  keyboardType = "default",
  autoCapitalize = "none",
}: FieldInputProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#bbb"
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        style={[
          styles.fieldInput,
          {
            borderColor: isFocused ? colors.mintDeep : colors.light,
            backgroundColor: isFocused ? colors.white : colors.warmWhite,
          },
        ]}
      />
    </View>
  );
}

// ── Styles ──
const styles = StyleSheet.create({
  primaryButton: {
    width: "100%",
    borderRadius: 100,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    fontWeight: "400",
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  fieldLabel: {
    fontWeight: "400",
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.brown,
  },
  fieldInput: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: "300",
    color: colors.black,
  },
});
