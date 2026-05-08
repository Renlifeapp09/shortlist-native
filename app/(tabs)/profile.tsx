import React, { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, TextInput, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

// ── Colors ────────────────────────────────────────────────────
const C = {
  black: "#1a1a1a", white: "#ffffff", warmWhite: "#faf9f7",
  brown: "#8b7d6b", mid: "#999", light: "#e8e4df",
  mint: "#d6ede6", mintDeep: "#a8d5c5", mintText: "#2a6b55",
  error: "#c0392b",
};

// ── Settings Row ──────────────────────────────────────────────
function SettingsRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.settingsRow}>
      <Text style={s.settingsLabel}>{label}</Text>
      {children}
    </View>
  );
}

// ── Section Header ────────────────────────────────────────────
function SectionLabel({ label }: { label: string }) {
  return <Text style={s.sectionLabel}>{label}</Text>;
}

// ═══════════════════════════════════════════════════════════════
// PROFILE SCREEN
// ═══════════════════════════════════════════════════════════════
export default function ProfileScreen() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState("free");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: profile } = await supabase
        .from("users")
        .select("display_name, email, subscription_tier")
        .eq("id", session.user.id)
        .single();

      if (profile) {
        setDisplayName(profile.display_name || "");
        setEmail(profile.email || session.user.email || "");
        setTier(profile.subscription_tier || "free");
      }
      setIsLoading(false);
    };
    loadProfile();
  }, []);

  async function handleSaveName() {
    setIsSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    await supabase
      .from("users")
      .update({ display_name: displayName.trim() })
      .eq("id", session.user.id);

    setIsSaving(false);
    setIsEditing(false);
  }

  async function handleSignOut() {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          try {
            const { error } = await supabase.auth.signOut();
            if (error) {
              Alert.alert("Error", error.message);
            }
          } catch (err: any) {
            Alert.alert("Error", err.message || "Sign out failed");
          }
        },
      },
    ]);
  }

  if (isLoading) {
    return (
      <SafeAreaView style={[s.container, { alignItems: "center", justifyContent: "center" }]} edges={["top"]}>
        <ActivityIndicator color={C.mid} />
      </SafeAreaView>
    );
  }

  const initials = displayName
    ? displayName.slice(0, 2).toUpperCase()
    : email.slice(0, 2).toUpperCase();

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 28, paddingBottom: 100 }}>

        {/* Back */}
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backText}>← BACK</Text>
        </TouchableOpacity>

        {/* Avatar + Name */}
        <View style={s.avatarRow}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <View>
            <Text style={s.nameText}>{displayName || "Set your name"}</Text>
            <Text style={s.tierText}>
              {tier === "pro" ? "Pro — Beta" : "Free plan"}
            </Text>
          </View>
        </View>

        {/* ── Account ── */}
        <SectionLabel label="ACCOUNT" />

        <SettingsRow label="Display name">
          {isEditing ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                style={s.nameInput}
                autoFocus
              />
              <TouchableOpacity onPress={handleSaveName}>
                <Text style={s.linkBtn}>{isSaving ? "Saving..." : "Save"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setIsEditing(false)}>
                <Text style={s.linkBtn}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={s.valueText}>{displayName || "Not set"}</Text>
              <TouchableOpacity onPress={() => setIsEditing(true)}>
                <Text style={s.linkBtn}>Edit</Text>
              </TouchableOpacity>
            </View>
          )}
        </SettingsRow>

        <SettingsRow label="Email">
          <Text style={s.valueText}>{email}</Text>
        </SettingsRow>

        {/* ── Subscription ── */}
        <SectionLabel label="SUBSCRIPTION" />

        <SettingsRow label="Current plan">
          <View style={[s.planBadge, {
            backgroundColor: tier === "pro" ? C.mint : C.light,
          }]}>
            <Text style={[s.planBadgeText, {
              color: tier === "pro" ? C.mintText : C.brown,
            }]}>
              {tier === "pro" ? "PRO — BETA" : "FREE"}
            </Text>
          </View>
        </SettingsRow>

        {/* ── About ── */}
        <SectionLabel label="ABOUT" />

        <SettingsRow label="App version">
          <Text style={s.valueText}>1.0.0-beta</Text>
        </SettingsRow>

        {/* ── Sign Out ── */}
        <TouchableOpacity onPress={handleSignOut} style={s.signOutBtn}>
          <Text style={s.signOutText}>SIGN OUT</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.warmWhite },
  backBtn: { marginBottom: 32 },
  backText: { fontSize: 11, fontWeight: "400", letterSpacing: 1.2, color: C.brown },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 32 },
  avatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: C.black,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontSize: 18, fontWeight: "500", color: C.white },
  nameText: { fontSize: 24, fontWeight: "300", color: C.black, lineHeight: 29 },
  tierText: { fontSize: 12, fontWeight: "300", color: C.brown, marginTop: 2 },
  sectionLabel: {
    fontSize: 9, fontWeight: "400", letterSpacing: 2, textTransform: "uppercase",
    color: C.brown, marginTop: 28, marginBottom: 12,
  },
  settingsRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.light,
  },
  settingsLabel: { fontSize: 13, fontWeight: "300", color: C.black },
  valueText: { fontSize: 13, fontWeight: "400", color: C.brown },
  linkBtn: { fontSize: 11, fontWeight: "400", color: C.black, textDecorationLine: "underline" },
  nameInput: {
    paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: C.light,
    borderRadius: 8, fontSize: 13, color: C.black, backgroundColor: C.white, width: 140,
  },
  planBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 100 },
  planBadgeText: { fontSize: 11, fontWeight: "400", letterSpacing: 0.8 },
  signOutBtn: {
    marginTop: 40, width: "100%", paddingVertical: 15,
    borderWidth: 1, borderColor: C.light, borderRadius: 12,
    alignItems: "center",
  },
  signOutText: { fontSize: 11, fontWeight: "400", letterSpacing: 1.2, color: C.error },
});
