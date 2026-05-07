import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, TouchableOpacity, Image, FlatList, Modal,
  TextInput, ScrollView, Alert, ActivityIndicator, StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../lib/supabase";

// ── Colors ────────────────────────────────────────────────────────────────
const C = {
  black: "#1a1a1a", white: "#ffffff", warmWhite: "#faf9f7",
  brown: "#8b7d6b", mid: "#999", light: "#e8e4df",
  mint: "#d6ede6", mintText: "#2a6b55", error: "#c0392b",
};

// ── Types ─────────────────────────────────────────────────────────────────
type Feel = "good" | "ok" | "off" | null;
type FlagType = "gone_quiet" | "worn_once" | null;
type SortKey = "wear_rate" | "last_worn" | "feel";

interface ClosetItem {
  id: string; name: string; category: string; wornCount: number;
  lastWorn: string; feel: Feel; flagType: FlagType; photo_url?: string;
  systemNote?: string; avg_feel?: number; wear_count?: number;
  last_worn?: string; brand?: string; color?: string; purchase_price?: number;
}

const CATEGORIES = ["Tops","Bottoms","Dresses","Outerwear","Knitwear","Shoes","Accessories"];

const FEEL_CONFIG = {
  good: { bg: "#d6ede6", color: "#2a6b55", symbol: "↑" },
  ok:   { bg: "#e8e4df", color: "#666",    symbol: "—" },
  off:  { bg: "#f0e8e8", color: "#5c3a3a", symbol: "↓" },
};

const FLAG_CONFIG = {
  gone_quiet: { bg: "#fff3e0", color: "#b45309", label: "Gone quiet" },
  worn_once:  { bg: "#e8e4df", color: "#666",    label: "Worn once" },
};

// ── Map DB row ────────────────────────────────────────────────────────────
function mapDbItem(row: any): ClosetItem {
  const wornCount = row.wear_count ?? 0;
  const avgFeel = row.avg_feel;
  let feel: Feel = null;
  if (avgFeel != null) {
    if (avgFeel >= 4) feel = "good";
    else if (avgFeel >= 3) feel = "ok";
    else feel = "off";
  }
  let lastWornDisplay = "Never";
  if (row.last_worn) {
    const days = Math.floor((Date.now() - new Date(row.last_worn).getTime()) / 86400000);
    if (days === 0) lastWornDisplay = "Today";
    else if (days === 1) lastWornDisplay = "1d ago";
    else if (days < 7) lastWornDisplay = `${days}d ago`;
    else if (days < 30) lastWornDisplay = `${Math.floor(days / 7)}w ago`;
    else lastWornDisplay = `${Math.floor(days / 30)}mo ago`;
  }
  let flagType: FlagType = null;
  if (wornCount === 1) flagType = "worn_once";
  else if (row.last_worn) {
    const days = Math.floor((Date.now() - new Date(row.last_worn).getTime()) / 86400000);
    if (days > 42 && wornCount > 0) flagType = "gone_quiet";
  }
  return {
    id: row.id, name: row.name, category: row.category, wornCount,
    lastWorn: lastWornDisplay, feel, flagType, photo_url: row.photo_url,
    avg_feel: row.avg_feel, wear_count: row.wear_count, last_worn: row.last_worn,
    brand: row.brand, color: row.color, purchase_price: row.purchase_price,
  };
}

