import { NextResponse } from "next/server";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { shopItem, type ShopCategory } from "@/lib/shop";

const SLOT: Record<ShopCategory, string> = {
  name: "equipped_name_effect",
  ring: "equipped_ring_effect",
  overlay: "equipped_overlay_effect",
};

/**
 * Equip or unequip a cosmetic.
 *
 * `item_id: null` clears the slot named by `category`. Ownership is checked
 * here for a clean error message, and again by the `enforce_equipped_ownership`
 * trigger, which is what actually holds if someone PATCHes their profile row
 * directly.
 */
export async function POST(req: Request) {
  try {
    const user = await getRouteUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { item_id, category } = (await req.json()) as {
      item_id?: unknown;
      category?: unknown;
    };

    const limit = rateLimit(`shop:equip:${user.id}`, 40, 60_000);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    const supabase = getServiceSupabase();
    if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 500 });

    // Unequipping names the slot directly, since there is no item to look up.
    if (item_id === null) {
      if (typeof category !== "string" || !(category in SLOT)) {
        return NextResponse.json({ error: "Unknown slot." }, { status: 400 });
      }
      const column = SLOT[category as ShopCategory];
      const { error } = await supabase
        .from("profiles")
        .update({ [column]: null })
        .eq("id", user.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, category, item_id: null });
    }

    if (typeof item_id !== "string" || !item_id) {
      return NextResponse.json({ error: "Pick an item." }, { status: 400 });
    }

    const item = shopItem(item_id);
    if (!item) return NextResponse.json({ error: "Unknown item." }, { status: 404 });

    const { data: owned } = await supabase
      .from("user_shop_items")
      .select("item_id")
      .eq("user_id", user.id)
      .eq("item_id", item.id)
      .maybeSingle();
    if (!owned) {
      return NextResponse.json({ error: "You don't own that yet." }, { status: 403 });
    }

    const { error } = await supabase
      .from("profiles")
      .update({ [SLOT[item.category]]: item.id })
      .eq("id", user.id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, category: item.category, item_id: item.id });
  } catch (err) {
    console.error("Shop equip error:", err);
    return NextResponse.json({ error: "Could not change that." }, { status: 500 });
  }
}

/** The signed-in user's inventory, for the storefront's Owned/Equip states. */
export async function GET(req: Request) {
  try {
    const user = await getRouteUser(req);
    if (!user) return NextResponse.json({ owned: [], equipped: {} });

    const supabase = getServiceSupabase();
    if (!supabase) return NextResponse.json({ owned: [], equipped: {} });

    const [{ data: rows }, { data: profile }] = await Promise.all([
      supabase.from("user_shop_items").select("item_id").eq("user_id", user.id),
      supabase
        .from("profiles")
        .select("equipped_name_effect, equipped_ring_effect, equipped_overlay_effect")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    return NextResponse.json({
      owned: (rows ?? []).map((r) => r.item_id as string),
      equipped: {
        name: profile?.equipped_name_effect ?? null,
        ring: profile?.equipped_ring_effect ?? null,
        overlay: profile?.equipped_overlay_effect ?? null,
      },
    });
  } catch {
    return NextResponse.json({ owned: [], equipped: {} });
  }
}
