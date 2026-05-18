import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Animated, Image, Modal,
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

interface ClosetItem { name: string; sub: string; wornCount: number; bgColor: string; photo_url?: string }

interface OutfitSnapshot {
  id: string;
  photo_url: string | null;
  overall_feel: number | null;
  formality: string | null;
  style_note: string | null;
  style_cohesion: number | null;
  color_harmony: number | null;
  outfit_tags: string[] | null;
  worn_date: string;
  occasion: string | null;
}

interface InsightsData {
  logCount: number;
  narrative: string;
  mostWorn: ClosetItem;
  leastWorn: ClosetItem;
  outfits: OutfitSnapshot[];
  avgCohesion: number | null;
  avgHarmony: number | null;
  formalityBreakdown: { label: string; count: number }[];
  topTags: { tag: string; count: number }[];
  bestOutfit: OutfitSnapshot | null;
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

// ── Helpers ───────────────────────────────────────────────────
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

function ScoreRing({ score, label }: { score: number; label: string }) {
  const color = score >= 4 ? C.mintText : score >= 3 ? C.brown : "#b45309";
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <View style={[s.scoreRing, { borderColor: color }]}>
        <Text style={[s.scoreValue, { color }]}>{score.toFixed(1)}</Text>
      </View>
      <Text style={s.scoreLabel}>{label}</Text>
    </View>
  );
}

