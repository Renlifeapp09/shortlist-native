import React, { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { supabase } from "../../lib/supabase";

// ── Colors ────────────────────────────────────────────────────
const C = {
  black: "#1a1a1a", white: "#ffffff", warmWhite: "#faf9f7",
  brown: "#8b7d6b", mid: "#999", light: "#e8e4df",
  mint: "#d6ede6", mintDeep: "#a8d5c5", mintText: "#2a6b55",
  amazing: "#2e7d32", amazingBg: "#e8f5e9",
  good: "#2a6b55", goodBg: "#d6ede6",
  ok: "#999", okBg: "#e8e4df",
  off: "#e65100", offBg: "#fff3e0",
};

// ── Types ─────────────────────────────────────────────────────
interface DashboardData {
  userName: string;
  closetSize: number;
  logsThisMonth: number;
  // Feelings
  feelCounts: { amazing: number; good: number; ok: number; off: number };
  feelTotal: number;
  feelPositivePct: number;
  // Money saved
  moneySaved: number;
  skippedCount: number;
  // Streak
  streakDays: number;
  monthlyGoal: number;
  // Active items
  activeItemsCount: number;
  activeItemsPct: number;
  // Concentration
  concentrationPct: number;
  // Top 3
  topItems: { name: string; category: string; wornCount: number; photo_url?: string }[];
}

// ── Greeting ──────────────────────────────────────────────────
function getGreeting(): { time: string; greeting: string } {
  const h = new Date().getHours();
  const days = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  const day = days[new Date().getDay()];
  if (h < 12) return { time: `${day} MORNING`, greeting: "Good morning" };
  if (h < 17) return { time: `${day} AFTERNOON`, greeting: "Good afternoon" };
  return { time: `${day} EVENING`, greeting: "Good evening" };
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD SCREEN
// ═══════════════════════════════════════════════════════════════
export default function DashboardScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      loadDashboard();
    }, [])
  );

  async function loadDashboard() {
    setIsLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setIsLoading(false); return; }

    const userId = session.user.id;
    const userName = session.user.user_metadata?.display_name
      || session.user.user_metadata?.full_name
      || session.user.email?.split("@")[0]
      || "there";

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString().split("T")[0];

    // ── Closet size ──
    const { count: closetSize } = await supabase
      .from("closet_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "active");

    // ── Outfit logs this month ──
    const { data: monthLogs, count: logsThisMonth } = await supabase
      .from("outfit_logs")
      .select("id, overall_feel, worn_date", { count: "exact" })
      .eq("user_id", userId)
      .gte("worn_date", monthStart);

    // ── Feelings (last 30 days) ──
    const { data: recentLogs } = await supabase
      .from("outfit_logs")
      .select("overall_feel")
      .eq("user_id", userId)
      .gte("worn_date", thirtyDaysAgo)
      .not("overall_feel", "is", null);

    const feelCounts = { amazing: 0, good: 0, ok: 0, off: 0 };
    for (const log of (recentLogs || [])) {
      if (log.overall_feel >= 5) feelCounts.amazing++;
      else if (log.overall_feel >= 4) feelCounts.good++;
      else if (log.overall_feel >= 3) feelCounts.ok++;
      else feelCounts.off++;
    }
    const feelTotal = (recentLogs || []).length;
    const feelPositivePct = feelTotal > 0
      ? Math.round(((feelCounts.amazing + feelCounts.good) / feelTotal) * 100)
      : 0;

    // ── Streak ──
    let streakDays = 0;
    const { data: streakLogs } = await supabase
      .from("outfit_logs")
      .select("worn_date")
      .eq("user_id", userId)
      .order("worn_date", { ascending: false })
      .limit(60);

    if (streakLogs && streakLogs.length > 0) {
      const uniqueDates = [...new Set(streakLogs.map(l => l.worn_date))].sort().reverse();
      const today = new Date().toISOString().split("T")[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

      // Streak starts from today or yesterday
      if (uniqueDates[0] === today || uniqueDates[0] === yesterday) {
        streakDays = 1;
        for (let i = 1; i < uniqueDates.length; i++) {
          const prev = new Date(uniqueDates[i - 1] + "T00:00:00");
          const curr = new Date(uniqueDates[i] + "T00:00:00");
          const diffDays = (prev.getTime() - curr.getTime()) / 86400000;
          if (diffDays === 1) {
            streakDays++;
          } else {
            break;
          }
        }
      }
    }

    // ── Money saved (from decide verdicts — skipped purchases) ──
    let moneySaved = 0;
    let skippedCount = 0;
    try {
      const { data: skipped } = await supabase
        .from("purchase_decisions")
        .select("price")
        .eq("user_id", userId)
        .eq("verdict", "skip")
        .gte("created_at", thirtyDaysAgo);

      if (skipped && skipped.length > 0) {
        skippedCount = skipped.length;
        moneySaved = skipped.reduce((sum: number, d: any) => sum + (d.price || 0), 0);
      }
    } catch {
      // Table may not exist yet — that's fine
    }

    // ── Active items (worn in last 30 days) ──
    const { data: wornItems } = await supabase
      .from("closet_items")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .gte("last_worn", thirtyDaysAgo);

    const activeItemsCount = (wornItems || []).length;
    const totalItems = closetSize || 0;
    const activeItemsPct = totalItems > 0 ? Math.round((activeItemsCount / totalItems) * 100) : 0;

    // ── Concentration (top 3 items appearances / total outfits) ──
    const { data: allItems } = await supabase
      .from("closet_items")
      .select("id, wear_count")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("wear_count", { ascending: false })
      .limit(3);

    const top3WearCount = (allItems || []).reduce((sum: number, i: any) => sum + (i.wear_count || 0), 0);
    const totalWears = (logsThisMonth || 0);
    // Each outfit has ~2-3 items, so total item-wears this month ≈ logs × avg items
    // Simpler: top 3 items total wears / all item wears
    const { data: allItemWears } = await supabase
      .from("closet_items")
      .select("wear_count")
      .eq("user_id", userId)
      .eq("status", "active");

    const totalAllWears = (allItemWears || []).reduce((sum: number, i: any) => sum + (i.wear_count || 0), 0);
    const concentrationPct = totalAllWears > 0 ? Math.round((top3WearCount / totalAllWears) * 100) : 0;

    // ── Top 3 most worn ──
    const { data: topItemsData } = await supabase
      .from("closet_items")
      .select("name, category, wear_count, photo_url, cropped_photo_url")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("wear_count", { ascending: false })
      .limit(3);

    const topItems = (topItemsData || []).map((i: any) => ({
      name: i.name,
      category: i.category,
      wornCount: i.wear_count || 0,
      photo_url: i.cropped_photo_url || i.photo_url || undefined,
    }));

    setData({
      userName, closetSize: totalItems, logsThisMonth: logsThisMonth || 0,
      feelCounts, feelTotal, feelPositivePct,
      moneySaved, skippedCount,
      streakDays, monthlyGoal: 10,
      activeItemsCount, activeItemsPct,
      concentrationPct,
      topItems,
    });
    setIsLoading(false);
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  const { time, greeting } = getGreeting();

  if (isLoading || !data) {
    return (
      <SafeAreaView style={s.container} edges={["top"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={C.mid} />
        </View>
      </SafeAreaView>
    );
  }

  const streakRemaining = Math.max(0, data.monthlyGoal - data.logsThisMonth);
  const streakPct = Math.min(100, (data.logsThisMonth / data.monthlyGoal) * 100);

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={s.header}>
          <View style={s.headerRow}>
            <Text style={s.brand}>THE SHORTLIST</Text>
            <TouchableOpacity onPress={() => router.push("/(tabs)/profile")} activeOpacity={0.7}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>
                  {data.userName.substring(0, 2).toUpperCase()}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
          <Text style={s.timeLabel}>{time}</Text>
          <Text style={s.greeting}>{greeting}, {data.userName}.</Text>
        </View>

        {/* ── Closet Summary Card ── */}
        <View style={s.closetCard}>
          <Text style={s.closetEyebrow}>YOUR CLOSET</Text>
          <Text style={s.closetNum}>{data.closetSize}</Text>
          <View style={s.closetLine} />
          <Text style={s.closetDesc}>
            You own {data.closetSize} active item{data.closetSize !== 1 ? "s" : ""}. Logged {data.logsThisMonth} outfit{data.logsThisMonth !== 1 ? "s" : ""} this month.
          </Text>
          <View style={s.closetPills}>
            <View style={s.closetPill}>
              <Text style={s.closetPillText}>{data.closetSize} items</Text>
            </View>
            <View style={s.closetPill}>
              <Text style={s.closetPillText}>{data.logsThisMonth} logged this month</Text>
            </View>
          </View>
        </View>

        <View style={s.cards}>

          {/* ── Feelings (Option A bar chart) ── */}
          {data.feelTotal > 0 && (
            <View style={s.card}>
              <Text style={s.eyebrow}>HOW YOU'VE BEEN FEELING</Text>
              <View style={s.feelBar}>
                {data.feelCounts.amazing > 0 && (
                  <View style={{ flex: data.feelCounts.amazing, backgroundColor: C.amazingBg, borderTopLeftRadius: 8, borderBottomLeftRadius: 8 }} />
                )}
                {data.feelCounts.good > 0 && (
                  <View style={{ flex: data.feelCounts.good, backgroundColor: C.goodBg }} />
                )}
                {data.feelCounts.ok > 0 && (
                  <View style={{ flex: data.feelCounts.ok, backgroundColor: C.okBg }} />
                )}
                {data.feelCounts.off > 0 && (
                  <View style={{ flex: data.feelCounts.off, backgroundColor: C.offBg, borderTopRightRadius: 8, borderBottomRightRadius: 8 }} />
                )}
              </View>
              <View style={s.feelLegend}>
                {data.feelCounts.amazing > 0 && (
                  <View style={s.feelLegendItem}>
                    <View style={[s.feelDot, { backgroundColor: C.amazing }]} />
                    <Text style={s.feelLegendText}>Amazing {Math.round((data.feelCounts.amazing / data.feelTotal) * 100)}%</Text>
                  </View>
                )}
                {data.feelCounts.good > 0 && (
                  <View style={s.feelLegendItem}>
                    <View style={[s.feelDot, { backgroundColor: C.good }]} />
                    <Text style={s.feelLegendText}>Good {Math.round((data.feelCounts.good / data.feelTotal) * 100)}%</Text>
                  </View>
                )}
                {data.feelCounts.ok > 0 && (
                  <View style={s.feelLegendItem}>
                    <View style={[s.feelDot, { backgroundColor: C.ok }]} />
                    <Text style={s.feelLegendText}>Ok {Math.round((data.feelCounts.ok / data.feelTotal) * 100)}%</Text>
                  </View>
                )}
                {data.feelCounts.off > 0 && (
                  <View style={s.feelLegendItem}>
                    <View style={[s.feelDot, { backgroundColor: C.off }]} />
                    <Text style={s.feelLegendText}>Off {Math.round((data.feelCounts.off / data.feelTotal) * 100)}%</Text>
                  </View>
                )}
              </View>
              <Text style={s.feelSummary}>
                {data.feelPositivePct}% of your outfits felt good or better this month.
              </Text>
            </View>
          )}

          {/* ── Money Saved + Streak side by side ── */}
          <View style={s.grid2}>
            <View style={[s.card,  { flex: 1, backgroundColor: C.mint, borderColor: C.mintDeep, marginBottom: 0 }]}>
              <Text style={[s.eyebrow, { color: C.mintText }]}>SAVED</Text>
              <Text style={s.savedAmount}>${data.moneySaved}</Text>
              <Text style={s.savedSub}>
                {data.skippedCount > 0
                  ? `${data.skippedCount} purchase${data.skippedCount !== 1 ? "s" : ""} skipped`
                  : "No skipped purchases yet"}
              </Text>
            </View>
            <View style={[s.card, { flex: 1, backgroundColor: C.black, borderColor: "#333", marginBottom: 0 }]}>
              <Text style={[s.eyebrow, { color: C.mintDeep }]}>STREAK</Text>
              <Text style={s.streakNum}>{data.streakDays}</Text>
              <Text style={s.streakSub}>
                {streakRemaining > 0
                  ? `${streakRemaining} to monthly goal`
                  : data.streakDays === 0
                    ? "Restart your streak today"
                    : "Monthly goal hit!"}
              </Text>
              <View style={s.streakTrack}>
                <View style={[s.streakFill, { width: `${streakPct}%` }]} />
              </View>
            </View>
          </View>

          {/* ── Active Items + Concentration split card ── */}
          <View style={[s.card, { padding: 0, overflow: "hidden" }]}>
            <View style={s.splitRow}>
              <View style={{ flex: 1 }}>
                <Text style={[s.eyebrow, { marginBottom: 4 }]}>ACTIVE ITEMS RATE</Text>
                <Text style={s.splitSub}>{data.activeItemsCount} of {data.closetSize} items worn this month</Text>
              </View>
              <Text style={[s.splitPct, { color: C.mintText }]}>{data.activeItemsPct}%</Text>
            </View>
            <View style={s.splitBarContainer}>
              <View style={[s.splitBarFill, { width: `${data.activeItemsPct}%`, backgroundColor: C.mintText }]} />
            </View>
            <View style={s.splitDivider} />
            <View style={s.splitRow}>
              <View style={{ flex: 1 }}>
                <Text style={[s.eyebrow, { marginBottom: 4 }]}>CLOSET CONCENTRATION</Text>
                <Text style={s.splitSub}>Top 3 in {data.concentrationPct}% of your outfits</Text>
              </View>
              <Text style={[s.splitPct, { color: data.concentrationPct > 70 ? "#b45309" : C.mintText }]}>{data.concentrationPct}%</Text>
            </View>
            <View style={[s.splitBarContainer, { marginBottom: 16 }]}>
              <View style={[s.splitBarFill, { width: `${data.concentrationPct}%`, backgroundColor: data.concentrationPct > 70 ? "#b45309" : C.mintText }]} />
            </View>
          </View>

          {/* ── Top 3 Most Worn — Podium ── */}
          {data.topItems.length >= 3 && (
            <View style={s.card}>
              <Text style={[s.eyebrow, { marginBottom: 14 }]}>TOP 3 MOST WORN</Text>
              <View style={s.podiumRow}>
                {/* #2 — left */}
                <View style={s.podiumCol}>
                  <View style={[s.podiumThumb, { height: 90, backgroundColor: "#8b7d6b" }]}>
                    {data.topItems[1]?.photo_url && (
                      <Image source={{ uri: data.topItems[1].photo_url }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                    )}
                    <View style={s.podiumBadge}>
                      <Text style={s.podiumBadgeText}>{data.topItems[1]?.wornCount}×</Text>
                    </View>
                  </View>
                  <View style={s.podiumInfo}>
                    <Text style={s.podiumName} numberOfLines={1}>{data.topItems[1]?.name}</Text>
                    <Text style={s.podiumRank}>2nd</Text>
                  </View>
                </View>
                {/* #1 — center (tallest) */}
                <View style={s.podiumCol}>
                  <View style={[s.podiumThumb, { height: 110, backgroundColor: "#d4d0ca" }]}>
                    {data.topItems[0]?.photo_url && (
                      <Image source={{ uri: data.topItems[0].photo_url }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                    )}
                    <View style={s.podiumBadge}>
                      <Text style={s.podiumBadgeText}>{data.topItems[0]?.wornCount}×</Text>
                    </View>
                    <View style={s.podiumStar}>
                      <Text style={{ fontSize: 8, fontWeight: "400", color: C.mintText, letterSpacing: 0.5 }}>★ #1</Text>
                    </View>
                  </View>
                  <View style={s.podiumInfo}>
                    <Text style={s.podiumName} numberOfLines={1}>{data.topItems[0]?.name}</Text>
                    <Text style={s.podiumRank}>1st</Text>
                  </View>
                </View>
                {/* #3 — right */}
                <View style={s.podiumCol}>
                  <View style={[s.podiumThumb, { height: 74, backgroundColor: "#f0ece6" }]}>
                    {data.topItems[2]?.photo_url && (
                      <Image source={{ uri: data.topItems[2].photo_url }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                    )}
                    <View style={s.podiumBadge}>
                      <Text style={s.podiumBadgeText}>{data.topItems[2]?.wornCount}×</Text>
                    </View>
                  </View>
                  <View style={s.podiumInfo}>
                    <Text style={s.podiumName} numberOfLines={1}>{data.topItems[2]?.name}</Text>
                    <Text style={s.podiumRank}>3rd</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Fallback if < 3 items */}
          {data.topItems.length > 0 && data.topItems.length < 3 && (
            <View style={s.card}>
              <Text style={[s.eyebrow, { marginBottom: 10 }]}>TOP MOST WORN</Text>
              {data.topItems.map((item, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: i < data.topItems.length - 1 ? 10 : 0 }}>
                  <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: "#e8e0d4", overflow: "hidden" }}>
                    {item.photo_url && (
                      <Image source={{ uri: item.photo_url }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: "400", color: C.black }}>{item.name}</Text>
                    <Text style={{ fontSize: 10, fontWeight: "300", color: C.mid, marginTop: 2 }}>{item.category} · {item.wornCount}× worn</Text>
                  </View>
                  <View style={{ backgroundColor: C.mint, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 }}>
                    <Text style={{ fontSize: 10, fontWeight: "400", color: C.mintText }}>{item.wornCount}×</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.white },
  // Header
  header: { paddingHorizontal: 20, paddingTop: 20 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  brand: { fontSize: 14, fontWeight: "400", letterSpacing: 2, color: C.black },
  avatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: C.black,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontSize: 12, fontWeight: "500", color: C.white },
  timeLabel: { fontSize: 10, fontWeight: "400", letterSpacing: 2, color: C.brown, marginBottom: 4 },
  greeting: { fontSize: 26, fontWeight: "300", color: C.black, marginBottom: 16 },
  // Closet summary
  closetCard: {
    backgroundColor: C.mint, borderRadius: 20, marginHorizontal: 12, padding: 20,
  },
  closetEyebrow: { fontSize: 9, fontWeight: "400", letterSpacing: 2, color: C.mintText, marginBottom: 6 },
  closetNum: { fontSize: 52, fontWeight: "300", color: C.brown, lineHeight: 56 },
  closetLine: { height: 2, backgroundColor: C.black, marginVertical: 12 },
  closetDesc: { fontSize: 13, fontWeight: "300", color: C.black, lineHeight: 20, marginBottom: 12 },
  closetPills: { flexDirection: "row", gap: 8 },
  closetPill: { borderWidth: 1, borderColor: C.mintText, borderRadius: 100, paddingHorizontal: 16, paddingVertical: 6 },
  closetPillText: { fontSize: 12, fontWeight: "400", color: C.mintText },
  // Cards
  cards: { padding: 12, paddingTop: 12 },
  card: {
    backgroundColor: C.warmWhite, borderWidth: 0.5, borderColor: C.light,
    borderRadius: 14, padding: 16, marginBottom: 10,
  },
  grid2: { flexDirection: "row", gap: 10, marginBottom: 10 },
  eyebrow: { fontSize: 9, fontWeight: "400", letterSpacing: 1.5, color: C.brown, marginBottom: 12 },
  // Feelings
  feelBar: { flexDirection: "row", height: 28, borderRadius: 8, overflow: "hidden", gap: 3, marginBottom: 10 },
  feelLegend: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 10 },
  feelLegendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  feelDot: { width: 8, height: 8, borderRadius: 4 },
  feelLegendText: { fontSize: 10, color: "#666" },
  feelSummary: { fontSize: 12, fontWeight: "300", color: C.mintText, lineHeight: 18 },
  // Money saved
  savedAmount: { fontSize: 32, fontWeight: "300", color: C.mintText, lineHeight: 36 },
  savedSub: { fontSize: 10, fontWeight: "300", color: C.mintText, marginTop: 6, opacity: 0.8 },
  // Streak
  streakNum: { fontSize: 32, fontWeight: "300", color: C.white, lineHeight: 36 },
  streakSub: { fontSize: 10, fontWeight: "300", color: "#666", marginTop: 6 },
  streakTrack: { height: 4, backgroundColor: "#333", borderRadius: 100, overflow: "hidden", marginTop: 8 },
  streakFill: { height: "100%", backgroundColor: C.mintText, borderRadius: 100 },
  // Split card
  splitRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 16 },
  splitSub: { fontSize: 11, fontWeight: "300", color: C.mid },
  splitPct: { fontSize: 28, fontWeight: "300" },
  splitBarContainer: { height: 4, backgroundColor: C.light, borderRadius: 100, overflow: "hidden", marginHorizontal: 16, marginTop: 10 },
  splitBarFill: { height: "100%", borderRadius: 100 },
  splitDivider: { height: 0.5, backgroundColor: C.light, marginHorizontal: 16, marginVertical: 4 },
  // Podium
  podiumRow: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  podiumCol: { flex: 1, alignItems: "center" },
  podiumThumb: {
    width: "100%", borderTopLeftRadius: 10, borderTopRightRadius: 10,
    overflow: "hidden", position: "relative",
  },
  podiumBadge: {
    position: "absolute", top: 6, left: "50%", marginLeft: -16,
    backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 100,
  },
  podiumBadgeText: { fontSize: 9, fontWeight: "400", color: "#fff" },
  podiumStar: {
    position: "absolute", bottom: 8, left: "50%", marginLeft: -20,
    backgroundColor: C.mint, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 100,
  },
  podiumInfo: {
    backgroundColor: C.light, paddingVertical: 8, paddingHorizontal: 4,
    borderBottomLeftRadius: 10, borderBottomRightRadius: 10, width: "100%", alignItems: "center",
  },
  podiumName: { fontSize: 10, fontWeight: "400", color: C.black, lineHeight: 13 },
  podiumRank: { fontSize: 8, fontWeight: "300", color: C.mid, marginTop: 2 },
});
