import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

const colors = {
  black: "#1a1a1a",
  white: "#ffffff",
  warmWhite: "#faf9f7",
  brown: "#8b7d6b",
  light: "#e8e4df",
  mint: "#d6ede6",
  mintDeep: "#a8d5c5",
  mintText: "#2a6b55",
};

export function MintCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.mintCard}>{children}</View>;
}

export function DecorativeRule() {
  return (
    <View style={styles.ruleContainer}>
      <View style={styles.ruleLine} />
      <Text style={{ color: colors.black, fontSize: 12 }}>✦</Text>
    </View>
  );
}

export function DashboardButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={[styles.primaryButton, { opacity: disabled ? 0.35 : 1 }]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function StatBadge({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.statBadge}>
      <Text style={styles.statBadgeText}>{children}</Text>
    </View>
  );
}

export function StatCard({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statCardValue}>{value}</Text>
      <Text style={styles.statCardLabel}>{label}</Text>
    </View>
  );
}

export function InsightCard({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.insightCard}>
      <View style={styles.insightIcon}>
        <Text style={{ fontSize: 16 }}>💡</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.insightTitle}>{title}</Text>
        {description !== "" && (
          <Text style={styles.insightDesc}>{description}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mintCard: {
    borderRadius: 20,
    padding: 24,
    backgroundColor: colors.mint,
  },
  ruleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 16,
  },
  ruleLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.black,
  },
  primaryButton: {
    width: "100%",
    borderRadius: 100,
    paddingVertical: 18,
    paddingHorizontal: 24,
    backgroundColor: colors.black,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryButtonText: {
    color: colors.white,
    fontWeight: "400",
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  sectionLabel: {
    fontWeight: "400",
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.brown,
  },
  statBadge: {
    borderRadius: 100,
    borderWidth: 1,
    borderColor: colors.mintText,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statBadgeText: {
    fontSize: 11,
    fontWeight: "400",
    color: colors.mintText,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    backgroundColor: colors.warmWhite,
  },
  statCardValue: {
    fontSize: 32,
    fontWeight: "300",
    color: colors.black,
  },
  statCardLabel: {
    fontSize: 10,
    fontWeight: "300",
    color: colors.brown,
    marginTop: 8,
  },
  insightCard: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: colors.warmWhite,
    flexDirection: "row",
    gap: 16,
    alignItems: "flex-start",
  },
  insightIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.light,
    alignItems: "center",
    justifyContent: "center",
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: "400",
    color: colors.black,
    lineHeight: 20,
  },
  insightDesc: {
    fontSize: 12,
    fontWeight: "300",
    color: colors.brown,
    marginTop: 4,
    lineHeight: 18,
  },
});