function feelLabel(feel: number | null): string {
  if (!feel) return "—";
  if (feel >= 4) return "Good";
  if (feel >= 3) return "Ok";
  return "Off";
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
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

// ── Tag Outfit Gallery Modal ──────────────────────────────────
function TagGalleryModal({
  visible, tag, outfits, onClose,
}: {
  visible: boolean; tag: string; outfits: OutfitSnapshot[]; onClose: () => void;
}) {
  const tagged = outfits.filter(o => o.outfit_tags?.includes(tag));

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.modalOverlay}>
        <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={s.modalContent}>
          <View style={s.modalHandle} />
          <Text style={s.modalTitle}>"{tag}" outfits</Text>
          <Text style={s.modalCount}>{tagged.length} outfit{tagged.length !== 1 ? "s" : ""}</Text>

          <ScrollView
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            {tagged.length === 0 ? (
              <Text style={{ fontSize: 13, color: C.mid, textAlign: "center", padding: 32 }}>
                No outfits found with this tag.
              </Text>
            ) : (
              <View style={s.galleryGrid}>
                {tagged.map((outfit) => (
                  <View key={outfit.id} style={s.galleryCard}>
                    {outfit.photo_url ? (
                      <Image source={{ uri: outfit.photo_url }} style={s.galleryPhoto} resizeMode="cover" />
                    ) : (
                      <View style={[s.galleryPhoto, { backgroundColor: C.light, alignItems: "center", justifyContent: "center" }]}>
                        <Text style={{ fontSize: 24 }}>👔</Text>
                      </View>
                    )}
                    <View style={s.galleryInfo}>
                      <Text style={s.galleryDate}>{formatDate(outfit.worn_date)}</Text>
                      <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                        {outfit.formality && (
                          <View style={[s.miniPill, { backgroundColor: C.warmWhite }]}>
                            <Text style={[s.miniPillText, { color: C.brown }]}>{outfit.formality}</Text>
                          </View>
                        )}
                        <View style={[s.miniPill, { backgroundColor: C.mint }]}>
                          <Text style={[s.miniPillText, { color: C.mintText }]}>
                            {feelLabel(outfit.overall_feel)}
                          </Text>
                        </View>
                      </View>
                      {outfit.style_note && (
                        <Text style={s.galleryNote} numberOfLines={2}>{outfit.style_note}</Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════
// INSIGHTS SCREEN
// ═══════════════════════════════════════════════════════════════
export default function InsightsScreen() {
  const [range, setRange] = useState<Range>("90d");
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<InsightsData | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

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

    // ── Outfit logs with outfit-level data ──
    const { data: outfitRows, count: outfitCount } = await supabase
      .from("outfit_logs")
      .select("id, photo_url, overall_feel, formality, style_note, style_cohesion, color_harmony, outfit_tags, worn_date, occasion", { count: "exact" })
      .eq("user_id", userId)
      .gte("worn_date", rangeStartStr)
      .order("worn_date", { ascending: false });

    const outfits: OutfitSnapshot[] = (outfitRows || []).map(r => ({
      ...r,
      outfit_tags: r.outfit_tags || null,
    }));

    // ── Closet items ──
    const { data: items } = await supabase
      .from("closet_items")
      .select("id, name, category, wear_count, avg_feel, last_worn, photo_url")
      .eq("user_id", userId)
      .eq("status", "active");

    const allItems = items || [];

    // ── Most & least worn ──
    const sorted = [...allItems].sort((a, b) => (b.wear_count || 0) - (a.wear_count || 0));
    const mostWorn = sorted[0]
      ? { name: sorted[0].name, sub: sorted[0].avg_feel ? `avg feel ${sorted[0].avg_feel}/5` : "no feel data yet", wornCount: sorted[0].wear_count || 0, bgColor: "#2a2a2a", photo_url: sorted[0].photo_url || undefined }
      : { name: "No items yet", sub: "", wornCount: 0, bgColor: "#e8e0d4" };
    const leastWorn = sorted.length > 0
      ? { name: sorted[sorted.length - 1].name, sub: sorted[sorted.length - 1].wear_count === 0 ? "never worn" : `worn ${sorted[sorted.length - 1].wear_count} time(s)`, wornCount: sorted[sorted.length - 1].wear_count || 0, bgColor: "#e8e0d4", photo_url: sorted[sorted.length - 1].photo_url || undefined }
      : { name: "No items yet", sub: "", wornCount: 0, bgColor: "#e8e0d4" };

    // ── Outfit-level aggregations ──
    const withCohesion = outfits.filter(o => o.style_cohesion != null);
    const withHarmony = outfits.filter(o => o.color_harmony != null);
    const avgCohesion = withCohesion.length > 0
      ? withCohesion.reduce((sum, o) => sum + o.style_cohesion!, 0) / withCohesion.length
      : null;
    const avgHarmony = withHarmony.length > 0
      ? withHarmony.reduce((sum, o) => sum + o.color_harmony!, 0) / withHarmony.length
      : null;

    // Formality breakdown
    const formalityMap: Record<string, number> = {};
    for (const o of outfits) {
      if (o.formality) {
        formalityMap[o.formality] = (formalityMap[o.formality] || 0) + 1;
      }
    }
    const formalityBreakdown = Object.entries(formalityMap)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    // Top tags
    const tagMap: Record<string, number> = {};
    for (const o of outfits) {
      if (o.outfit_tags) {
        for (const tag of o.outfit_tags) {
          tagMap[tag] = (tagMap[tag] || 0) + 1;
        }
      }
    }
    const topTags = Object.entries(tagMap)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // Best outfit (highest feel + cohesion + harmony)
    const scoredOutfits = outfits
      .filter(o => o.overall_feel != null && o.style_cohesion != null)
      .map(o => ({ ...o, score: (o.overall_feel || 0) + (o.style_cohesion || 0) + (o.color_harmony || 0) }))
      .sort((a, b) => b.score - a.score);
    const bestOutfit = scoredOutfits[0] || null;

    // ── AI narrative (10+ outfits) ──
    let narrative = "Keep logging — patterns start to emerge after about 10 outfits.";
    if ((outfitCount || 0) >= 10) {
      try {
        const { data: aiData, error: aiError } = await supabase.functions.invoke("ai-generate", {
          body: { context_type: "insights_narrative" },
        });
        if (!aiError && aiData?.text) narrative = aiData.text;
      } catch {}
    }

    setData({
      logCount: outfitCount || 0, narrative, mostWorn, leastWorn,
      outfits, avgCohesion, avgHarmony, formalityBreakdown, topTags, bestOutfit,
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

          {/* ── Best Outfit (unlocks at 3) ── */}
          {logCount >= 3 && data.bestOutfit && (
            <>
              <View style={{ paddingTop: 24, paddingBottom: 8 }}>
                <SectionHeader>YOUR BEST OUTFIT</SectionHeader>
                <View style={s.bestOutfitCard}>
                  {data.bestOutfit.photo_url && (
                    <Image source={{ uri: data.bestOutfit.photo_url }} style={s.bestOutfitPhoto} resizeMode="cover" />
                  )}
                  <View style={s.bestOutfitInfo}>
                    <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                      <View style={[s.miniPill, { backgroundColor: C.mint }]}>
                        <Text style={[s.miniPillText, { color: C.mintText }]}>
                          Feel: {feelLabel(data.bestOutfit.overall_feel)}
                        </Text>
                      </View>
                      {data.bestOutfit.formality && (
                        <View style={[s.miniPill, { backgroundColor: C.warmWhite }]}>
                          <Text style={[s.miniPillText, { color: C.brown }]}>{data.bestOutfit.formality}</Text>
                        </View>
                      )}
                    </View>
                    {data.bestOutfit.style_note && (
                      <Text style={s.bestOutfitNote}>{data.bestOutfit.style_note}</Text>
                    )}
                    {data.bestOutfit.outfit_tags && data.bestOutfit.outfit_tags.length > 0 && (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                        {data.bestOutfit.outfit_tags.map(tag => (
                          <View key={tag} style={s.miniTag}>
                            <Text style={s.miniTagText}>{tag}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              </View>
              <Divider />
            </>
          )}

{/* ── Your Style Tags — clickable (unlocks at 3) ── */}
{logCount >= 3 && data.topTags.length > 0 && (
            <>
              <View style={{ paddingTop: 24, paddingBottom: 8 }}>
                <SectionHeader>YOUR STYLE TAGS</SectionHeader>
                <Text style={s.tagHint}>Tap a tag to see those outfits</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 28 }}>
                  {data.topTags.map(({ tag, count }) => (
                    <TouchableOpacity
                      key={tag}
                      style={s.tagChip}
                      activeOpacity={0.7}
                      onPress={() => setSelectedTag(tag)}
                    >
                      <Text style={s.tagText}>{tag}</Text>
                      <Text style={s.tagCount}>×{count}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <Divider />
            </>
          )}

          {/* ── Formality Mix (unlocks at 5) ── */}
          {logCount >= 5 && data.formalityBreakdown.length > 0 && (
            <>
              <View style={{ paddingTop: 24, paddingBottom: 8 }}>
                <SectionHeader>FORMALITY MIX</SectionHeader>
                <View style={{ paddingHorizontal: 28, gap: 10 }}>
                  {data.formalityBreakdown.map(({ label, count }) => {
                    const pct = Math.round((count / logCount) * 100);
                    return (
                      <View key={label}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                          <Text style={s.catName}>{label}</Text>
                          <Text style={s.catRate}>{pct}%</Text>
                        </View>
                        <AnimBar rate={pct} />
                        <Text style={s.catSub}>{count} outfit{count !== 1 ? "s" : ""}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
              <Divider />
            </>
          )}

          {/* ── Outfit Style Scores (unlocks at 3) — below Best Outfit ── */}
          {logCount >= 3 && data.avgCohesion != null && data.avgHarmony != null && (
            <>
              <View style={{ paddingTop: 24, paddingBottom: 8 }}>
                <SectionHeader>OUTFIT STYLE SCORES</SectionHeader>
                <View style={{ flexDirection: "row", paddingHorizontal: 28, gap: 16 }}>
                  <ScoreRing score={data.avgCohesion} label="Cohesion" />
                  <ScoreRing score={data.avgHarmony} label="Color harmony" />
                </View>
              </View>
              <Divider />
            </>
          )}

          {/* ── Most & Least Worn (unlocks at 3) ── */}
          {logCount >= 3 && (
            <View style={{ paddingTop: 24, paddingBottom: 8 }}>
              <SectionHeader>MOST & LEAST WORN</SectionHeader>
              <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 28 }}>
                <View style={{ flex: 1 }}><WornCard item={data.mostWorn} kind="most" /></View>
                <View style={{ flex: 1 }}><WornCard item={data.leastWorn} kind="least" /></View>
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

      {/* ── Tag Gallery Modal ── */}
      {data && (
        <TagGalleryModal
          visible={selectedTag != null}
          tag={selectedTag || ""}
          outfits={data.outfits}
          onClose={() => setSelectedTag(null)}
        />
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
  // Score rings
  scoreRing: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 3,
    alignItems: "center", justifyContent: "center", backgroundColor: C.warmWhite,
  },
  scoreValue: { fontSize: 22, fontWeight: "300" },
  scoreLabel: { fontSize: 9, fontWeight: "300", letterSpacing: 1, textTransform: "uppercase", color: C.brown, marginTop: 8 },
  // Tags
  tagHint: { fontSize: 11, fontWeight: "300", color: C.mid, paddingHorizontal: 28, marginBottom: 12, marginTop: -8 },
  tagChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 100,
    backgroundColor: C.mint,
  },
  tagText: { fontSize: 12, fontWeight: "400", color: C.mintText },
  tagCount: { fontSize: 10, fontWeight: "300", color: C.mintText, opacity: 0.7 },
  // Best outfit
  bestOutfitCard: {
    marginHorizontal: 28, borderWidth: 1, borderColor: C.mintDeep,
    borderRadius: 16, overflow: "hidden", backgroundColor: C.warmWhite,
  },
  bestOutfitPhoto: { width: "100%", height: 200 },
  bestOutfitInfo: { padding: 16 },
  bestOutfitNote: { fontSize: 13, fontWeight: "300", color: C.black, lineHeight: 20 },
  miniPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 },
  miniPillText: { fontSize: 10, fontWeight: "400", letterSpacing: 0.5 },
  miniTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100, backgroundColor: C.light },
  miniTagText: { fontSize: 9, fontWeight: "300", color: C.brown, letterSpacing: 0.5 },
  // Category (used by formality)
  catName: { fontSize: 13, fontWeight: "400", color: C.black },
  catRate: { fontSize: 13, fontWeight: "400", color: C.black },
  catSub: { fontSize: 10, fontWeight: "300", color: C.brown, letterSpacing: 0.3 },
  // Worn cards
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
  // Tag Gallery Modal
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  modalContent: {
    backgroundColor: C.white, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    maxHeight: "85%", paddingTop: 12, paddingBottom: 20,
  },
  modalHandle: {
    width: 36, height: 4, backgroundColor: C.mid, borderRadius: 2,
    alignSelf: "center", marginBottom: 16, opacity: 0.5,
  },
  modalTitle: { fontSize: 18, fontWeight: "300", color: C.black, paddingHorizontal: 24 },
  modalCount: { fontSize: 11, fontWeight: "300", color: C.mid, paddingHorizontal: 24, marginTop: 4, marginBottom: 20 },
  galleryGrid: { paddingHorizontal: 24, gap: 16 },
  galleryCard: {
    borderWidth: 1, borderColor: C.light, borderRadius: 16, overflow: "hidden",
    backgroundColor: C.warmWhite,
  },
  galleryPhoto: { width: "100%", height: 220 },
  galleryInfo: { padding: 14 },
  galleryDate: { fontSize: 11, fontWeight: "400", letterSpacing: 0.8, color: C.brown, textTransform: "uppercase" },
  galleryNote: { fontSize: 12, fontWeight: "300", color: C.mid, lineHeight: 18, marginTop: 8 },
});
