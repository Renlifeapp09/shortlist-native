// supabase/functions/analyze-outfit/index.ts
// Deploy: supabase functions deploy analyze-outfit --no-verify-jwt

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.177.0/encoding/base64.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Gemini 2.5 Flash Lite endpoint
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

const SYSTEM_PROMPT = `You are a wardrobe analysis assistant for a clothing tracking app called The Shortlist.

Analyze the outfit photo and provide THREE things:

## 1. ITEM IDENTIFICATION WITH BOUNDING BOXES
Identify EVERY distinct CLOTHING item the person is wearing and provide a bounding box for each.

INCLUDE: shirts, pants, shorts, jackets, coats, vests, sweaters, hoodies, dresses, skirts, shoes, sneakers, boots, hats, scarves, belts, bags, jewelry, watches, sunglasses.

EXCLUDE: phones, cameras, electronics, furniture, backgrounds, mirrors, other people, body parts, grooming items.

For each item, return:
- name: a short, natural name (e.g. "Navy blazer", "White sneakers", "Black skinny jeans")
- category: one of [Tops, Bottoms, Outerwear, Footwear, Accessories, Dresses]
- color: the primary color(s)
- description: one sentence about the item (material, fit, style)
- crop_x: left edge of bounding box as a decimal from 0 to 1 (fraction of image width)
- crop_y: top edge of bounding box as a decimal from 0 to 1 (fraction of image height)
- crop_width: width of bounding box as a decimal from 0 to 1 (fraction of image width)
- crop_height: height of bounding box as a decimal from 0 to 1 (fraction of image height)

The bounding box should tightly frame just that item with a small margin. Be precise — these coordinates will be used to crop the image.

Be specific with names. "Blue jeans" not just "pants". "White leather sneakers" not just "shoes". If you can identify the brand, include it in the name.

## 2. OUTFIT ANALYSIS
Evaluate the outfit as a whole:
- style_cohesion: 1-5 score for how well the pieces work together as an outfit
- color_harmony: 1-5 score for how the colors relate and complement each other
- formality: one of [casual, smart-casual, business-casual, business, formal]
- style_note: one sentence observation about the outfit as a whole (what works, what the vibe is — be constructive and specific, not generic)
- outfit_tags: 2-4 short tags describing the outfit style (e.g. "monochrome", "layered", "weekend-ready", "minimalist", "athleisure", "polished", "relaxed", "tailored", "streetwear", "classic")

Return ONLY valid JSON — no markdown, no backticks, no explanation. Format:
{
  "items": [
    {
      "name": "...",
      "category": "...",
      "color": "...",
      "description": "...",
      "crop_x": 0.15,
      "crop_y": 0.05,
      "crop_width": 0.70,
      "crop_height": 0.40
    }
  ],
  "outfit": {
    "style_cohesion": 4,
    "color_harmony": 3,
    "formality": "casual",
    "style_note": "...",
    "outfit_tags": ["relaxed", "neutral-palette"]
  }
}`;

serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { photo_url, outfit_log_id, user_id } = await req.json();

    if (!photo_url || !outfit_log_id || !user_id) {
      return new Response(JSON.stringify({ error: "Missing photo_url, outfit_log_id, or user_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Fetch the image from Supabase Storage
    const imageResponse = await fetch(photo_url);
    if (!imageResponse.ok) {
      console.error("Failed to fetch image:", imageResponse.status, await imageResponse.text());
      return new Response(JSON.stringify({ error: "Could not fetch outfit photo" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
    const imageBuffer = await imageResponse.arrayBuffer();

    // Convert to base64
    const base64Image = base64Encode(new Uint8Array(imageBuffer));

    // Detect MIME from response or URL
    let mimeType = imageResponse.headers.get("content-type")?.split(";")[0]?.trim() || "";
    if (!mimeType || mimeType === "application/octet-stream") {
      const ext = photo_url.split(".").pop()?.toLowerCase() || "jpg";
      const mimeMap: Record<string, string> = {
        jpg: "image/jpeg", jpeg: "image/jpeg",
        png: "image/png", heic: "image/heic",
        webp: "image/webp",
      };
      mimeType = mimeMap[ext] || "image/jpeg";
    }

    // Call Gemini 2.5 Flash Lite with vision
    const geminiResponse = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: SYSTEM_PROMPT },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Image,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error("Gemini error:", errText);
      return new Response(JSON.stringify({ error: "AI analysis failed", details: errText }), {
        status: 502,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const geminiData = await geminiResponse.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    // Log token usage for cost monitoring
    const tokenUsage = geminiData?.usageMetadata;
    if (tokenUsage) {
      console.log(`Gemini tokens — prompt: ${tokenUsage.promptTokenCount}, completion: ${tokenUsage.candidatesTokenCount}, total: ${tokenUsage.totalTokenCount}`);
    }

    // Parse the JSON response
    let items: any[] = [];
    let outfitAnalysis: any = null;
    try {
      const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);

      // Handle both old format (array) and new format (object with items + outfit)
      if (Array.isArray(parsed)) {
        items = parsed;
      } else {
        items = parsed.items || [];
        outfitAnalysis = parsed.outfit || null;
      }
    } catch {
      console.error("Failed to parse Gemini response:", rawText);
      return new Response(JSON.stringify({ error: "Failed to parse AI response", raw: rawText }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Auto-create closet items in Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const createdItems: any[] = [];

    // Deduplicate items by name (case-insensitive)
    const seen = new Set<string>();
    const uniqueItems = items.filter((item: any) => {
      const key = item.name.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const processedIds = new Set<string>();

    for (const item of uniqueItems) {
      // Check if a similar item already exists (same name, same user)
      const { data: existing } = await supabase
        .from("closet_items")
        .select("id, name, wear_count")
        .eq("user_id", user_id)
        .eq("status", "active")
        .ilike("name", item.name)
        .maybeSingle();

      if (existing) {
        if (!processedIds.has(existing.id)) {
          processedIds.add(existing.id);
          // Only update last_worn — wear_count is handled by the wear_logs trigger
          await supabase
            .from("closet_items")
            .update({ last_worn: new Date().toISOString().split("T")[0] })
            .eq("id", existing.id);
        }
        createdItems.push({ id: existing.id, name: existing.name, status: "existing" });
      } else {
        // Validate bounding box values (must be 0-1 range)
        const cropX = (typeof item.crop_x === "number" && item.crop_x >= 0 && item.crop_x <= 1) ? item.crop_x : null;
        const cropY = (typeof item.crop_y === "number" && item.crop_y >= 0 && item.crop_y <= 1) ? item.crop_y : null;
        const cropW = (typeof item.crop_width === "number" && item.crop_width > 0 && item.crop_width <= 1) ? item.crop_width : null;
        const cropH = (typeof item.crop_height === "number" && item.crop_height > 0 && item.crop_height <= 1) ? item.crop_height : null;

        // Create new closet item with bounding box and outfit_log_id
        const { data: newItem, error: insertError } = await supabase
          .from("closet_items")
          .insert({
            user_id: user_id,
            name: item.name,
            category: item.category || "Tops",
            color: item.color || null,
            description: item.description || null,
            photo_url: photo_url,
            status: "active",
            wear_count: 0,
            last_worn: new Date().toISOString().split("T")[0],
            outfit_log_id: outfit_log_id,
            crop_x: cropX,
            crop_y: cropY,
            crop_width: cropW,
            crop_height: cropH,
          })
          .select("id, name, crop_x, crop_y, crop_width, crop_height")
          .single();

        if (insertError) {
          console.error("Insert error:", insertError.message);
        } else {
          createdItems.push({
            id: newItem.id,
            name: newItem.name,
            status: "created",
            has_crop_data: cropX !== null && cropY !== null && cropW !== null && cropH !== null,
          });
        }
      }
    }

    // Update outfit_log with linked item IDs AND outfit-level analysis
    const itemIds = createdItems.map(i => i.id);
    const outfitUpdate: any = { items: itemIds };

    if (outfitAnalysis) {
      if (outfitAnalysis.style_cohesion) outfitUpdate.style_cohesion = outfitAnalysis.style_cohesion;
      if (outfitAnalysis.color_harmony) outfitUpdate.color_harmony = outfitAnalysis.color_harmony;
      if (outfitAnalysis.formality) outfitUpdate.formality = outfitAnalysis.formality;
      if (outfitAnalysis.style_note) outfitUpdate.style_note = outfitAnalysis.style_note;
      if (outfitAnalysis.outfit_tags) outfitUpdate.outfit_tags = outfitAnalysis.outfit_tags;
    }

    await supabase
      .from("outfit_logs")
      .update(outfitUpdate)
      .eq("id", outfit_log_id);

    // Create wear_logs for each item
    const wearLogs = createdItems.map(item => ({
      user_id: user_id,
      closet_item_id: item.id,
      outfit_log_id: outfit_log_id,
      worn_date: new Date().toISOString().split("T")[0],
    }));

    if (wearLogs.length > 0) {
      await supabase.from("wear_logs").insert(wearLogs);
    }

    // Return items with crop data so client can trigger crop-item-image calls
    const itemsNeedingCrop = createdItems.filter(i => i.status === "created" && i.has_crop_data);

    return new Response(
      JSON.stringify({
        items_identified: items.length,
        items_created: createdItems.filter(i => i.status === "created").length,
        items_existing: createdItems.filter(i => i.status === "existing").length,
        items: createdItems,
        items_needing_crop: itemsNeedingCrop.map(i => i.id),
        outfit_analysis: outfitAnalysis,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
