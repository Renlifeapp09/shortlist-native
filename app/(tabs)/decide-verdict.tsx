import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Animated, Image, Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

// ── Colors ────────────────────────────────────────────────────
const C = {
  black: "#1a1a1a", white: "#ffffff", warmWhite: "#faf9f7",
  brown: "#8b7d6b", mid: "#999", light: "#e8e4df",
  mint: "#d6ede6", mintDeep: "#a8d5c5", mintText: "#2a6b55",
};

// ── Verdict color map ─────────────────────────────────────────
function verdictTheme(verdict: string) {
  if (verdict === "skip") return {
    bg: "#f5ede8", border: "#e8d5c8", eyebrow: "#8b5e3c", word: "#3d1f0a", label: "Skip it.",
  };
  if (verdict === "buy") return {
    bg: C.mint, border: C.mintDeep, eyebrow: C.mintText, word: C.mintText, label: "Buy it.",
  };
  // rent
  return {
    bg: "#eeeaf5", border: "#d4cce8", eyebrow: "#5c4d8a", word: "#2d1f5e", label: "Rent it.",
  };
}

// ── Decision button config ────────────────────────────────────
function getDecisionButtons(aiVerdict: string) {
  // Always show all three, but order them with the AI-recommended one first
  const buttons = [
    { key: "buy", label: "I'll buy it", icon: "💳" },
    { key: "rent", label: "I'll rent it", icon: "🔄" },
    { key: "skip", label: "I'll skip it", icon: "✕" },
  ];

  // Move AI-recommended option to the top
  const aiIndex = buttons.findIndex(b => b.key === aiVerdict);
  if (aiIndex > 0) {
    const [recommended] = buttons.splice(aiIndex, 1);
    buttons.unshift(recommended);
  }

  return buttons;
}

// ── Similar Item type ─────────────────────────────────────────
interface SimilarItem { id: string; name: string; wearCount?: number; feel?: string; photo_url?: string }

