import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, TextInput, Image, ScrollView,
  Alert, ActivityIndicator, StyleSheet, FlatList,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Audio } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../lib/supabase";
import * as FileSystem from "expo-file-system/legacy";

// ── Colors ────────────────────────────────────────────────────
const C = {
  black: "#1a1a1a", white: "#ffffff", warmWhite: "#faf9f7",
  brown: "#8b7d6b", mid: "#999", light: "#e8e4df",
  mint: "#d6ede6", mintDeep: "#a8d5c5", mintText: "#2a6b55",
  offBg: "#f0e8e8", offBorder: "#dcc", offText: "#5c3a3a",
  error: "#c0392b",
};

// ── Types ─────────────────────────────────────────────────────
type FeelType = "amazing" | "good" | "ok" | "off" | "totally_off" | null;
type WeatherType = "warm" | "cool" | "rainy" | "cold" | null;
type MicState = "idle" | "recording" | "complete";

const OCCASIONS = ["Casual", "Work", "Date", "Event", "Travel", "Dinner", "Active", "Social"];
const FEELS: { id: NonNullable<FeelType>; symbol: string; label: string }[] = [
  { id: "amazing",    symbol: "★", label: "Amazing" },
  { id: "good",       symbol: "✦", label: "Good" },
  { id: "ok",         symbol: "—", label: "Ok" },
  { id: "off",        symbol: "○", label: "Off" },
  { id: "totally_off", symbol: "✕", label: "Totally off" },
];

const WEATHERS: { id: NonNullable<WeatherType>; emoji: string; label: string }[] = [
  { id: "warm",  emoji: "☀️",  label: "Warm" },
  { id: "cool",  emoji: "🌥",  label: "Cool" },
  { id: "rainy", emoji: "🌧",  label: "Rainy" },
  { id: "cold",  emoji: "❄️",  label: "Cold" },
];

// ── Feel style helper ─────────────────────────────────────────
function feelColors(id: NonNullable<FeelType>, selected: boolean) {
  if (!selected) return { bg: C.white, border: C.light, color: C.brown };
  if (id === "amazing") return { bg: "#e8f5e9", border: "#81c784", color: "#2e7d32" };
  if (id === "good") return { bg: C.mint, border: C.mintDeep, color: C.mintText };
  if (id === "ok") return { bg: C.light, border: C.mid, color: "#666" };
  if (id === "off") return { bg: "#fff3e0", border: "#ffb74d", color: "#e65100" };
  return { bg: "#f0e8e8", border: "#dcc", color: "#5c3a3a" };
}

// ═══════════════════════════════════════════════════════════════
// LOG SCREEN
// ═══════════════════════════════════════════════════════════════
export default function LogScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<"voice" | "type">("voice");
  const [micState, setMicState] = useState<MicState>("idle");
  const [transcript, setTranscript] = useState("");
  const [feel, setFeel] = useState<FeelType>(null);
  const [occasions, setOccasions] = useState<string[]>([]);
  const [bodyContext, setBodyContext] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const saveDisabled = transcript === "" || feel === null || photo === null || isSaving;
  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