// ── Main Screen ───────────────────────────────────────────────────────────
export default function ClosetScreen() {
  const [items, setItems] = useState<ClosetItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [sortBy, setSortBy] = useState<SortKey>("wear_rate");
  const [selectedItem, setSelectedItem] = useState<ClosetItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<ClosetItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsLoading(false); return; }

    let query = supabase
      .from("closet_items")
      .select("id, name, category, wear_count, last_worn, avg_feel, photo_url, purchase_price, brand, color")
      .eq("user_id", user.id)
      .eq("status", "active");

    if (selectedCategory !== "All") query = query.eq("category", selectedCategory);
    if (sortBy === "wear_rate") query = query.order("wear_count", { ascending: false });
    else if (sortBy === "last_worn") query = query.order("last_worn", { ascending: false, nullsFirst: false });
    else if (sortBy === "feel") query = query.order("avg_feel", { ascending: false, nullsFirst: false });

    const { data, error } = await query;
    if (error) { console.error(error.message); setIsLoading(false); return; }

    setItems((data || []).map(mapDbItem));

    const { data: allItems } = await supabase
      .from("closet_items").select("category")
      .eq("user_id", user.id).eq("status", "active");
    setCategories(Array.from(new Set((allItems || []).map((i: any) => i.category))));
    setIsLoading(false);
  }, [selectedCategory, sortBy]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  async function openSheet(item: ClosetItem) {
    setSelectedItem(item);
    setSheetOpen(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-generate", {
        body: { context_type: "item_detail", closet_item_id: item.id },
      });
      if (!error && data?.text) {
        setSelectedItem(prev => prev ? { ...prev, systemNote: data.text } : prev);
      }
    } catch {}
  }

  async function handleArchive() {
    if (!selectedItem) return;
    Alert.alert("Archive item?", "It will be removed from your closet but wear history is preserved.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Archive", style: "destructive",
        onPress: async () => {
          const { error } = await supabase
            .from("closet_items").update({ status: "archived" }).eq("id", selectedItem.id);
          if (error) { Alert.alert("Error", error.message); return; }
          setSheetOpen(false); setSelectedItem(null); fetchItems();
        },
      },
    ]);
  }

  // ── Render ──────────────────────────────────────────────────────────────
  const renderItem = ({ item }: { item: ClosetItem }) => (
    <TouchableOpacity onPress={() => openSheet(item)} activeOpacity={0.7} style={s.card}>
      <View style={s.thumb}>
        {item.photo_url ? (
          <Image source={{ uri: item.photo_url }} style={s.thumbImage} />
        ) : (
          <View style={[s.thumbImage, { backgroundColor: "#e8e0d4" }]} />
        )}
        {item.flagType ? (
          <View style={[s.flag, { backgroundColor: FLAG_CONFIG[item.flagType].bg }]}>
            <Text style={{ fontSize: 9, color: FLAG_CONFIG[item.flagType].color }}>{FLAG_CONFIG[item.flagType].label}</Text>
          </View>
        ) : item.feel ? (
          <View style={[s.feelDot, { backgroundColor: FEEL_CONFIG[item.feel].bg }]}>
            <Text style={{ fontSize: 12, color: FEEL_CONFIG[item.feel].color }}>{FEEL_CONFIG[item.feel].symbol}</Text>
          </View>
        ) : null}
      </View>
      <View style={s.cardInfo}>
        <Text style={s.cardName} numberOfLines={1}>{item.name}</Text>
        <Text style={s.cardCategory}>{item.category}</Text>
        <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
          <Text style={s.cardStat}><Text style={s.cardStatBold}>{item.wornCount}×</Text> worn</Text>
          <Text style={s.cardStat}><Text style={s.cardStatBold}>{item.lastWorn}</Text> last worn</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>CLOSET</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text style={s.itemCount}>{items.length} ITEMS</Text>
          <TouchableOpacity onPress={() => { setEditItem(null); setAddModalOpen(true); }} style={s.addButton}>
            <Text style={s.addButtonText}>+ ADD</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Category chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
        {["All", ...categories].map(chip => {
          const active = chip === selectedCategory;
          return (
            <TouchableOpacity key={chip} onPress={() => setSelectedCategory(chip)}
              style={[s.chip, active && s.chipActive]}>
              <Text style={[s.chipText, active && s.chipTextActive]}>{chip}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Sort bar */}
      <View style={s.sortBar}>
        <Text style={s.sortLabel}>SORT BY</Text>
        {(["wear_rate", "last_worn", "feel"] as SortKey[]).map(key => {
          const active = sortBy === key;
          const label = key === "wear_rate" ? "Wear rate" : key === "last_worn" ? "Last worn" : "Feel";
          return (
            <TouchableOpacity key={key} onPress={() => setSortBy(key)}>
              <Text style={[s.sortOption, active && s.sortOptionActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Grid */}
      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={C.mintText} />
        </View>
      ) : items.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 48 }}>
          <Text style={{ fontSize: 18, fontWeight: "300", color: C.black }}>Your closet is empty.</Text>
          <Text style={{ fontSize: 11, fontWeight: "300", color: C.mid, marginTop: 8 }}>Tap + Add to add your first item.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={i => i.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
          contentContainerStyle={{ gap: 12, paddingTop: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Detail Sheet */}
      <DetailSheet
        item={selectedItem}
        isOpen={sheetOpen}
        onClose={() => { setSheetOpen(false); setSelectedItem(null); }}
        onEdit={() => { setEditItem(selectedItem); setSheetOpen(false); setAddModalOpen(true); }}
        onArchive={handleArchive}
      />

      {/* Add/Edit Modal */}
      <AddItemModal
        isOpen={addModalOpen}
        onClose={() => { setAddModalOpen(false); setEditItem(null); }}
        onSaved={fetchItems}
        editItem={editItem}
      />
    </SafeAreaView>
  );
}

// ── DetailSheet ───────────────────────────────────────────────────────────
function DetailSheet({ item, isOpen, onClose, onEdit, onArchive }: {
  item: ClosetItem | null; isOpen: boolean; onClose: () => void; onEdit: () => void; onArchive: () => void;
}) {
  if (!isOpen || !item) return null;
  const feelSymbol = item.feel ? FEEL_CONFIG[item.feel].symbol : "—";
  const feelLabel = item.feel ?? "none";

  return (
    <Modal visible={isOpen} animationType="slide" transparent>
      <View style={s.sheetOverlay}>
        <TouchableOpacity style={s.sheetBackdrop} onPress={onClose} activeOpacity={1} />
        <View style={s.sheetContent}>
          <View style={s.sheetHandle} />
          {item.photo_url && (
            <Image source={{ uri: item.photo_url }} style={{ width: "100%", height: 200 }} resizeMode="cover" />
          )}
          <View style={{ padding: 20, paddingBottom: 0 }}>
            <Text style={s.sheetCategory}>{item.category}</Text>
            <Text style={s.sheetName}>{item.name}</Text>
          </View>
          <View style={s.sheetStats}>
            {[
              { value: `${item.wornCount}×`, label: "Times worn" },
              { value: item.lastWorn, label: "Last worn" },
              { value: `${feelSymbol} ${feelLabel}`, label: "General feel" },
            ].map(stat => (
              <View key={stat.label} style={s.sheetStatBox}>
                <Text style={s.sheetStatValue}>{stat.value}</Text>
                <Text style={s.sheetStatLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
          <View style={{ paddingHorizontal: 24, paddingBottom: 16 }}>
            <Text style={s.sheetNoteLabel}>SYSTEM NOTE</Text>
            <View style={s.sheetNoteBox}>
              <Text style={s.sheetNoteText}>{item.systemNote ?? "Generating note..."}</Text>
            </View>
          </View>
          <View style={{ paddingHorizontal: 24, paddingBottom: 32, gap: 10 }}>
            <TouchableOpacity onPress={onEdit} style={s.sheetEditBtn}>
              <Text style={s.sheetEditBtnText}>EDIT ITEM</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity onPress={onArchive} style={[s.sheetSecBtn, { borderColor: C.error }]}>
                <Text style={[s.sheetSecBtnText, { color: C.error }]}>ARCHIVE</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={s.sheetSecBtn}>
                <Text style={s.sheetSecBtnText}>CLOSE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── AddItemModal ──────────────────────────────────────────────────────────
function AddItemModal({ isOpen, onClose, onSaved, editItem }: {
  isOpen: boolean; onClose: () => void; onSaved: () => void; editItem: ClosetItem | null;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Tops");
  const [brand, setBrand] = useState("");
  const [color, setColor] = useState("");
  const [price, setPrice] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editItem) {
      setName(editItem.name || ""); setCategory(editItem.category || "Tops");
      setBrand(editItem.brand || ""); setColor(editItem.color || "");
      setPrice(editItem.purchase_price ? String(editItem.purchase_price) : "");
      setPhotoUri(editItem.photo_url || null);
    } else {
      setName(""); setCategory("Tops"); setBrand(""); setColor("");
      setPrice(""); setPhotoUri(null);
    }
  }, [editItem, isOpen]);

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.7,
    });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  }

  async function handleSave() {
    if (!name.trim()) { setError("Item name is required."); return; }
    setIsSaving(true); setError("");

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError("Not signed in."); setIsSaving(false); return; }
    const userId = session.user.id;

    // Upload photo if it's a new local file (not an existing URL)
    let photoUrl: string | null = null;
    if (photoUri && !photoUri.startsWith("http")) {
      const ext = photoUri.split(".").pop() || "jpg";
      const path = `${userId}/${Date.now()}.${ext}`;
      const response = await fetch(photoUri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();
      const { error: uploadError } = await supabase.storage
        .from("closet-photos")
        .upload(path, arrayBuffer, { contentType: `image/${ext}` });
      if (!uploadError) {
        const { data } = supabase.storage.from("closet-photos").getPublicUrl(path);
        photoUrl = data.publicUrl;
      }
    }

    let saveError;
    if (editItem) {
      const updates: any = {
        name: name.trim(), category,
        brand: brand.trim() || null, color: color.trim() || null,
        purchase_price: price ? parseFloat(price) : null,
      };
      if (photoUrl) updates.photo_url = photoUrl;
      const { error } = await supabase.from("closet_items")
        .update(updates).eq("id", editItem.id).eq("user_id", userId);
      saveError = error;
    } else {
      const { error } = await supabase.from("closet_items").insert({
        user_id: userId, name: name.trim(), category,
        brand: brand.trim() || null, color: color.trim() || null,
        purchase_price: price ? parseFloat(price) : null,
        photo_url: photoUrl,
      });
      saveError = error;
    }

    setIsSaving(false);
    if (saveError) { setError(saveError.message); return; }
    onSaved(); onClose();
  }

  if (!isOpen) return null;

  return (
    <Modal visible={isOpen} animationType="slide" transparent>
      <View style={s.sheetOverlay}>
        <TouchableOpacity style={s.sheetBackdrop} onPress={onClose} activeOpacity={1} />
        <View style={[s.sheetContent, { top: 60 }]}>
          <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontSize: 22, fontWeight: "300", color: C.black, marginBottom: 20 }}>
              {editItem ? "Edit item" : "Add item"}
            </Text>

            {/* Photo */}
            <Text style={s.formLabel}>PHOTO (OPTIONAL)</Text>
            <TouchableOpacity onPress={pickPhoto} style={s.photoPicker}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={{ width: "100%", height: "100%", borderRadius: 12 }} resizeMode="cover" />
              ) : (
                <Text style={{ fontSize: 11, color: C.mid }}>Tap to add photo</Text>
              )}
            </TouchableOpacity>

            {/* Name */}
            <Text style={s.formLabel}>NAME *</Text>
            <TextInput value={name} onChangeText={setName} placeholder="e.g. Black wide-leg trousers"
              placeholderTextColor="#bbb" style={s.formInput} />

            {/* Category */}
            <Text style={s.formLabel}>CATEGORY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {CATEGORIES.map(c => (
                  <TouchableOpacity key={c} onPress={() => setCategory(c)}
                    style={[s.chip, category === c && s.chipActive]}>
                    <Text style={[s.chipText, category === c && s.chipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Brand + Color */}
            <View style={{ flexDirection: "row", gap: 12, marginBottom: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={s.formLabel}>BRAND</Text>
                <TextInput value={brand} onChangeText={setBrand} placeholder="e.g. Arket"
                  placeholderTextColor="#bbb" style={s.formInput} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.formLabel}>COLOR</Text>
                <TextInput value={color} onChangeText={setColor} placeholder="e.g. Navy"
                  placeholderTextColor="#bbb" style={s.formInput} />
              </View>
            </View>

            {/* Price */}
            <Text style={s.formLabel}>PURCHASE PRICE (OPTIONAL)</Text>
            <TextInput value={price} onChangeText={setPrice} placeholder="e.g. 120"
              placeholderTextColor="#bbb" keyboardType="numeric" style={[s.formInput, { marginBottom: 20 }]} />

            {error !== "" && <Text style={{ color: C.error, fontSize: 13, marginBottom: 12 }}>{error}</Text>}

            <TouchableOpacity onPress={handleSave} disabled={isSaving}
              style={[s.sheetEditBtn, { opacity: isSaving ? 0.5 : 1 }]}>
              <Text style={s.sheetEditBtnText}>{isSaving ? "SAVING..." : editItem ? "UPDATE ITEM" : "SAVE ITEM"}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.white },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 28, paddingVertical: 12,
  },
  headerTitle: { fontSize: 13, fontWeight: "300", letterSpacing: 1.5, color: C.black, textTransform: "uppercase" },
  itemCount: { fontSize: 11, fontWeight: "400", letterSpacing: 0.8, color: C.mid, textTransform: "uppercase" },
  addButton: { backgroundColor: C.black, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 6 },
  addButtonText: { color: C.white, fontSize: 10, fontWeight: "400", letterSpacing: 1, textTransform: "uppercase" },
  chipRow: { paddingHorizontal: 28, paddingBottom: 16, gap: 8, flexDirection: "row", alignItems: "center" },
  chip: {
    borderRadius: 100, paddingHorizontal: 14, paddingVertical: 8, minHeight: 32,
    borderWidth: 1, borderColor: C.light, backgroundColor: C.white,
    alignSelf: "flex-start",
  },
  chipActive: { backgroundColor: C.black, borderColor: C.black },
  chipText: { fontSize: 10, fontWeight: "400", letterSpacing: 1, textTransform: "uppercase", color: C.mid },
  chipTextActive: { color: C.white },
  sortBar: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 28,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.light, gap: 16,
  },
  sortLabel: { fontSize: 9, fontWeight: "400", letterSpacing: 1.5, color: C.mid, textTransform: "uppercase" },
  sortOption: { fontSize: 10, fontWeight: "300", color: C.mid, letterSpacing: 0.5 },
  sortOptionActive: { fontWeight: "400", color: C.black, textDecorationLine: "underline" },
  card: { flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.light, borderRadius: 16, overflow: "hidden" },
  thumb: { width: "100%", height: 160 },
  thumbImage: { width: "100%", height: "100%" },
  flag: { position: "absolute", top: 8, left: 8, borderRadius: 100, paddingHorizontal: 8, paddingVertical: 4 },
  feelDot: {
    position: "absolute", top: 8, right: 8, width: 28, height: 28,
    borderRadius: 14, alignItems: "center", justifyContent: "center",
  },
  cardInfo: { padding: 12, paddingBottom: 14 },
  cardName: { fontSize: 14, fontWeight: "400", color: C.black, marginBottom: 4 },
  cardCategory: { fontSize: 9, fontWeight: "400", letterSpacing: 1.2, textTransform: "uppercase", color: C.mid, marginBottom: 8 },
  cardStat: { fontSize: 10, fontWeight: "300", color: C.mid },
  cardStatBold: { fontWeight: "400", color: C.black },
  // Sheet
  sheetOverlay: { flex: 1, justifyContent: "flex-end" },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  sheetContent: {
    backgroundColor: C.white, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    maxHeight: "85%", overflow: "hidden",
  },
  sheetHandle: {
    width: 36, height: 4, backgroundColor: C.mid, borderRadius: 2,
    alignSelf: "center", marginTop: 12, marginBottom: 16, opacity: 0.5,
  },
  sheetCategory: { fontSize: 9, fontWeight: "400", letterSpacing: 2, textTransform: "uppercase", color: C.mid, marginBottom: 4 },
  sheetName: { fontSize: 22, fontWeight: "300", color: C.black, lineHeight: 26 },
  sheetStats: { flexDirection: "row", gap: 12, padding: 16, paddingHorizontal: 24 },
  sheetStatBox: {
    flex: 1, backgroundColor: C.warmWhite, borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: C.light,
  },
  sheetStatValue: { fontSize: 24, fontWeight: "300", color: C.black, marginBottom: 4 },
  sheetStatLabel: { fontSize: 9, fontWeight: "400", letterSpacing: 0.8, color: C.mid },
  sheetNoteLabel: { fontSize: 9, fontWeight: "400", letterSpacing: 2, textTransform: "uppercase", color: C.mid, marginBottom: 8 },
  sheetNoteBox: { backgroundColor: C.warmWhite, borderRadius: 12, padding: 14 },
  sheetNoteText: { fontSize: 14, fontWeight: "400", color: C.black, lineHeight: 23 },
  sheetEditBtn: {
    width: "100%", paddingVertical: 14, backgroundColor: C.black,
    borderRadius: 12, alignItems: "center",
  },
  sheetEditBtnText: { color: C.white, fontSize: 11, fontWeight: "400", letterSpacing: 1, textTransform: "uppercase" },
  sheetSecBtn: {
    flex: 1, paddingVertical: 14, borderWidth: 1, borderColor: C.light,
    borderRadius: 12, alignItems: "center",
  },
  sheetSecBtnText: { fontSize: 11, fontWeight: "400", letterSpacing: 1, textTransform: "uppercase", color: C.black },
  // Form
  formLabel: { fontSize: 9, fontWeight: "400", letterSpacing: 1.5, textTransform: "uppercase", color: C.mid, marginBottom: 6 },
  formInput: {
    borderWidth: 1, borderColor: C.light, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 13,
    color: C.black, backgroundColor: C.warmWhite, marginBottom: 14,
  },
  photoPicker: {
    width: "100%", height: 100, borderWidth: 1.5, borderStyle: "dashed",
    borderColor: C.light, borderRadius: 12, backgroundColor: C.warmWhite,
    alignItems: "center", justifyContent: "center", marginBottom: 16, overflow: "hidden",
  },
});
