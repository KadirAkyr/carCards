// app/_layout.tsx
import { Slot } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { supabase } from "../lib/supabase";

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // 1) session anonyme
      const {
        data: { user },
      } = await supabase.auth.getUser();
      let uid = user?.id ?? null;
      if (!uid) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) console.error("anon sign-in error", error);
        uid = data?.user?.id ?? null;
      }
      setUserId(uid);

      // 2) provision profil si besoin (évite le 406)
      if (uid) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", uid)
          .maybeSingle(); // important pour éviter 406

        if (!profile) {
          const { error: upsertErr } = await supabase
            .from("profiles")
            .insert({ id: uid, username: "carfan_" + uid.slice(0, 8) });
          if (upsertErr) console.error("profile insert error", upsertErr);
        }

        // 🧩 garde-fou : vérifie que currencies existe, sinon crée-le
        const { data: currRow } = await supabase
          .from("currencies")
          .select("*")
          .eq("profile_id", uid)
          .maybeSingle();

        if (!currRow) {
          await supabase
            .from("currencies")
            .insert({ profile_id: uid })
            .catch(() => {});
        }
      }

      setReady(true);
    })();
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Slot />
      <View
        style={{
          position: "absolute",
          bottom: 20,
          left: 20,
          backgroundColor: "#0008",
          padding: 8,
          borderRadius: 8,
        }}
      >
        <Text style={{ color: "#fff" }}>user: {userId}</Text>
      </View>
    </View>
  );
}
