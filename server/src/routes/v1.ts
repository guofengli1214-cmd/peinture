import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import type { AppContext } from "../context";
import { createAuthMiddleware } from "../auth/middleware";
import { getProviderTokens, getPublicConfig, PROVIDER_IDS, type ProviderId } from "../services/userConfig";
import {
  REGISTRY,
  TOKEN_OPTIONAL_PROVIDERS,
  availableModels,
  toClientModels,
  customModelsToClient,
} from "../providers/models";
import { dispatchGenerate, dispatchEdit, dispatchText, dispatchUpscale, dispatchVideo } from "../providers/index";
import { effectiveForUser, parseModelsJson } from "../services/customProviders";

/**
 * Generation proxy. Reuses the frontend's /api/v1/* contract so the browser's
 * customService talks to us as a single "Server" provider. The browser never
 * sees provider tokens — we read them server-side per authenticated user.
 *
 * Phase 6a: models / generate / text / edit (HuggingFace, no token needed).
 * video / upscaler / task-status are stubbed pending Phase 6b.
 */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 8 },
});

/** Send a plain-text error so the frontend's customService surfaces the key as-is. */
function sendError(res: import("express").Response, status: number, msg: string) {
  res.status(status).type("text/plain").send(msg);
}

const generateSchema = z.object({
  model: z.string().min(1),
  prompt: z.string().min(1),
  ar: z.string().optional(),
  seed: z.number().nullish(),
  steps: z.number().nullish(),
  guidance: z.number().nullish(),
  enableHD: z.boolean().nullish(),
});

const textSchema = z.object({
  model: z.string().min(1),
  prompt: z.string().min(1),
});

export function createV1Router(ctx: AppContext): Router {
  const router = Router();
  const { requireAuth } = createAuthMiddleware(ctx);
  router.use(requireAuth);

  // GET /models — the models this user can use (HF always; others if tokened).
  router.get("/models", async (req, res) => {
    try {
      const userId = req.user!.id;
      const presence: Partial<Record<ProviderId, boolean>> = {};
      const providers = [...new Set(REGISTRY.map((m) => m.provider))];
      for (const p of providers) {
        if (TOKEN_OPTIONAL_PROVIDERS.includes(p)) continue;
        presence[p] = (await getProviderTokens(ctx, userId, p)).length > 0;
      }
      const models = availableModels((p) => !!presence[p]);

      // Append the user's custom / relay provider models (global + own, enabled).
      const customRecs = await effectiveForUser(ctx, userId);
      const customModels = customRecs.flatMap((r) =>
        customModelsToClient(r.id, parseModelsJson(r.modelsJson)),
      );

      res.json([...toClientModels(models), ...customModels]);
    } catch (e) {
      sendError(res, 500, (e as Error).message || "error_models_failed");
    }
  });

  // POST /generate — text2image
  router.post("/generate", async (req, res) => {
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "invalid_request");
    const d = parsed.data;
    try {
      const result = await dispatchGenerate(ctx, req.user!.id, d.model, {
        prompt: d.prompt,
        aspectRatio: d.ar ?? "1:1",
        seed: d.seed ?? undefined,
        steps: d.steps ?? undefined,
        guidance: d.guidance ?? undefined,
        enableHD: d.enableHD ?? false,
      });
      res.json(result);
    } catch (e) {
      sendError(res, 502, (e as Error).message || "generationFailed");
    }
  });

  // POST /text — prompt optimization
  router.post("/text", async (req, res) => {
    const parsed = textSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "invalid_request");
    try {
      const { systemPrompt } = await getPublicConfig(ctx, req.user!.id);
      const text = await dispatchText(ctx, req.user!.id, parsed.data.model, parsed.data.prompt, systemPrompt);
      res.json({ text });
    } catch (e) {
      sendError(res, 502, (e as Error).message || "error_prompt_optimization_failed");
    }
  });

  // POST /edit — image2image (multipart: image files + fields)
  router.post("/edit", upload.array("image", 8), async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const model = String(req.body.model ?? "");
    const prompt = String(req.body.prompt ?? "");
    if (!model || !prompt || files.length === 0) return sendError(res, 400, "invalid_request");
    try {
      const images = files.map((f) => new Blob([f.buffer], { type: f.mimetype || "image/png" }));
      const num = (v: unknown) => (v === undefined ? undefined : Number(v));
      const result = await dispatchEdit(ctx, req.user!.id, model, images, prompt, {
        width: num(req.body.width),
        height: num(req.body.height),
        steps: num(req.body.steps),
        guidance: num(req.body.guidance),
      });
      res.json(result);
    } catch (e) {
      sendError(res, 502, (e as Error).message || "generationFailed");
    }
  });

  // POST /upscaler — HD upscale (multipart: image file + model)
  router.post("/upscaler", upload.single("image"), async (req, res) => {
    const file = req.file as Express.Multer.File | undefined;
    const model = String(req.body.model ?? "");
    if (!model || !file) return sendError(res, 400, "invalid_request");
    try {
      const image = new Blob([file.buffer], { type: file.mimetype || "image/png" });
      const result = await dispatchUpscale(ctx, req.user!.id, model, image);
      res.json(result);
    } catch (e) {
      sendError(res, 502, (e as Error).message || "error_upscale_failed");
    }
  });

  // POST /video — image→video (multipart: image file + fields). HF is synchronous.
  router.post("/video", upload.single("image"), async (req, res) => {
    const file = req.file as Express.Multer.File | undefined;
    const model = String(req.body.model ?? "");
    if (!model || !file) return sendError(res, 400, "invalid_request");
    const num = (v: unknown, d: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : d;
    };
    try {
      const image = new Blob([file.buffer], { type: file.mimetype || "image/png" });
      const result = await dispatchVideo(ctx, req.user!.id, model, image, {
        prompt: String(req.body.prompt ?? ""),
        duration: num(req.body.duration, 3),
        steps: num(req.body.steps, 6),
        guidance: num(req.body.guidance, 1),
        seed: req.body.seed !== undefined ? num(req.body.seed, 42) : undefined,
      });
      res.json(result);
    } catch (e) {
      sendError(res, 502, (e as Error).message || "generationFailed");
    }
  });

  // Async task status — only built-in async providers use this (none yet); HF video is sync.
  router.get("/task-status", (_req, res) => res.json({ status: "failed", error: "feature_not_available" }));

  return router;
}

// Re-export for callers/tests that want the provider id list.
export { PROVIDER_IDS };
