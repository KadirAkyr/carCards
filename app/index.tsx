// app/index.tsx
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { supabase } from "../lib/supabase";

type Profile = {
  id: string;
  username: string | null;
  level: number;
  xp: number;
};
type Currency = { profile_id: string; coins: number; shards: number };

export default function Home() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [curr, setCurr] = useState<Currency | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase
        .from("currencies")
        .select("*")
        .eq("profile_id", user.id)
        .maybeSingle(),
    ]);
    setProfile(p ?? null);
    setCurr(c ?? null);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <Text style={{ fontSize: 24, fontWeight: "700", marginBottom: 8 }}>
        Bienvenue 🚗
      </Text>
      <Text style={{ fontSize: 16, opacity: 0.8 }}>
        {profile
          ? `${profile.username} — level ${profile.level} — XP ${profile.xp}`
          : "Profil non chargé"}
      </Text>
      <Text style={{ fontSize: 16, marginTop: 4, opacity: 0.8 }}>
        Coins: {curr?.coins ?? 0} — Shards: {curr?.shards ?? 0}
      </Text>

      <Pressable
        onPress={load}
        style={{
          marginTop: 24,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 10,
          backgroundColor: "#111",
        }}
        disabled={loading}
      >
        <Text style={{ color: "#fff", fontWeight: "600" }}>
          {loading ? "Chargement..." : "Rafraîchir"}
        </Text>
      </Pressable>
    </View>
  );
}
