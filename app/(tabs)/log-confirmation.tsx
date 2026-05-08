import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

// ── Colors ────────────────────────────────────────────────────
const C = {
  black: "#1a1a1a", white: "#ffffff", warmWhite: "#faf9f7",
  brown: "#8b7d6b", mid: "#999", light: "#e8e4df",
  mint: "#d6ede6", mintDeep: "#a8d5c5", mintText: "#2a6b55",
  offBg: "#f0e8e8", offBorder: "#dcc", offText: "#5c3a3a",
};

// ── Feel Badge ────────────────────────────────────────────────
function FeelBadge({ feel }: { feel: string }) {
  let bg = C.light, border = C.mid, color = "#666", symbol = "—";
  if (feel === "good") { bg = C.mint; border = C.mintDeep; color = C.mintText; symbol = "✦"; }
  if (feel === "off")  { bg = C.offBg; border = C.offBorder; color = C.offText; symbol = "○"; }

  return (
    <View style={[s.feelBadge, { backgroundColor: bg, borderColor: border }]}>
      <Text style={{ fontSize: 11, color }}>{symbol}</Text>
      <Text style={[s.feelBadgeText, { color }]}>Felt {feel}</Text>
    </View>
  );
}

// ── Summary Row ───────────────────────────────────────────────
function SummaryRow({ label, value, last }: { label: string; value: React.ReactNode; last?: boolean }) {
  return (
    <View style={[s.summaryRow, !last && { borderBottomWidth: 1, borderBottomColor: C.light }]}>
      <Text style={s.summaryLabel}>{label}</Text>
      {typeof value === "string" ? (
        <Text style={s.summaryValue}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// LOG CONFIRMATION SCREEN
// ═══════════════════════════════════════════════════════════════
export default function LogConfirmationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    wore: string; feel: string; occasion: string; weather: string; date: string;
  }>();

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>LOGGED</Text>
      </View>

      {/* Content */}
      <View style={s.content}>
        {/* Check ring */}
        <View style={s.checkRing}>
          <Text style={{ fontSize: 36, color: C.mintText }}>✓</Text>
        </View>

        {/* Title */}
        <Text style={s.title}>Outfit saved.</Text>

        {/* Subtitle */}
        <Text style={s.subtitle}>
          Your wardrobe memory is building. Insights will start to surface soon.
        </Text>

        {/* Summary card */}
        <View style={s.summaryCard}>
          <SummaryRow label="Wore" value={params.wore || "—"} />
          <SummaryRow label="Felt" value={params.feel ? <FeelBadge feel={params.feel} /> : <Text style={s.summaryValue}>—</Text>} />
          <SummaryRow label="Occasion" value={params.occasion || "—"} />
          <SummaryRow label="Weather" value={params.weather || "—"} />
          <SummaryRow label="Date" value={params.date || "—"} last />
        </View>

        {/* Back button */}
        <TouchableOpacity onPress={() => router.replace("/(tabs)")} style={s.backBtn} activeOpacity={0.7}>
          <Text style={s.backBtnText}>← BACK TO DASHBOARD</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.white },
  header: {
    alignItems: "center", paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: C.light,
  },
  headerTitle: { fontSize: 13, fontWeight: "300", letterSpacing: 1.5, color: C.black },
  content: {
    flex: 1, alignItems: "center", paddingHorizontal: 20, paddingTop: 32, gap: 20,
  },
  checkRing: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: C.mint,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 28, fontWeight: "300", color: C.black },
  subtitle: {
    fontSize: 13, fontWeight: "300", color: C.brown, lineHeight: 22,
    textAlign: "center", maxWidth: 280,
  },
  summaryCard: {
    width: "100%", backgroundColor: C.warmWhite, borderWidth: 1,
    borderColor: C.light, borderRadius: 16, paddingHorizontal: 24, paddingVertical: 4,
  },
  summaryRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 12,
  },
  summaryLabel: {
    fontSize: 9, fontWeight: "300", letterSpacing: 1.5, textTransform: "uppercase", color: C.brown,
  },
  summaryValue: { fontSize: 14, fontWeight: "400", color: C.black, textAlign: "right", maxWidth: 200 },
  feelBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100, borderWidth: 1,
  },
  feelBadgeText: { fontSize: 10, fontWeight: "300", letterSpacing: 0.8 },
  backBtn: {
    width: "100%", borderRadius: 100, paddingVertical: 18,
    backgroundColor: C.black, alignItems: "center",
  },
  backBtnText: { color: C.white, fontSize: 12, fontWeight: "400", letterSpacing: 2 },
});
