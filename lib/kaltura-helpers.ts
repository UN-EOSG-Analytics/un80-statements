import { getVideoByAssetId, updateVideoEntryId } from "./turso";
import { extractKalturaId } from "./kaltura";

/**
 * Resolves an asset ID or Kaltura ID to an entry ID.
 * Checks Turso cache first, falls back to Kaltura API if needed.
 */
export async function resolveEntryId(assetId: string): Promise<string | null> {
  // Step 1: Check if we have it cached in videos table
  try {
    const cached = await getVideoByAssetId(assetId);
    if (cached?.entry_id) {
      return cached.entry_id;
    }
  } catch (error) {
    console.warn("Cache lookup failed:", error);
  }

  // Step 2: Extract Kaltura ID from asset ID
  const kalturaId = extractKalturaId(assetId);
  if (!kalturaId) {
    console.warn(`Could not extract Kaltura ID from: ${assetId}`);
    return null;
  }

  // Step 3: Call Kaltura API to resolve
  try {
    const response = await fetch(
      "https://cdnapisec.kaltura.com/api_v3/service/multirequest",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          "1": {
            service: "session",
            action: "startWidgetSession",
            widgetId: "_2503451",
          },
          "2": {
            service: "baseEntry",
            action: "list",
            ks: "{1:result:ks}",
            filter: { redirectFromEntryId: kalturaId },
            responseProfile: { type: 1, fields: "id" },
          },
          apiVersion: "3.3.0",
          format: 1,
          ks: "",
          clientTag: "html5:v3.17.30",
          partnerId: 2503451,
        }),
      },
    );

    if (!response.ok) {
      console.warn(`Kaltura API failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const entryId = data[1]?.objects?.[0]?.id;

    // Step 4: Save resolved entry_id back to cache for next time
    if (entryId) {
      try {
        await updateVideoEntryId(assetId, entryId);
      } catch (error) {
        console.warn("Failed to cache entry ID:", error);
      }
    }

    return entryId || null;
  } catch (error) {
    console.error("Failed to resolve entry ID:", error);
    return null;
  }
}