// Reset form when tab is focused
useFocusEffect(
  React.useCallback(() => {
    setMode("voice");
    setMicState("idle");
    setTranscript("");
    setFeel(null);
    setOccasions([]);
    setBodyContext("");
    setPhoto(null);
    setIsSaving(false);
  }, [])
);

  // ── Voice Recording ─────────────────────────────────────────
  async function handleMicPress() {
    if (micState === "idle") {
      try {
        const permission = await Audio.requestPermissionsAsync();
        if (!permission.granted) {
          Alert.alert("Permission needed", "Please enable microphone access in Settings.");
          return;
        }
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        recordingRef.current = recording;
        setMicState("recording");
      } catch (err) {
        Alert.alert("Error", "Could not start recording.");
      }
    } else if (micState === "recording") {
      try {
        const recording = recordingRef.current;
        if (!recording) return;
        await recording.stopAndUnloadAsync();
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
        const uri = recording.getURI();
        recordingRef.current = null;

        if (!uri) { setMicState("idle"); return; }

        setTranscript("Transcribing...");

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { Alert.alert("Error", "Not signed in."); setMicState("idle"); setTranscript(""); return; }

        // Upload audio
        const fileName = `${session.user.id}/${Date.now()}.m4a`;
        const response = await fetch(uri);
        const blob = await response.blob();
        const arrayBuffer = await new Response(blob).arrayBuffer();

        const { error: uploadError } = await supabase.storage
          .from("voice-notes")
          .upload(fileName, arrayBuffer, { contentType: "audio/m4a" });

        if (uploadError) {
          Alert.alert("Upload failed", uploadError.message);
          setMicState("idle"); setTranscript(""); return;
        }

        // Call transcribe Edge Function
        const { data, error } = await supabase.functions.invoke("transcribe-voice", {
          body: { voice_note_path: fileName },
        });

        if (error) {
          Alert.alert("Transcription failed", error.message);
          setMicState("idle"); setTranscript(""); return;
        }

        setTranscript(data?.transcript || "");
        setMicState("complete");
      } catch (err) {
        Alert.alert("Error", "Recording failed.");
        setMicState("idle"); setTranscript("");
      }
    }
  }

  // ── Photo Picker ────────────────────────────────────────────
  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.7,
      exif: false,
    });
    if (!result.canceled) {
      // expo-image-picker on iOS may return HEIC — we need to check
      const uri = result.assets[0].uri;
      setPhoto(uri);
    }
  }

  // ═══════════════════════════════════════════════════════════════
// UPDATED handleSave for app/(tabs)/log.tsx
// 
// Replace the existing handleSave function with this version.
// This uploads the outfit photo, saves the log with photo_url,
// then triggers AI analysis in the background.
// ═══════════════════════════════════════════════════════════════

async function handleSave() {
  if (saveDisabled) return;
  setIsSaving(true);

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { Alert.alert("Error", "Not signed in."); setIsSaving(false); return; }

  const userId = session.user.id;
  const feelMap: Record<string, number> = { amazing: 5, good: 4, ok: 3, off: 2, totally_off: 1 };
  const overallFeel = feel ? feelMap[feel] : null;
  const todayDate = new Date().toISOString().split("T")[0];

// ── Step 1: Upload outfit photo (always as JPEG) ─────────────
let photoUrl: string | null = null;

if (photo) {
  try {
    const fileName = `${userId}/${Date.now()}.jpg`;

    // Read file as base64 using expo-file-system
    const base64 = await FileSystem.readAsStringAsync(photo, {
      encoding: "base64",
    });

    // Decode base64 to Uint8Array
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const { error: uploadError } = await supabase.storage
      .from("outfit-photos")
      .upload(fileName, bytes.buffer, { contentType: "image/jpeg" });

    if (uploadError) {
      console.error("Photo upload failed:", uploadError.message);
    } else {
      const { data: urlData } = supabase.storage
        .from("outfit-photos")
        .getPublicUrl(fileName);
      photoUrl = urlData.publicUrl;
    }
  } catch (err) {
    console.error("Photo upload error:", err);
  }
}

  // ── Step 2: Save outfit log ──────────────────────────────────
  const { data: outfitLog, error: logError } = await supabase
    .from("outfit_logs")
    .insert({
      user_id: userId,
      worn_date: todayDate,
      overall_feel: overallFeel,
      sentiment_tags: occasions.slice(1),
      occasion: occasions[0] || null,
      weather: null,
      notes: transcript,
      items: [],
      photo_url: photoUrl,
    })
    .select()
    .single();

  if (logError) {
    Alert.alert("Save failed", logError.message);
    setIsSaving(false);
    return;
  }

  // ── Step 3: Insert manual wear_logs (for manually selected items) ──

  // ── Step 4: Trigger AI outfit analysis (background) ──────────
  // This runs after navigation so the user isn't waiting
  if (photoUrl) {
    supabase.functions.invoke("analyze-outfit", {
      body: {
        photo_url: photoUrl,
        outfit_log_id: outfitLog.id,
        user_id: userId,
      },
    }).then(({ data, error }) => {
      if (error) {
        console.error("Outfit analysis failed:", error.message);
      } else {
        console.log("Outfit analysis complete:", JSON.stringify(data));
        // Trigger cropping for newly created items with bounding boxes
        if (data?.items_needing_crop?.length > 0) {
          for (const itemId of data.items_needing_crop) {
            supabase.functions.invoke("crop-item-image", {
              body: { item_id: itemId },
            }).then(({ data: cropData, error: cropErr }) => {
              if (cropErr) console.error(`Crop failed for ${itemId}:`, cropErr.message);
              else console.log(`Crop complete for ${itemId}:`, cropData?.cropped_photo_url);
            }).catch(err => console.error(`Crop error for ${itemId}:`, err));
          }
        }
      }
    }).catch(err => {
      console.error("Outfit analysis error:", err);
    });
  }

  // ── Step 5: Navigate to confirmation ─────────────────────────
  setIsSaving(false);
  router.push({
    pathname: "/(tabs)/log-confirmation",
    params: {
      wore: transcript,
      feel: feel || "",
      occasion: occasions[0] || "",
      weather: "",
      date: todayLabel,
      outfit_log_id: outfitLog.id,
      has_photo: photo ? "true" : "false",
    },
  });
}
  
