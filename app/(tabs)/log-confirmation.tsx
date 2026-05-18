import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

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
  if (feel === "amazing")     { bg = "#e8f5e9"; border = "#81c784"; color = "#2e7d32"; symbol = "★"; }
  if (feel === "good")        { bg = C.mint; border = C.mintDeep; color = C.mintText; symbol = "✦"; }
  if (feel === "ok")          { bg = C.light; border = C.mid; color = "#666"; symbol = "—"; }
  if (feel === "off")         { bg = "#fff3e0"; border = "#ffb74d"; color = "#e65100"; symbol = "○"; }
  if (feel === "totally_off") { bg = C.offBg; border = C.offBorder; color = C.offText; symbol = "✕"; }

  const labels: Record<string, string> = {
    amazing: "Amazing", good: "Good", ok: "Ok", off: "Off", totally_off: "Totally off",
  };

  return (
    <View style={[s.feelBadge, { backgroundColor: bg, borderColor: border }]}>
      <Text style={{ fontSize: 11, color }}>{symbol}</Text>
      <Text style={[s.feelBadgeText, { color }]}>{labels[feel] || feel}</Text>
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

// ── AI Status Type ────────────────────────────────────────────
type AIStatus = "analyzing" | "complete" | "error" | "skipped";

interface AnalyzedItem {
  name: string;
}

// ═══════════════════════════════════════════════════════════════
// LOG CONFIRMATION SCREEN
// ═══════════════════════════════════════════════════════════════
export default function LogConfirmationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    wore: string; feel: string; occasion: string; weather: string;
    date: string; outfit_log_id: string; has_photo: string;
  }>();

  const [aiStatus, setAiStatus] = useState<AIStatus>(
    params.has_photo === "true" ? "analyzing" : "skipped"
  );
  const [analyzedItems, setAnalyzedItems] = useState<AnalyzedItem[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  // Poll for AI analysis results
  useEffect(() => {
    if (aiStatus !== "analyzing" || !params.outfit_log_id) return;

    pollRef.current = setInterval(async () => {
      pollCountRef.current += 1;

      try {
        const { data: log } = await supabase
          .from("outfit_logs")
          .select("items")
          .eq("id", params.outfit_log_id)
          .single();

        if (log?.items && log.items.length > 0) {
          // Items have been populated by the Edge Function
          const { data: items } = await supabase
            .from("closet_items")
            .select("name")
            .in("id", log.items);

          setAnalyzedItems(
            (items || []).map(i => ({ name: i.name }))
          );
          setAiStatus("complete");
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // Ignore polling errors
      }

      // Stop after 15 polls (30 seconds)
      if (pollCountRef.current >= 15) {
        setAiStatus("error");
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [aiStatus, params.outfit_log_id]);

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>LOGGED</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
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

          {/* ── AI Analysis Status ── */}
          {aiStatus !== "skipped" && (
            <View style={s.aiCard}>
              {aiStatus === "analyzing" && (
                <View style={s.aiRow}>
                  <ActivityIndicator size="small" color={C.mintText} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.aiTitle}>Analyzing your outfit…</Text>
                    <Text style={s.aiSub}>
                      Identifying items to add to your closet.
                    </Text>
                  </View>
                </View>
              )}

              {aiStatus === "complete" && (
                <View>
                  <View style={s.aiRow}>
                    <View style={s.aiCheckCircle}>
                      <Text style={{ fontSize: 14, color: C.mintText }}>✓</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.aiTitle}>
                        {analyzedItems.length} {analyzedItems.length === 1 ? "item" : "items"} identified
                      </Text>
                      <Text style={s.aiSub}>Added to your closet automatically.</Text>
                    </View>
                  </View>
                  <View style={s.aiItemList}>
                    {analyzedItems.map((item, i) => (
                      <View key={i} style={s.aiItemChip}>
                        <Text style={s.aiItemText}>{item.name}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {aiStatus === "error" && (
                <View style={s.aiRow}>
                  <Text style={{ fontSize: 16, color: C.brown }}>—</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.aiTitle}>Analysis still processing</Text>
                    <Text style={s.aiSub}>Items will appear in your closet shortly.</Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Back button */}
          <TouchableOpacity onPress={() => router.replace("/(tabs)/closet")} style={s.backBtn} activeOpacity={0.7}>
  <Text style={s.backBtnText}>GO TO YOUR CLOSET →</Text>
</TouchableOpacity>
        </View>
      </ScrollView>
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
  aiCard: {
    width: "100%", backgroundColor: C.warmWhite, borderWidth: 1.5,
    borderColor: C.mintDeep, borderRadius: 16, padding: 18,
    borderStyle: "dashed",
  },
  aiRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
  },
  aiCheckCircle: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: C.mint,
    alignItems: "center", justifyContent: "center",
  },
  aiTitle: {
    fontSize: 14, fontWeight: "400", color: C.black,
  },
  aiSub: {
    fontSize: 11, fontWeight: "300", color: C.brown, marginTop: 2,
  },
  aiItemList: {
    flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 14,
  },
  aiItemChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100,
    backgroundColor: C.mint,
  },
  aiItemText: {
    fontSize: 11, fontWeight: "400", color: C.mintText, letterSpacing: 0.3,
  },
  backBtn: {
    width: "100%", borderRadius: 100, paddingVertical: 18,
    backgroundColor: C.black, alignItems: "center",
  },
  backBtnText: { color: C.white, fontSize: 12, fontWeight: "400", letterSpacing: 2 },
});
