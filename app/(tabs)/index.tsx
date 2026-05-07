import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import {
  MintCard,
  DecorativeRule,
  DashboardButton,
  SectionLabel,
  StatBadge,
  StatCard,
  InsightCard,
} from "../../components/dashboard-shared";

interface DashboardData {
  displayName: string;
  initials: string;
  dayPart: string;
  greeting: string;
  outfitsThisMonth: number;
  totalActiveItems: number;
  itemsNeverWorn: number;
  wearRate: number;
  recentInsightTitle: string;
  recentInsightBody: string;
}

function getDayPart(): string {
  const now = new Date();
  const hour = now.getHours();
  const dayName = now.toLocaleDateString("en-US", { weekday: "long" });
  if (hour < 12) return `${dayName} morning`;
  if (hour < 18) return `${dayName} afternoon`;
  return `${dayName} evening`;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function getInitials(name: string): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function DashboardScreen() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadDashboard = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setIsLoading(false);
        return;
      }

      const userId = session.user.id;

      const { data: profile } = await supabase
        .from("users")
        .select("display_name, email")
        .eq("id", userId)
        .single();

      const displayName =
        profile?.display_name || profile?.email?.split("@")[0] || "there";

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const { count: outfitsThisMonth } = await supabase
        .from("outfit_logs")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("worn_date", monthStart.toISOString().split("T")[0]);

      const { count: totalActiveItems } = await supabase
        .from("closet_items")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "active");

      const { count: itemsNeverWorn } = await supabase
        .from("closet_items")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "active")
        .eq("wear_count", 0);

      const itemsWorn = (totalActiveItems || 0) - (itemsNeverWorn || 0);
      const wearRate =
        totalActiveItems && totalActiveItems > 0
          ? Math.round((itemsWorn / totalActiveItems) * 100)
          : 0;

      let recentInsightTitle = "Your closet is taking shape.";
      let recentInsightBody =
        "Keep logging outfits — patterns will surface as the data builds.";

      if ((outfitsThisMonth || 0) === 0) {
        recentInsightTitle = "Log your first outfit.";
        recentInsightBody =
          "It takes 30 seconds and starts building your wardrobe memory.";
      } else {
        recentInsightTitle = "Analyzing your wardrobe patterns...";
        recentInsightBody = "";
      }

      setData({
        displayName,
        initials: getInitials(displayName),
        dayPart: getDayPart(),
        greeting: getGreeting(),
        outfitsThisMonth: outfitsThisMonth || 0,
        totalActiveItems: totalActiveItems || 0,
        itemsNeverWorn: itemsNeverWorn || 0,
        wearRate,
        recentInsightTitle,
        recentInsightBody,
      });
      setIsLoading(false);

      // Fetch AI nudge in background
      if ((outfitsThisMonth || 0) > 0) {
        supabase.functions
          .invoke("ai-generate", {
            body: { context_type: "dashboard_nudge" },
          })
          .then(({ data: aiData, error: aiError }) => {
            if (!aiError && aiData?.text) {
              setData((prev) =>
                prev
                  ? {
                      ...prev,
                      recentInsightTitle: aiData.text,
                      recentInsightBody: "",
                    }
                  : prev
              );
            }
          })
          .catch(() => {});
      }
    };
    loadDashboard();
  }, []);

  if (isLoading || !data) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2a6b55" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>THE SHORTLIST</Text>
          <TouchableOpacity
            onPress={() => router.push("/profile")}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>{data.initials}</Text>
          </TouchableOpacity>
        </View>

        {/* Greeting */}
        <View style={styles.section}>
          <SectionLabel>{data.dayPart}</SectionLabel>
          <Text style={styles.greeting}>
            {data.greeting}, {data.displayName}.
          </Text>
        </View>

        {/* Wardrobe summary card */}
        <View style={styles.section}>
          <MintCard>
            <SectionLabel>Your closet</SectionLabel>
            <Text style={styles.bigNumber}>{data.totalActiveItems}</Text>
            <DecorativeRule />
            <Text style={styles.cardBody}>
              {data.totalActiveItems === 0
                ? "Add items to your closet to start tracking what you wear."
                : `You own ${data.totalActiveItems} active item${
                    data.totalActiveItems === 1 ? "" : "s"
                  }. ${
                    data.outfitsThisMonth > 0
                      ? `Logged ${data.outfitsThisMonth} outfit${
                          data.outfitsThisMonth === 1 ? "" : "s"
                        } this month.`
                      : "Log your first outfit to start building patterns."
                  }`}
            </Text>
            <View style={styles.badgeRow}>
              <StatBadge>{data.totalActiveItems} items</StatBadge>
              <StatBadge>{data.outfitsThisMonth} logged this month</StatBadge>
            </View>
          </MintCard>
        </View>

        {/* This Month */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <SectionLabel>This month</SectionLabel>
            <TouchableOpacity onPress={() => router.push("/(tabs)/insights")}>
              <Text style={styles.viewLink}>View insights</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.statsRow}>
            <StatCard value={`${data.wearRate}%`} label="wear rate" />
            <StatCard value={data.outfitsThisMonth} label="outfits logged" />
            <StatCard value={data.itemsNeverWorn} label="items never worn" />
          </View>
        </View>

        {/* Insight Card */}
        <View style={styles.section}>
          <InsightCard
            title={data.recentInsightTitle}
            description={data.recentInsightBody}
          />
        </View>
      </ScrollView>

      {/* Log Button */}
      <View style={styles.bottomBar}>
        <DashboardButton
          label="Log today's outfit"
          onPress={() => router.push("/(tabs)/log")}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  scrollContent: {
    paddingBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
    paddingTop: 24,
  },
  logo: {
    fontSize: 18,
    fontWeight: "300",
    letterSpacing: 1.5,
    color: "#1a1a1a",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "500",
  },
  section: {
    paddingHorizontal: 28,
    paddingTop: 24,
  },
  greeting: {
    fontSize: 28,
    fontWeight: "300",
    fontStyle: "italic",
    color: "#1a1a1a",
    marginTop: 4,
  },
  bigNumber: {
    fontSize: 72,
    fontWeight: "300",
    color: "#8b7d6b",
    marginTop: 8,
  },
  cardBody: {
    fontSize: 14,
    fontWeight: "300",
    color: "#1a1a1a",
    lineHeight: 20,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  viewLink: {
    fontSize: 12,
    fontWeight: "400",
    color: "#1a1a1a",
    textDecorationLine: "underline",
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  bottomBar: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
  },
});