// ═══════════════════════════════════════════════════════════════
// DECIDE VERDICT SCREEN
// ═══════════════════════════════════════════════════════════════
export default function DecideVerdictScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    verdict: string; reason: string; confidence: string; confidenceSub: string;
    itemName: string; price: string; photo: string; similarItems: string;
  }>();

  const verdict = params.verdict || "skip";
  const reason = params.reason || "";
  const confidence = Number(params.confidence) || 70;
  const confidenceSub = params.confidenceSub || "";
  const itemName = params.itemName || "Unknown item";
  const price = Number(params.price) || 0;
  const photoUri = params.photo || null;
  const theme = verdictTheme(verdict);

  let similarItems: SimilarItem[] = [];
  try { similarItems = JSON.parse(params.similarItems || "[]"); } catch {}

  const [isSaving, setIsSaving] = useState(false);
  const decisionButtons = getDecisionButtons(verdict);

  // Animated confidence bar
  const barWidth = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(barWidth, {
      toValue: confidence, duration: 800, useNativeDriver: false,
    }).start();
  }, [confidence]);

  // ── Save decision and navigate ──
  async function handleDecision(userChoice: string) {
    setIsSaving(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert("Error", "Not signed in.");
        setIsSaving(false);
        return;
      }

      const agreedWithAi = userChoice === verdict;

      await supabase.from("purchase_decisions").insert({
        user_id: session.user.id,
        item_name: itemName,
        price: price,
        ai_verdict: verdict,
        user_decision: userChoice,
        agreed_with_ai: agreedWithAi,
        photo_url: photoUri,
      });

      console.log(`Decision saved: AI said "${verdict}", user chose "${userChoice}", agreed: ${agreedWithAi}`);
    } catch (err) {
      console.error("Failed to save decision:", err);
    }

    setIsSaving(false);
    router.replace("/(tabs)");
  }

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>YOUR VERDICT</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 220 }} showsVerticalScrollIndicator={false}>
        {/* Item Thumbnail */}
        <View style={[s.itemThumb, { marginHorizontal: 24, marginTop: 24 }]}>
          {photoUri && (
            <Image source={{ uri: photoUri }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover" />
          )}
          <View style={s.thumbOverlay}>
            <Text style={s.thumbName}>{itemName}</Text>
            <Text style={s.thumbPrice}>${price}</Text>
          </View>
        </View>

        {/* Verdict Card */}
        <View style={[s.verdictCard, { backgroundColor: theme.bg, borderColor: theme.border, marginHorizontal: 24, marginTop: 20 }]}>
          <Text style={[s.verdictEyebrow, { color: theme.eyebrow }]}>OUR RECOMMENDATION</Text>
          <Text style={[s.verdictWord, { color: theme.word }]}>{theme.label}</Text>
          <View style={[s.rule, { backgroundColor: theme.word }]} />
          <Text style={[s.verdictReason, { color: theme.word }]}>{reason}</Text>
        </View>

        {/* Confidence Bar */}
        <View style={s.confidenceSection}>
          <View style={s.confidenceRow}>
            <Text style={s.confidenceLabel}>CONFIDENCE</Text>
            <Text style={s.confidenceValue}>{confidence}%</Text>
          </View>
          <View style={s.barTrack}>
            <Animated.View style={[s.barFill, {
              width: barWidth.interpolate({
                inputRange: [0, 100],
                outputRange: ["0%", "100%"],
              }),
            }]} />
          </View>
          <Text style={s.confidenceSub}>{confidenceSub}</Text>
        </View>

        {/* Similar Items */}
        {similarItems.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <Text style={[s.sectionLabel, { paddingHorizontal: 24 }]}>ALREADY IN YOUR CLOSET</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 24, gap: 12 }}>
              {similarItems.map((item) => {
                const bgColors = ["#2d2d2b", "#b8afa6", "#d9d2c9"];
                const bg = bgColors[Number(item.id) % bgColors.length];
                return (
                  <View key={item.id} style={{ width: 110 }}>
                    <View style={[s.similarThumb, { backgroundColor: bg, overflow: "hidden" }]}>
                      {item.photo_url && (
                        <Image source={{ uri: item.photo_url }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                        )}
                      {item.wearCount !== undefined && (
                        <View style={s.wearBadge}>
                          <Text style={s.wearBadgeText}>worn {item.wearCount}×</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.similarName} numberOfLines={1}>{item.name}</Text>
                    {item.feel && <Text style={s.similarFeel}>{item.feel}</Text>}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* ── Decision Buttons ── */}
      <View style={s.actionRow}>
        <Text style={s.actionPrompt}>What do you think?</Text>

        {decisionButtons.map((btn, i) => {
          const isRecommended = btn.key === verdict;
          const isFirst = i === 0;

          return (
            <TouchableOpacity
              key={btn.key}
              onPress={() => handleDecision(btn.key)}
              disabled={isSaving}
              activeOpacity={0.7}
              style={[
                isFirst ? s.primaryBtn : s.secondaryBtn,
                isSaving && { opacity: 0.5 },
              ]}
            >
              <Text style={isFirst ? s.primaryBtnText : s.secondaryBtnText}>
                {btn.label.toUpperCase()}
                {isRecommended && !isFirst ? "  ← RECOMMENDED" : ""}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.white },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 24, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: C.light, backgroundColor: C.warmWhite,
  },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  backText: { fontSize: 11, fontWeight: "400", letterSpacing: 1, color: C.brown, textTransform: "uppercase" },
  headerTitle: { fontSize: 13, fontWeight: "300", letterSpacing: 1.5, color: C.black },
  itemThumb: {
    height: 220, borderRadius: 12, backgroundColor: C.warmWhite,
    overflow: "hidden", justifyContent: "flex-end", position: "relative",
  },
  thumbOverlay: {
    backgroundColor: "rgba(0,0,0,0.5)", borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
    paddingHorizontal: 14, paddingVertical: 8,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  thumbName: { fontSize: 14, fontStyle: "italic", color: "#fff" },
  thumbPrice: { fontSize: 14, color: "#fff" },
  verdictCard: { borderRadius: 20, padding: 24, borderWidth: 1 },
  verdictEyebrow: { fontSize: 9, fontWeight: "400", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 },
  verdictWord: { fontSize: 36, fontWeight: "300", lineHeight: 40, marginBottom: 16 },
  rule: { height: 1, width: 40, marginBottom: 16, opacity: 0.3 },
  verdictReason: { fontSize: 14, fontWeight: "400", lineHeight: 24 },
  confidenceSection: { paddingHorizontal: 24, paddingVertical: 20 },
  confidenceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  confidenceLabel: { fontSize: 9, fontWeight: "400", letterSpacing: 2, textTransform: "uppercase", color: C.brown },
  confidenceValue: { fontSize: 14, fontWeight: "400", color: C.black },
  barTrack: { height: 6, backgroundColor: C.light, borderRadius: 100, overflow: "hidden", marginBottom: 8 },
  barFill: { height: "100%", backgroundColor: C.black, borderRadius: 100 },
  confidenceSub: { fontSize: 11, fontWeight: "300", lineHeight: 16, color: C.brown },
  sectionLabel: { fontSize: 9, fontWeight: "400", letterSpacing: 2, textTransform: "uppercase", color: C.brown, marginBottom: 12 },
  similarThumb: { width: 110, height: 130, borderRadius: 12, overflow: "hidden" },
  wearBadge: {
    position: "absolute", top: 8, left: 8, backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 100,
  },
  wearBadgeText: { fontSize: 8, fontWeight: "400", color: "#fff" },
  similarName: { fontSize: 12, fontWeight: "400", color: C.black, marginTop: 8 },
  similarFeel: { fontSize: 10, fontWeight: "300", color: C.brown, marginTop: 2 },
  // Action row
  actionRow: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.light,
    paddingHorizontal: 24, paddingTop: 14, paddingBottom: 34, gap: 10,
  },
  actionPrompt: {
    fontSize: 13, fontWeight: "400", color: C.black, textAlign: "center", marginBottom: 4,
  },
  primaryBtn: {
    width: "100%", borderRadius: 100, paddingVertical: 16,
    backgroundColor: C.black, alignItems: "center",
  },
  primaryBtnText: { color: C.white, fontSize: 11, fontWeight: "400", letterSpacing: 1.5 },
  secondaryBtn: {
    width: "100%", borderRadius: 100, paddingVertical: 13,
    borderWidth: 1, borderColor: C.light, alignItems: "center",
  },
  secondaryBtnText: { color: C.brown, fontSize: 10, fontWeight: "300", letterSpacing: 1.2 },
});
