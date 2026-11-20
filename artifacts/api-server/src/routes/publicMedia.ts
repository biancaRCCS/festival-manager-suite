import { Router, type IRouter } from "express";
import { GetFestivalPublicMediaParams } from "@workspace/api-zod";

const router: IRouter = Router();

// Only these public festival assets can be signed. No private or arbitrary paths.
router.get("/storage/public-objects/:fileName", async (req, res): Promise<void> => {
  const parsed = GetFestivalPublicMediaParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(404).json({ error: "Public media not found." });
    return;
  }
  const publicPath = process.env.PUBLIC_OBJECT_SEARCH_PATHS?.split(",")[0]?.trim();
  const [bucketName, ...prefix] = (publicPath ?? "").replace(/^\/+/, "").split("/");
  if (!bucketName || !prefix.length) {
    res.status(503).json({ error: "Public media storage is not configured." });
    return;
  }
  try {
    // Use the App Storage sidecar signing protocol. The video is served directly
    // by storage, which supports byte ranges, seeking, and content-length.
    const signed = await fetch("http://127.0.0.1:1106/object-storage/signed-object-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: bucketName,
        object_name: `${prefix.join("/")}/${parsed.data.fileName}`,
        method: "GET",
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!signed.ok) throw new Error(`Media storage returned ${signed.status}`);
    const result = await signed.json() as { signed_url?: string };
    if (!result.signed_url?.startsWith("https://storage.googleapis.com/")) {
      throw new Error("Media storage returned an invalid URL");
    }
    res.setHeader("Cache-Control", "no-store");
    res.redirect(302, result.signed_url);
  } catch (error) {
    req.log.error({ err: error }, "Could not serve public festival media");
    res.status(503).json({ error: "Festival media is temporarily unavailable." });
  }
});

export default router;
