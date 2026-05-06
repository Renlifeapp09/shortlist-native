export default {
  expo: {
    name: "The Shortlist",
    slug: "shortlist-native",
    scheme: "shortlist",
    version: "1.0.0",
    platforms: ["ios", "android"],
    extra: {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    },
  },
};
