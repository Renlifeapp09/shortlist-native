import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Animated, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { supabase } from "../../lib/supabase";

// ── Colors ────────────────────────────────────────────────────
const C = {
  black: "#1a1a1a", white: "#ffffff", warmWhite: "#faf9f7",
  brown: "#8b7d6b", mid: "#999", light: "#e8e4df",
  mint: "#d6ede6", mintDeep: "#a8d5c5", mintText: "#2a6b55",
  blush: "#f5e8e2", blushText: "#8b5e3c", offBar: "#e8c8b8",
};

// ── Types ─────────────────────────────────────────────────────
type Range = "30d" | "90d" | "all";

interface CategoryRow { name: string; rate: number; worn: number; total: number; sub: string }
interface MonthData { label: string; good: number; ok: number; off: number }
interface PatternItem { title: string; sub: string }
interface OverbuyItem { count: number; label: string; sub: string }
interface ClosetItem { name: string; sub: string; wornCount: number; bgColor: string; photo_url?: string }

interface InsightsData {
  logCount: number; narrative: string; categories: CategoryRow[];
  months: MonthData[]; patterns: PatternItem[]; overbuys: OverbuyItem[];
  mostWorn: ClosetItem[]; leastWorn: ClosetItem[];
}

const RANGES: { label: string; value: Range }[] = [
  { label: "30 days", value: "30d" },
  { label: "90 days", value: "90d" },
  { label: "All time", value: "all" },
];

// ── Animated Bar ──────────────────────────────────────────────
function AnimBar({ rate }: { rate: number }) {
  const width = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(width, { toValue: rate, duration: 700, useNativeDriver: false }).start();
  }, [rate]);
  const color = rate > 70 ? C.mintText : rate >= 40 ? C.mintDeep : "#d4a8a0";
  return (
    <View style={{ height: 5, backgroundColor: C.light, borderRadius: 100, marginTop: 6, marginBottom: 5, overflow: "hidden" }}>
      <Animated.View style={{
        height: 5, borderRadius: 100, backgroundColor: color,
        width: width.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }),
      }} />
    </View>
  );
}

// ── Section Header ────────────────────────────────────────────
function SectionHeader({ children }: { children: string }) {
  return <Text style={s.sectionHeader}>{children}</Text>;
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: C.light, marginHorizontal: 28, marginVertical: 8 }} />;
}

function LockedBox({ text }: { text: string }) {
  return (
    <View style={s.lockedBox}>
      <Text style={s.lockedText}>{text}</Text>
    </View>
  );
}

