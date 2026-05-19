import React, { useState } from "react";
import {
  View, Text, TouchableOpacity, TextInput, Image, ScrollView,
  Alert, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../lib/supabase";

// ── Colors ────────────────────────────────────────────────────
const C = {
  black: "#1a1a1a", white: "#ffffff", warmWhite: "#faf9f7",
  brown: "#8b7d6b", mid: "#999", light: "#e8e4df",
  mint: "#d6ede6", mintDeep: "#a8d5c5", mintText: "#2a6b55",
};

// ═══════════════════════════════════════════════════════════════
// DECIDE INPUT SCREEN
// ═══════════════════════════════════════════════════════════════
export default function DecideScreen() {
  const router = useRouter();
  const [photo, setPhoto] = useState<string | null>(null);
  const [itemName, setItemName] = useState("");
  const [price, setPrice] = useState("");
  const [context, setContext] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const isDisabled = itemName.trim() === "" || price === "" || isLoading;

  useFocusEffect(
    React.useCallback(() => {
      setPhoto(null);
      setItemName("");
      setPrice("");
      setContext("");
      setIsLoading(false);
    }, [])
  );

  // ── Photo Picker ────────────────────────────────────────────
  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.7,
    });
    if (!result.canceled) {
      setPhoto(result.assets[0].uri);
      // TODO: optionally run Gemini vision call to pre-identify item → setItemName(result)
    }
  }

  // ── Analyse ─────────────────────────────────────────────────
  async function handleAnalyse() {
    if (isDisabled) return;
    setIsLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      Alert.alert("Error", "Not signed in.");
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("ai-generate", {
        body: {
          context_type: "decide_verdict",
          decision_data: {
            item_name: itemName,
            item_category: context || "Unknown",
            item_price: Number(price) || 0,
          },
        },
      });

      setIsLoading(false);

      if (error || !data?.text) {
        Alert.alert("Analysis failed", error?.message || "No response from AI.");
        return;
      }

      // Parse JSON from AI response
      let verdict: any;
      try {
        const cleaned = data.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        verdict = JSON.parse(cleaned);
      } catch {
        verdict = {
          verdict: "skip",
          reasoning: data.text,
          similar_items: [],
          confidence: "low",
        };
      }

      // Save decision to database
      await supabase.from("decisions").insert({
        user_id: session.user.id,
        item_name: itemName,
        item_category: context || null,
        item_price: Number(price) || null,
        verdict: verdict.verdict,
        verdict_reasoning: verdict.reasoning,
        similar_owned_items: verdict.similar_items || [],
        user_action: "pending",
      });

      // Map confidence
      const confidenceMap: Record<string, number> = { high: 92, medium: 70, low: 45 };
      const confidenceNum = confidenceMap[verdict.confidence] || 70;

      // Map verdict string
      let mappedVerdict = verdict.verdict;
      if (mappedVerdict === "wear_what_you_have") mappedVerdict = "wear";
      else if (mappedVerdict === "rent_to_try") mappedVerdict = "rent";

      router.push({
        pathname: "/(tabs)/decide-verdict",
        params: {
          verdict: mappedVerdict,
          reason: verdict.reasoning || "",
          confidence: String(confidenceNum),
          confidenceSub: `Based on ${data.closet_count || 5} closet items and your wear history.`,
          itemName: itemName,
          price: price,
          photo: photo || "",
          similarItems: await (async () => {
            const names = verdict.similar_items || [];
            if (names.length === 0) return "[]";
            const { data: matchedItems } = await supabase
              .from("closet_items")
              .select("id, name, wear_count, avg_feel, photo_url, cropped_photo_url")
              .eq("user_id", session.user.id)
              .eq("status", "active")
              .in("name", names);
            return JSON.stringify(
              (matchedItems || []).map((item: any) => ({
                id: item.id,
                name: item.name,
                wearCount: item.wear_count || 0,
                feel: item.avg_feel ? (item.avg_feel >= 4 ? "Feels good" : item.avg_feel >= 3 ? "Feels ok" : "Feels off") : undefined,
                photo_url: item.cropped_photo_url || item.photo_url || null,
              }))
            );
          })(),
        },
      });
    } catch (err) {
      setIsLoading(false);
      Alert.alert("Error", "Something went wrong. Try again.");
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>SHOULD I BUY THIS?</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 100, gap: 20 }}
          showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Photo Upload Zone */}
          <TouchableOpacity onPress={pickPhoto} style={s.photoZone} activeOpacity={0.7}>
            {photo ? (
              <View style={{ width: "100%", height: "100%", position: "relative" }}>
                <Image source={{ uri: photo }} style={{ width: "100%", height: "100%", borderRadius: 16 }} resizeMode="cover" />
                <View style={s.photoOverlay}>
                  <Text style={s.photoOverlayName}>{itemName || "Uploaded item"}</Text>
                  <TouchableOpacity onPress={() => { setPhoto(null); setItemName(""); }}>
                    <Text style={s.photoOverlayChange}>Change</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                <Text style={{ fontSize: 24, color: C.mid }}>📷</Text>
                <Text style={s.photoLabel}>UPLOAD A PHOTO</Text>
                <Text style={s.photoSub}>screenshot, link, or camera roll</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Item Type */}
          <View>
            <Text style={s.fieldLabel}>BRAND & ITEM NAME</Text>
            <TextInput value={itemName} onChangeText={setItemName}
              placeholder="e.g. Navy blazer" placeholderTextColor="#bbb"
              style={s.textInput} />
          </View>

          {/* Price */}
          <View>
            <Text style={s.fieldLabel}>PRICE</Text>
            <View style={{ position: "relative" }}>
              <Text style={s.dollarSign}>$</Text>
              <TextInput value={price} onChangeText={setPrice}
                placeholder="0" placeholderTextColor="#bbb"
                keyboardType="numeric" style={[s.textInput, { paddingLeft: 28 }]} />
            </View>
          </View>

          {/* Context */}
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <Text style={s.fieldLabel}>ANY CONTEXT?</Text>
              <Text style={{ fontSize: 9, fontWeight: "300", color: C.brown }}>— optional</Text>
            </View>
            <TextInput value={context} onChangeText={setContext}
              placeholder="e.g. For an upcoming wedding…" placeholderTextColor="#bbb"
              multiline style={[s.textInput, { minHeight: 64, textAlignVertical: "top" }]} />
          </View>

          {/* Analyse Button */}
          <TouchableOpacity onPress={handleAnalyse} disabled={isDisabled}
            style={[s.analyseBtn, { opacity: isDisabled ? 0.35 : 1 }]}>
            {isLoading ? (
              <ActivityIndicator color={C.white} size="small" />
            ) : (
              <Text style={s.analyseBtnText}>ANALYSE THIS ITEM</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.white },
  header: {
    alignItems: "center", paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: C.light, backgroundColor: C.warmWhite,
  },
  headerTitle: { fontSize: 13, fontWeight: "300", letterSpacing: 1.5, color: C.black },
  photoZone: {
    width: "100%", height: 200, borderRadius: 16, overflow: "hidden",
    borderWidth: 1.5, borderStyle: "dashed", borderColor: C.light,
    backgroundColor: C.warmWhite, alignItems: "center", justifyContent: "center",
  },
  photoOverlay: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "rgba(0,0,0,0.4)", borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
    paddingHorizontal: 14, paddingVertical: 10,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  photoOverlayName: { fontSize: 13, fontStyle: "italic", color: "#fff" },
  photoOverlayChange: { fontSize: 10, letterSpacing: 0.8, color: "rgba(255,255,255,0.7)" },
  photoLabel: { fontSize: 12, fontWeight: "400", letterSpacing: 0.8, color: C.black, marginTop: 12 },
  photoSub: { fontSize: 10, fontWeight: "300", color: C.mid, marginTop: 4 },
  fieldLabel: {
    fontSize: 9, fontWeight: "400", letterSpacing: 2, textTransform: "uppercase",
    color: C.brown, marginBottom: 8,
  },
  textInput: {
    backgroundColor: C.warmWhite, borderWidth: 1, borderColor: C.light, borderRadius: 12,
    padding: 14, fontSize: 14, fontWeight: "300", color: C.black,
  },
  dollarSign: {
    position: "absolute", left: 14, top: 14, fontSize: 15, fontWeight: "300", color: C.brown, zIndex: 1,
  },
  analyseBtn: {
    width: "100%", borderRadius: 100, paddingVertical: 18,
    backgroundColor: C.black, alignItems: "center",
  },
  analyseBtnText: { color: C.white, fontSize: 12, fontWeight: "400", letterSpacing: 2 },
});
