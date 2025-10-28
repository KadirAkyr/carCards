// app/index.tsx
import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { openPack, OpenPackResponse } from "../lib/openPack";
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
  const [opening, setOpening] = useState(false);
  const [lastPull, setLastPull] = useState<OpenPackResponse["card"] | null>(
    null
  );

  const load = async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
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
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const onOpenStarter = async () => {
    try {
      setOpening(true);
      const res = await openPack("starter"); // 👈 appelle l’Edge Function
      setLastPull(res.card);
      // rafraîchit tes infos (xp/coins/inventory)
      await load();
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("COOLDOWN") || msg.includes("429")) {
        Alert.alert(
          "Cooldown",
          "Tu as déjà ouvert le Starter Pack récemment. Réessaie plus tard."
        );
      } else if (
        msg.includes("Missing Authorization") ||
        msg.includes("Invalid user")
      ) {
        Alert.alert(
          "Auth",
          "Session invalide. Redémarre l'app ou reconnecte-toi."
        );
      } else {
        Alert.alert("Erreur", msg);
      }
    } finally {
      setOpening(false);
    }
  };

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <Text style={{ fontSize: 24, fontWeight: "700" }}>Bienvenue 🚗</Text>
      <Text style={{ marginTop: 8, opacity: 0.8 }}>
        {profile
          ? `${profile.username} — level ${profile.level} — XP ${profile.xp}`
          : loading
          ? "Chargement…"
          : "Profil indisponible"}
      </Text>
      <Text style={{ marginTop: 4, opacity: 0.8 }}>
        Coins: {curr?.coins ?? 0} — Shards: {curr?.shards ?? 0}
      </Text>

      <Pressable
        onPress={onOpenStarter}
        disabled={opening}
        style={{
          marginTop: 24,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 10,
          backgroundColor: opening ? "#555" : "#111",
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "700" }}>
          {opening ? "Ouverture…" : "Ouvrir le Starter Pack"}
        </Text>
      </Pressable>

      {lastPull && (
        <View
          style={{
            marginTop: 24,
            padding: 16,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#ddd",
            width: "100%",
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "700" }}>
            {lastPull.make} {lastPull.model} — {lastPull.rarity}
          </Text>
          <Text style={{ opacity: 0.7 }}>
            Set: {lastPull.set_id} {lastPull.year ? `— ${lastPull.year}` : ""}
          </Text>
          {!lastPull.image_path && (
            <Text style={{ marginTop: 8, opacity: 0.6 }}>
              (pas d’image pour l’instant)
            </Text>
          )}
        </View>
      )}

      <Pressable
        onPress={load}
        disabled={loading}
        style={{
          marginTop: 16,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: "#ddd",
        }}
      >
        <Text>{loading ? "Chargement…" : "Rafraîchir"}</Text>
      </Pressable>
    </View>
  );
}