// ── Worn Card ─────────────────────────────────────────────────
function WornCard({ item, kind }: { item: ClosetItem; kind: "most" | "least" }) {
  const isMost = kind === "most";
  const badgeBg = isMost ? C.mint : C.blush;
  const badgeCol = isMost ? C.mintText : C.blushText;
  const badgeTxt = isMost ? "MOST WORN" : item.wornCount === 0 ? "NEVER WORN" : "LEAST WORN";

  return (
    <View style={s.wornCard}>
      <View style={[s.wornThumb, { backgroundColor: item.bgColor }]}>
        {item.photo_url && (
          <Image source={{ uri: item.photo_url }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
        )}
        <View style={s.wornCountBadge}>
          <Text style={s.wornCountText}>worn {item.wornCount}×</Text>
        </View>
      </View>
      <View style={{ padding: 12 }}>
        <View style={[s.pillBadge, { backgroundColor: badgeBg }]}>
          <Text style={[s.pillText, { color: badgeCol }]}>{badgeTxt}</Text>
        </View>
        <Text style={s.wornName}>{item.name}</Text>
        <Text style={s.wornSub}>{item.sub}</Text>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// INSIGHTS SCREEN
// ═══════════════════════════════════════════════════════════════
export default function InsightsScreen() {
  const [range, setRange] = useState<Range>("90d");
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<InsightsData | null>(null);

  // Refresh on focus
  useFocusEffect(
    React.useCallback(() => {
      loadInsights();
    }, [range])
  );

  async function loadInsights() {
    setIsLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setIsLoading(false); return; }

    const userId = session.user.id;
    const now = new Date();
    let rangeStart = new Date();
    if (range === "30d") rangeStart.setDate(now.getDate() - 30);
    else if (range === "90d") rangeStart.setDate(now.getDate() - 90);
    else rangeStart = new Date("2020-01-01");
    const rangeStartStr = rangeStart.toISOString().split("T")[0];

    // Count outfits
    const { count: outfitCount } = await supabase
      .from("outfit_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("worn_date", rangeStartStr);

    // Fetch closet items
    const { data: items } = await supabase
      .from("closet_items")
      .select("id, name, category, wear_count, avg_feel, last_worn, photo_url")
      .eq("user_id", userId)
      .eq("status", "active");

    const allItems = items || [];

    // Fetch wear_logs in range to calculate range-specific wear rates
    const { data: wearLogs } = await supabase
      .from("wear_logs")
      .select("closet_item_id")
      .eq("user_id", userId)
      .gte("worn_date", rangeStartStr);

    const wornInRange = new Set((wearLogs || []).map(w => w.closet_item_id));

    // Wear rate by category
    const categoryMap: Record<string, { worn: number; total: number }> = {};
    for (const item of allItems) {
      if (!categoryMap[item.category]) categoryMap[item.category] = { worn: 0, total: 0 };
      categoryMap[item.category].total += 1;
      if (item.wear_count > 0) categoryMap[item.category].worn += 1;
    }

    const categories: CategoryRow[] = Object.entries(categoryMap)
      .map(([name, { worn, total }]) => {
        const rate = total > 0 ? Math.round((worn / total) * 100) : 0;
        let sub = `${worn} of ${total}`;
        if (rate >= 80) sub += " — strong rotation";
        else if (rate >= 50) sub += " — moderate use";
        else if (rate > 0) sub += " — consider reducing purchases";
        else sub += " — no items worn yet";
        return { name, rate, worn, total, sub };
      })
      .sort((a, b) => b.rate - a.rate);

  // Most & least worn (top 3 each)
  const sorted = [...allItems].sort((a, b) => (b.wear_count || 0) - (a.wear_count || 0));
  const mostWorn: ClosetItem[] = sorted.slice(0, 3).map(item => ({
    name: item.name,
    sub: item.avg_feel ? `avg feel ${item.avg_feel}/5` : "no feel data yet",
    wornCount: item.wear_count || 0,
    bgColor: "#2a2a2a",
    photo_url: item.photo_url || undefined,
  }));
  const leastWorn: ClosetItem[] = sorted.slice(-3).reverse().map(item => ({
    name: item.name,
    sub: item.wear_count === 0 ? "never worn" : `worn ${item.wear_count} time(s)`,
    wornCount: item.wear_count || 0,
    bgColor: "#e8e0d4",
    photo_url: item.photo_url || undefined,
  }));

      // Feel trend by month
    const { data: feelLogs } = await supabase
    .from("outfit_logs")
    .select("worn_date, overall_feel")
    .eq("user_id", userId)
    .gte("worn_date", rangeStartStr);

  const monthMap: Record<string, { good: number; ok: number; off: number }> = {};
  for (const log of (feelLogs || [])) {
    const d = new Date(log.worn_date);
    const key = d.toLocaleString("en-US", { month: "short" }).toUpperCase();
    if (!monthMap[key]) monthMap[key] = { good: 0, ok: 0, off: 0 };
    if (log.overall_feel >= 4) monthMap[key].good += 1;
    else if (log.overall_feel >= 3) monthMap[key].ok += 1;
    else if (log.overall_feel != null) monthMap[key].off += 1;
  }
  const months: MonthData[] = Object.entries(monthMap).map(([label, counts]) => ({ label, ...counts }));

    // AI narrative (10+ outfits)
    // AI narrative (10+ outfits)
    let narrative = "Keep logging — patterns start to emerge after about 10 outfits.";
    if ((outfitCount || 0) >= 10) {
      try {
        const { data: aiData, error: aiError } = await supabase.functions.invoke("ai-generate", {
          body: {
            context_type: "insights_narrative",
            instructions: "1-2 sentences max. Be specific and actionable. No filler.",
          },
        });
        if (!aiError && aiData?.text) narrative = aiData.text;
      } catch {}
    }

    setData({
      logCount: outfitCount || 0, narrative, categories,
      months, patterns: [], overbuys: [],
      mostWorn, leastWorn,
    });
    setIsLoading(false);
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  const logCount = data?.logCount || 0;

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerRow}>
          <Text style={s.headerTitle}>INSIGHTS</Text>
          <Text style={s.headerCount}>{logCount} logs</Text>
        </View>
        {/* Range Toggle */}
        <View style={s.rangeRow}>
          {RANGES.map(({ label, value }) => {
            const active = range === value;
            return (
              <TouchableOpacity key={value} onPress={() => setRange(value)}
                style={[s.rangeBtn, active && s.rangeBtnActive]}>
                <Text style={[s.rangeText, active && s.rangeTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={C.mid} />
          <Text style={{ fontSize: 11, color: C.mid, marginTop: 12 }}>Loading insights...</Text>
        </View>
      ) : !data ? null : (
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

          {/* ── AI Narrative (unlocks at 10) ── */}
          {logCount >= 10 ? (
            <View style={s.narrativeCard}>
              <Text style={s.narrativeEyebrow}>
                YOUR {range === "30d" ? "30-DAY" : range === "90d" ? "90-DAY" : "ALL-TIME"} PATTERN
              </Text>
              <Text style={s.narrativeText}>{data.narrative}</Text>
            </View>
          ) : (
            <View style={{ paddingHorizontal: 28, paddingTop: 20 }}>
              <View style={s.progressCard}>
                <Text style={s.progressText}>
                  {logCount < 3
                    ? "Start logging outfits to unlock insights."
                    : `${10 - logCount} more outfit${10 - logCount === 1 ? "" : "s"} until your style narrative unlocks.`}
                </Text>
                <View style={s.progressTrack}>
                  <View style={[s.progressFill, { width: `${Math.min(100, (logCount / 10) * 100)}%` }]} />
                </View>
              </View>
            </View>
          )}

          <Divider />

          {/* ── Wear Rate by Category (unlocks at 5) ── */}
          {logCount >= 5 ? (
            <View style={{ paddingTop: 24, paddingBottom: 8 }}>
              <SectionHeader>WEAR RATE BY CATEGORY</SectionHeader>
              <View style={{ paddingHorizontal: 28, gap: 16 }}>
                {data.categories.map((cat) => (
                  <View key={cat.name}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                      <Text style={s.catName}>{cat.name}</Text>
                      <Text style={s.catRate}>{cat.rate}%</Text>
                    </View>
                    <AnimBar rate={cat.rate} />
                    <Text style={s.catSub}>{cat.sub}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : logCount >= 3 ? (
            <View style={{ paddingTop: 24, paddingBottom: 8 }}>
              <SectionHeader>WEAR RATE BY CATEGORY</SectionHeader>
              <LockedBox text={`${5 - logCount} more outfit${5 - logCount === 1 ? "" : "s"} to unlock category breakdown.`} />
            </View>
          ) : null}

          <Divider />

          {/* ── Feel Trend (unlocks at 5) ── */}
          {logCount >= 5 && data.months.length > 0 ? (
            <View style={{ paddingTop: 24, paddingBottom: 8 }}>
              <SectionHeader>HOW YOU'VE FELT</SectionHeader>
              <View style={{ flexDirection: "row", justifyContent: "space-around", alignItems: "flex-end", paddingHorizontal: 28, height: 108 }}>
                {data.months.map((m) => {
                  const total = m.good + m.ok + m.off;
                  const maxTotal = Math.max(...data.months.map(x => x.good + x.ok + x.off), 1);
                  const scale = total / maxTotal;
                  const h = 80;
                  const goodH = Math.round((m.good / total) * h * scale);
                  const okH = Math.round((m.ok / total) * h * scale);
                  const offH = Math.round((m.off / total) * h * scale);
                  return (
                    <View key={m.label} style={{ alignItems: "center" }}>
                      <View style={{ width: 20 }}>
                        <View style={{ height: goodH, backgroundColor: C.mintDeep, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
                        <View style={{ height: okH, backgroundColor: C.light, borderWidth: 1, borderColor: C.mid }} />
                        <View style={{ height: offH, backgroundColor: C.offBar, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 }} />
                      </View>
                      <Text style={s.monthLabel}>{m.label}</Text>
                    </View>
                  );
                })}
              </View>
              {/* Legend */}
              <View style={{ flexDirection: "row", justifyContent: "center", gap: 16, marginTop: 12, paddingHorizontal: 28 }}>
                {[{ l: "Felt good", c: C.mintDeep }, { l: "Felt ok", c: C.light }, { l: "Felt off", c: C.offBar }].map(({ l, c }) => (
                  <View key={l} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} />
                    <Text style={{ fontSize: 9, color: C.brown }}>{l}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : logCount >= 5 ? (
            <View style={{ paddingTop: 24, paddingBottom: 8 }}>
              <SectionHeader>HOW YOU'VE FELT OVER TIME</SectionHeader>
              <LockedBox text={`${15 - logCount} more outfit${15 - logCount === 1 ? "" : "s"} to unlock feel trends.`} />
            </View>
          ) : null}

          {logCount >= 5 && <Divider />}

          {/* ── Most & Least Worn (unlocks at 3) ── */}
          {logCount >= 3 && (
            <View style={{ paddingTop: 24, paddingBottom: 8 }}>
              <SectionHeader>MOST WORN</SectionHeader>
              <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 28 }}>
                {data.mostWorn.map((item, i) => (
                  <View key={`most-${i}`} style={{ flex: 1 }}><WornCard item={item} kind="most" /></View>
                ))}
              </View>

              <View style={{ height: 24 }} />

              <SectionHeader>LEAST WORN</SectionHeader>
              <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 28 }}>
                {data.leastWorn.map((item, i) => (
                  <View key={`least-${i}`} style={{ flex: 1 }}><WornCard item={item} kind="least" /></View>
                ))}
              </View>
            </View>
          )}

          {/* ── Empty state for new users ── */}
          {logCount < 3 && (
            <View style={{ padding: 48, alignItems: "center" }}>
              <Text style={s.emptyTitle}>Your insights are building.</Text>
              <Text style={s.emptySub}>
                Log {3 - logCount} more outfit{3 - logCount === 1 ? "" : "s"} to see your most and least worn items appear here.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.white },
  header: { backgroundColor: C.white, paddingHorizontal: 28, paddingTop: 20 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  headerTitle: { fontSize: 13, fontWeight: "300", letterSpacing: 1, textTransform: "uppercase", color: C.black },
  headerCount: { fontSize: 11, fontWeight: "300", letterSpacing: 0.5, color: C.mid },
  rangeRow: {
    flexDirection: "row", borderWidth: 1, borderColor: C.light, borderRadius: 100,
    backgroundColor: C.warmWhite, padding: 3, marginTop: 12, marginBottom: 16,
  },
  rangeBtn: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 100 },
  rangeBtnActive: { backgroundColor: C.white, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  rangeText: { fontSize: 10, fontWeight: "300", letterSpacing: 1, textTransform: "uppercase", color: C.mid },
  rangeTextActive: { fontWeight: "400", color: C.black },
  sectionHeader: {
    fontSize: 9, fontWeight: "400", letterSpacing: 2, textTransform: "uppercase",
    color: C.brown, paddingHorizontal: 28, paddingBottom: 16,
  },
  narrativeCard: { backgroundColor: C.mint, borderRadius: 20, padding: 24, marginHorizontal: 28, marginTop: 20, marginBottom: 8 },
  narrativeEyebrow: { fontSize: 9, fontWeight: "400", letterSpacing: 2, color: C.mintText, marginBottom: 12 },
  narrativeText: { fontSize: 15, fontWeight: "400", color: C.mintText, lineHeight: 25 },
  progressCard: { backgroundColor: C.mint, borderRadius: 16, padding: 20, alignItems: "center" },
  progressText: { fontSize: 12, fontWeight: "400", color: C.mintText, textAlign: "center", marginBottom: 12 },
  progressTrack: { width: "100%", height: 4, borderRadius: 2, backgroundColor: C.mintDeep, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2, backgroundColor: C.mintText },
  lockedBox: {
    marginHorizontal: 28, backgroundColor: C.warmWhite, borderWidth: 1, borderStyle: "dashed",
    borderColor: C.light, borderRadius: 14, padding: 20, alignItems: "center",
  },
  lockedText: { fontSize: 11, fontWeight: "300", color: C.mid, letterSpacing: 0.3 },
  catName: { fontSize: 13, fontWeight: "400", color: C.black },
  catRate: { fontSize: 13, fontWeight: "400", color: C.black },
  catSub: { fontSize: 10, fontWeight: "300", color: C.brown, letterSpacing: 0.3 },
  monthLabel: { fontSize: 9, letterSpacing: 0.8, textTransform: "uppercase", color: C.brown, marginTop: 6 },
  wornCard: { borderWidth: 1, borderColor: C.light, borderRadius: 16, overflow: "hidden" },
  wornThumb: { height: 140, position: "relative" },
  wornCountBadge: {
    position: "absolute", top: 8, left: 8, backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 100,
  },
  wornCountText: { fontSize: 8, fontWeight: "400", color: "#fff", letterSpacing: 0.5 },
  pillBadge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100, marginBottom: 8 },
  pillText: { fontSize: 8, fontWeight: "400", letterSpacing: 1 },
  wornName: { fontSize: 13, fontWeight: "400", color: C.black, marginBottom: 4, lineHeight: 17 },
  wornSub: { fontSize: 10, fontWeight: "300", color: C.mid },
  emptyTitle: { fontSize: 22, fontWeight: "300", color: C.black, marginBottom: 8 },
  emptySub: { fontSize: 13, fontWeight: "300", color: C.brown, lineHeight: 21, textAlign: "center" },
});
