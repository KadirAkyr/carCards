// supabase/functions/open_pack/index.ts
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ----- CORS -----
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ----- UTILITAIRES -----
function weightedRandom<T extends { weight: number }>(items: T[]) {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

const nowIso = () => new Date().toISOString();

function isWithinCooldown(lastOpenedAt: string | null, cooldownMinutes: number): boolean {
  if (!lastOpenedAt) return false;
  const last = new Date(lastOpenedAt).getTime();
  const diffMin = (Date.now() - last) / 60000;
  return diffMin < cooldownMinutes;
}

// ----- HANDLER -----
serve(async (req) => {
  // Préflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response("Missing Authorization", { status: 401, headers: corsHeaders });
    }

    const { pack_id } = await req.json();
    if (!pack_id) {
      return new Response("Missing pack_id", { status: 400, headers: corsHeaders });
    }

    const url = Deno.env.get("PROJECT_URL");
    const key = Deno.env.get("SERVICE_ROLE_KEY");
    if (!url || !key) {
      return new Response(
        JSON.stringify({ error: "MISSING_ENV", url: !!url, key: !!key }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    // ---- USER ----
    const { data: userData, error: userErr } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !userData?.user) {
      return new Response("Invalid user", { status: 401, headers: corsHeaders });
    }
    const userId = userData.user.id;

    // ---- PACK ----
    const { data: pack, error: packErr } = await admin
      .from("packs")
      .select("id, title, daily_free, cooldown_minutes")
      .eq("id", pack_id)
      .maybeSingle();
    if (packErr || !pack) {
      return new Response("Pack not found", { status: 404, headers: corsHeaders });
    }

    // ---- COOLDOWN ----
    const { data: last } = await admin
      .from("pack_opens")
      .select("opened_at")
      .eq("profile_id", userId)
      .eq("pack_id", pack_id)
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const cdMinutes = pack.daily_free
      ? Math.max(pack.cooldown_minutes, 1440)
      : pack.cooldown_minutes;

    if (isWithinCooldown(last?.opened_at ?? null, cdMinutes)) {
      return new Response(
        JSON.stringify({
          error: "COOLDOWN_ACTIVE",
          cooldown_minutes: cdMinutes,
          last_opened_at: last?.opened_at,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- PROBABILITÉS ----
    const { data: probs, error: probErr } = await admin
      .from("pack_probabilities")
      .select("rarity, weight")
      .eq("pack_id", pack_id);
    if (probErr || !probs?.length) {
      return new Response("No probabilities for pack", { status: 400, headers: corsHeaders });
    }

    const chosen = weightedRandom(probs);

    // ---- POOL DE CARTES (2 requêtes robustes) ----
    const { data: poolIds, error: poolErr } = await admin
      .from("pack_pools")
      .select("card_id")
      .eq("pack_id", pack_id);
    if (poolErr || !poolIds?.length) {
      return new Response("Pool fetch failed", { status: 400, headers: corsHeaders });
    }

    const ids = poolIds.map((p) => p.card_id);
    const { data: cards, error: cardsErr } = await admin
      .from("car_cards")
      .select("id, set_id, make, model, year, rarity, image_path")
      .in("id", ids)
      .eq("rarity", chosen.rarity);
    if (cardsErr || !cards?.length) {
      return new Response("No cards for chosen rarity in pool", { status: 400, headers: corsHeaders });
    }

    const pick = cards[Math.floor(Math.random() * cards.length)];

    // ---- INVENTAIRE ----
    const { data: invRow, error: invErr } = await admin
      .from("inventory")
      .select("count")
      .eq("profile_id", userId)
      .eq("card_id", pick.id)
      .maybeSingle();
    if (invErr) {
      return new Response("Inventory check failed", { status: 500, headers: corsHeaders });
    }

    if (!invRow) {
      const { error: insErr } = await admin.from("inventory").insert({
        profile_id: userId,
        card_id: pick.id,
        count: 1,
        first_obtained_at: nowIso(),
      });
      if (insErr) {
        const { error: incErr } = await admin.rpc("increment_inventory", { p_user: userId, p_card: pick.id });
        if (incErr) console.error("increment_inventory after insert error", incErr);
      }
    } else {
      const { error: incErr } = await admin.rpc("increment_inventory", { p_user: userId, p_card: pick.id });
      if (incErr) console.error("increment_inventory error", incErr);
    }

    // ---- +XP ----
    const { error: xpErr } = await admin.rpc("increment_xp", { p_user: userId, delta: 5 });
    if (xpErr) console.error("increment_xp error", xpErr);

    // ---- LOG D’OUVERTURE ----
    const { error: logErr } = await admin.from("pack_opens").insert({
      profile_id: userId,
      pack_id,
      opened_at: nowIso(),
    });
    if (logErr) console.error("pack_opens insert error", logErr);

    // ---- RÉPONSE ----
    return new Response(
      JSON.stringify({
        card: pick,
        rarity: pick.rarity,
        cooldown_minutes: cdMinutes,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ error: "INTERNAL_ERROR", message: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