function toggleOccasion(occ: string) {
  setOccasions(prev => prev.includes(occ) ? prev.filter(o => o !== occ) : [...prev, occ]);
}

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>LOG OUTFIT</Text>
        <Text style={s.headerDate}>{todayLabel}</Text>
      </View>

      {/* Mode toggle */}
      <View style={s.toggleRow}>
        {(["voice", "type"] as const).map(m => {
          const active = mode === m;
          return (
            <TouchableOpacity key={m} onPress={() => setMode(m)}
              style={[s.toggleBtn, active && s.toggleBtnActive]}>
              <Text style={[s.toggleText, active && s.toggleTextActive]}>
                {m === "voice" ? "🎙 Voice" : "✏️ Type"}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Scrollable content */}
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── Voice or Type panel ── */}
        {mode === "voice" ? (
          <View style={s.section}>
            {micState === "idle" && (
              <Text style={s.hintText}>Describe what you wore today, including brand and item, and tell us how you felt in it.</Text>
            )}

            {micState !== "complete" && (
              <View style={{ alignItems: "center", marginBottom: 16 }}>
                <TouchableOpacity onPress={handleMicPress} style={s.micOuter}
                  activeOpacity={0.7}>
                  <View style={[s.micInner, micState === "recording" && { backgroundColor: C.mintText }]}>
                    <Text style={{ color: C.white, fontSize: 28 }}>
                      {micState === "idle" ? "🎙" : "⏹"}
                    </Text>
                  </View>
                </TouchableOpacity>
                <Text style={s.micLabel}>
                  {micState === "idle" ? "TAP TO SPEAK" : "Listening…"}
                </Text>
              </View>
            )}

            {micState === "complete" && (
              <View style={{ marginBottom: 20 }}>
                <Text style={s.fieldLabel}>TRANSCRIBED</Text>
                <View style={s.transcriptBox}>
                  <TextInput value={transcript} onChangeText={setTranscript}
                    multiline style={s.transcriptInput} />
                </View>
                <TouchableOpacity onPress={() => { setMicState("idle"); setTranscript(""); }}>
                  <Text style={s.reRecord}>↻ Re-record</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Divider */}
            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>DETAILS</Text>
              <View style={s.dividerLine} />
            </View>
          </View>
        ) : (
          <View style={s.section}>
            <TextInput value={transcript} onChangeText={setTranscript}
              placeholder="e.g. Black trousers, white silk blouse, loafers…"
              placeholderTextColor="#bbb" multiline numberOfLines={4}
              style={s.typeInput} />
            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>DETAILS</Text>
              <View style={s.dividerLine} />
            </View>
          </View>
        )}

    {/* ── Feel Selector ── */}
    <View style={s.section}>
          <Text style={s.fieldLabel}>HOW DID YOU FEEL IN IT?</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {FEELS.map(({ id, symbol, label }) => {
              const selected = feel === id;
              const fc = feelColors(id, selected);
              return (
                <TouchableOpacity key={id} onPress={() => setFeel(selected ? null : id)}
                  style={[s.feelCard, { backgroundColor: fc.bg, borderColor: fc.border }]}>
                  <Text style={{ fontSize: 16, marginBottom: 2, color: fc.color }}>{symbol}</Text>
                  <Text style={[s.feelLabel, { color: fc.color }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Photo Upload ── */}
        <View style={s.section}>
          <Text style={s.fieldLabel}>PHOTO</Text>
          <TouchableOpacity onPress={pickPhoto} style={s.photoPicker}>
            {photo ? (
              <Image source={{ uri: photo }} style={{ width: "100%", height: "100%", borderRadius: 12 }} resizeMode="cover" />
            ) : (
              <Text style={{ fontSize: 11, color: C.brown }}>Tap to add photo</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Items Worn (text input) DELETED ── */}
     

        {/* ── Occasion Chips ── */}
        <View style={s.section}>
          <Text style={s.fieldLabel}>OCCASION</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {OCCASIONS.map(occ => {
              const selected = occasions.includes(occ);
              return (
                <TouchableOpacity key={occ} onPress={() => toggleOccasion(occ)}
                  style={[s.chip, selected && s.chipActive]}>
                  <Text style={[s.chipText, selected && s.chipTextActive]}>{occ}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Weather Chips ── Deleted */}

        {/* ── Body Context (simplified — text only for now) ── */}
        <View style={s.section}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <Text style={s.fieldLabel}>ANYTHING GOING ON WITH YOUR BODY?</Text>
            <Text style={{ fontSize: 9, fontWeight: "300", color: C.brown }}>— optional</Text>
          </View>
          <Text style={{ fontSize: 10, fontWeight: "300", color: C.brown, lineHeight: 16, marginBottom: 12 }}>
            Your cycle, fertility treatment, postpartum — anything that affects how clothes fit or feel.
          </Text>
          <TextInput value={bodyContext} onChangeText={setBodyContext}
            placeholder="Tap to add context…" placeholderTextColor="#bbb"
            multiline style={s.bodyInput} />
        </View>

        {/* ── Save Button ── */}
        <View style={s.section}>
          <TouchableOpacity onPress={handleSave} disabled={saveDisabled}
            style={[s.saveBtn, { opacity: saveDisabled ? 0.35 : 1 }]}>
            <Text style={s.saveBtnText}>{isSaving ? "SAVING..." : "SAVE THIS LOG"}</Text>
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
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.light,
    backgroundColor: C.warmWhite,
  },
  headerTitle: { fontSize: 13, fontWeight: "300", letterSpacing: 1.5, color: C.black },
  headerDate: { fontSize: 11, fontWeight: "300", letterSpacing: 1, color: C.brown, textTransform: "uppercase" },
  toggleRow: {
    flexDirection: "row", marginHorizontal: 20, marginVertical: 14,
    backgroundColor: C.light, borderRadius: 100, padding: 4,
  },
  toggleBtn: {
    flex: 1, height: 40, borderRadius: 100, alignItems: "center", justifyContent: "center",
  },
  toggleBtnActive: { backgroundColor: C.black },
  toggleText: { fontSize: 11, fontWeight: "300", letterSpacing: 1.2, textTransform: "uppercase", color: C.brown },
  toggleTextActive: { color: C.white },
  section: { paddingHorizontal: 20, marginBottom: 24 },
  fieldLabel: {
    fontSize: 9, fontWeight: "400", letterSpacing: 2, textTransform: "uppercase",
    color: C.brown, marginBottom: 8,
  },
  hintText: {
    fontSize: 15, fontStyle: "italic", fontWeight: "300", color: C.brown,
    textAlign: "center", lineHeight: 23, marginBottom: 12,
  },
  micOuter: {
    width: 120, height: 120, borderRadius: 60, borderWidth: 1, borderColor: C.light,
    alignItems: "center", justifyContent: "center",
  },
  micInner: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: C.black,
    alignItems: "center", justifyContent: "center",
  },
  micLabel: {
    fontSize: 10, fontWeight: "300", letterSpacing: 1.5, textTransform: "uppercase",
    color: C.brown, marginTop: 12,
  },
  transcriptBox: {
    backgroundColor: C.mint, borderWidth: 1, borderColor: C.mintDeep,
    borderRadius: 12, padding: 14,
  },
  transcriptInput: {
    fontSize: 16, fontStyle: "italic", fontWeight: "300", color: C.black,
    lineHeight: 24, minHeight: 60,
  },
  reRecord: { fontSize: 10, fontWeight: "300", letterSpacing: 1, color: C.brown, marginTop: 8 },
  divider: {
    flexDirection: "row", alignItems: "center", marginTop: 20,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.light },
  dividerText: {
    fontSize: 9, fontWeight: "300", letterSpacing: 2, color: C.brown,
    paddingHorizontal: 12, textTransform: "uppercase",
  },
  typeInput: {
    backgroundColor: C.warmWhite, borderWidth: 1, borderColor: C.light, borderRadius: 12,
    padding: 14, fontSize: 15, fontWeight: "300", color: C.black, lineHeight: 22, minHeight: 100,
    textAlignVertical: "top",
  },
  photoPicker: {
    width: "100%", height: 280, borderWidth: 1.5, borderStyle: "dashed", borderColor: C.light,
    borderRadius: 12, alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  chip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100,
    borderWidth: 1, borderColor: C.light, backgroundColor: C.white,
  },
  chipActive: { backgroundColor: C.black, borderColor: C.black },
  chipText: { fontSize: 11, fontWeight: "300", letterSpacing: 0.8, color: C.brown },
  chipTextActive: { color: C.white },
  showMore: { fontSize: 11, fontWeight: "400", color: C.brown, textDecorationLine: "underline", marginTop: 6 },
  feelCard: {
    flex: 1, borderRadius: 12, padding: 14, alignItems: "center", gap: 4, borderWidth: 1,
  },
  feelLabel: { fontSize: 10, fontWeight: "300", letterSpacing: 1, textTransform: "uppercase" },
  weatherChip: {
    flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 100, borderWidth: 1, borderColor: C.light, backgroundColor: C.white,
  },
  weatherChipActive: { backgroundColor: C.mint, borderColor: C.mintDeep },
  weatherText: { fontSize: 11, fontWeight: "300", letterSpacing: 0.8, color: C.brown },
  weatherTextActive: { color: C.mintText },
  bodyInput: {
    backgroundColor: C.warmWhite, borderWidth: 1, borderColor: C.light, borderRadius: 12,
    padding: 13, fontSize: 13, fontWeight: "300", color: C.black, minHeight: 50,
    textAlignVertical: "top",
  },
  saveBtn: {
    width: "100%", borderRadius: 100, paddingVertical: 18,
    backgroundColor: C.black, alignItems: "center",
  },
  saveBtnText: { color: C.white, fontSize: 12, fontWeight: "400", letterSpacing: 2, textTransform: "uppercase" },
});