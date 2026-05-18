// supabase/functions/crop-item-image/index.ts
// Deploy: supabase functions deploy crop-item-image --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ImageMagick,
  initializeImageMagick,
  MagickFormat,
  MagickGeometry,
} from "npm:@imagemagick/magick-wasm@0.0.30";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Load and initialize WASM once at module level
const wasmBytes = await Deno.readFile(
  new URL(
    "magick.wasm",
    import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.30"),
  ),
);
await initializeImageMagick(wasmBytes);

Deno.serve(async (req) => {
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
    const { item_id } = await req.json();

    if (!item_id) {
      return new Response(JSON.stringify({ error: "Missing item_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch item with crop data and source photo
    const { data: item, error: fetchError } = await supabase
      .from("closet_items")
      .select("id, user_id, photo_url, crop_x, crop_y, crop_width, crop_height")
      .eq("id", item_id)
      .single();

    if (fetchError || !item) {
      console.error("Item not found:", fetchError?.message);
      return new Response(JSON.stringify({ error: "Item not found", item_id }), {
        status: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Validate crop data exists
    if (item.crop_x == null || item.crop_y == null || item.crop_width == null || item.crop_height == null) {
      return new Response(JSON.stringify({ error: "No crop data for this item", item_id }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    if (!item.photo_url) {
      return new Response(JSON.stringify({ error: "No source photo URL", item_id }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Fetch the original photo
    const imageResponse = await fetch(item.photo_url);
    if (!imageResponse.ok) {
      console.error("Failed to fetch source image:", imageResponse.status);
      return new Response(JSON.stringify({ error: "Could not fetch source photo", item_id }), {
        status: 502,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const imageBytes = new Uint8Array(imageBuffer);

    // Process image with ImageMagick
    let croppedBytes: Uint8Array;
    try {
      croppedBytes = ImageMagick.read(imageBytes, (img): Uint8Array => {
        // Auto-orient to handle EXIF rotation
        img.autoOrient();

        const imgWidth = img.width;
        const imgHeight = img.height;

        // Convert normalized 0-1 coordinates to pixel values
        const pixelX = Math.round(item.crop_x * imgWidth);
        const pixelY = Math.round(item.crop_y * imgHeight);
        const pixelW = Math.round(item.crop_width * imgWidth);
        const pixelH = Math.round(item.crop_height * imgHeight);

        // Clamp to image bounds
        const safeX = Math.max(0, Math.min(pixelX, imgWidth - 1));
        const safeY = Math.max(0, Math.min(pixelY, imgHeight - 1));
        const safeW = Math.min(pixelW, imgWidth - safeX);
        const safeH = Math.min(pixelH, imgHeight - safeY);

        // Crop to bounding box
        const cropGeometry = new MagickGeometry(safeX, safeY, safeW, safeH);
        img.crop(cropGeometry);

        // Reset virtual canvas after crop

        // Resize to max 800px on longest edge
        const maxDim = 800;
        if (img.width > maxDim || img.height > maxDim) {
          if (img.width >= img.height) {
            const newH = Math.round((maxDim / img.width) * img.height);
            img.resize(maxDim, newH);
          } else {
            const newW = Math.round((maxDim / img.height) * img.width);
            img.resize(newW, maxDim);
          }
        }

        // Encode as JPEG (more reliable than WebP in WASM, still small at quality 80)
        img.quality = 80;
        return img.write(
          MagickFormat.Jpeg,
          (data) => new Uint8Array(data),
        );
      });
    } catch (imgErr) {
      console.error("Image processing failed:", imgErr);
      return new Response(JSON.stringify({ error: "Image crop failed", item_id, details: String(imgErr) }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Upload cropped image to Supabase Storage
    const cropFileName = `${item.user_id}/crops/${item_id}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("outfit-photos")
      .upload(cropFileName, croppedBytes.buffer, {
        contentType: "image/jpeg",
        upsert: true, // overwrite if re-cropping
      });

    if (uploadError) {
      console.error("Upload failed:", uploadError.message);
      return new Response(JSON.stringify({ error: "Failed to upload cropped image", item_id, details: uploadError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Get public URL for the cropped image
    const { data: urlData } = supabase.storage
      .from("outfit-photos")
      .getPublicUrl(cropFileName);

    const croppedPhotoUrl = urlData.publicUrl;

    // Update closet_items with the cropped URL
    const { error: updateError } = await supabase
      .from("closet_items")
      .update({ cropped_photo_url: croppedPhotoUrl })
      .eq("id", item_id);

    if (updateError) {
      console.error("DB update failed:", updateError.message);
      // Image was uploaded but DB not updated — log but still return URL
    }

    console.log(`Cropped item ${item_id}: ${croppedPhotoUrl}`);

    return new Response(
      JSON.stringify({
        item_id,
        cropped_photo_url: croppedPhotoUrl,
        status: "complete",
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
