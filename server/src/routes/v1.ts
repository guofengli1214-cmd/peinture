import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import type { AppContext } from "../context";
import { createAuthMiddleware } from "../auth/middleware";
import { getPublicConfig, PROVIDER_IDS } from "../services/userConfig";
import { customModelsToClient } from "../providers/models";
import {
  dispatchGenerate,
  dispatchEdit,
  dispatchText,
  dispatchUpscale,
  dispatchVideo,
  type GenerateResult,
} from "../providers/index";
import { effectiveForUser, parseModelsJson } from "../services/customProviders";
import { normalizeUpstreamErrorMessage } from "../providers/formats/shared";

/**
 * Generation proxy. Reuses the frontend's /api/v1/* contract so the browser's
 * customService talks to us as a single "Server" provider. The browser never
 * sees provider tokens — we read them server-side per authenticated user.
 *
 * Phase 6a: models / generate / text / edit (HuggingFace, no token needed).
 * Long-running image generation is exposed as a short submit request plus
 * polling. This keeps reverse proxies / tunnels from holding one POST open for
 * the full upstream generation time.
 */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 8 },
});

/** Send a plain-text error so the frontend's customService surfaces the key as-is. */
function sendError(res: import("express").Response, status: number, msg: string) {
  res.status(status).type("text/plain").send(msg);
}

type ImageTask =
  | { status: "processing"; createdAt: number; userId: number }
  | { status: "success"; createdAt: number; userId: number; result: GenerateResult }
  | { status: "failed"; createdAt: number; userId: number; error: string };

const imageTasks = new Map<string, ImageTask>();
const IMAGE_TASK_TTL_MS = 30 * 60 * 1000;

function rememberTask(taskId: string, task: ImageTask) {
  imageTasks.set(taskId, task);
  const timer = setTimeout(() => imageTasks.delete(taskId), IMAGE_TASK_TTL_MS);
  timer.unref?.();
}

function errorMessage(err: unknown): string {
  const message = (err as Error)?.message || "generationFailed";
  return normalizeUpstreamErrorMessage(message);
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

  // GET /models — the models this user can use (from DB-driven custom/global providers).
  router.get("/models", async (req, res) => {
    try {
      const userId = req.user!.id;
      // The user's custom / relay provider models (global + own, enabled).
      const customRecs = await effectiveForUser(ctx, userId);
      const models = customRecs.flatMap((r) =>
        customModelsToClient(r.id, parseModelsJson(r.modelsJson), r.name),
      );
      res.json(models);
    } catch (e) {
      sendError(res, 500, (e as Error).message || "error_models_failed");
    }
  });

  // POST /generate — text2image task submit
  router.post("/generate", async (req, res) => {
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "invalid_request");
    const d = parsed.data;
    const userId = req.user!.id;
    const taskId = crypto.randomUUID();
    rememberTask(taskId, { status: "processing", createdAt: Date.now(), userId });

    void (async () => {
      try {
        const result = await dispatchGenerate(ctx, userId, d.model, {
          prompt: d.prompt,
          aspectRatio: d.ar ?? "1:1",
          seed: d.seed ?? undefined,
          steps: d.steps ?? undefined,
          guidance: d.guidance ?? undefined,
          enableHD: d.enableHD ?? false,
        });
        rememberTask(taskId, { status: "success", createdAt: Date.now(), userId, result });
      } catch (e) {
        console.error("[v1/generate] task failed", taskId, e);
        rememberTask(taskId, { status: "failed", createdAt: Date.now(), userId, error: errorMessage(e) });
      }
    })();

    res.status(202).json({ taskId, status: "processing" });
  });

  // POST /generate-sync — test/local escape hatch for direct text2image.
  router.post("/generate-sync", async (req, res) => {
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
      console.error("[v1/generate-sync] failed", e);
      sendError(res, 502, errorMessage(e));
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
    const images = files.map((f) => new Blob([f.buffer], { type: f.mimetype || "image/png" }));
    const num = (v: unknown) => (v === undefined ? undefined : Number(v));
    const userId = req.user!.id;
    const taskId = crypto.randomUUID();
    rememberTask(taskId, { status: "processing", createdAt: Date.now(), userId });

    void (async () => {
      try {
        const result = await dispatchEdit(ctx, userId, model, images, prompt, {
          width: num(req.body.width),
          height: num(req.body.height),
          steps: num(req.body.steps),
          guidance: num(req.body.guidance),
        });
        rememberTask(taskId, { status: "success", createdAt: Date.now(), userId, result });
      } catch (e) {
        console.error("[v1/edit] task failed", {
          taskId,
          model,
          imageCount: files.length,
          imageBytes: files.map((f) => f.size),
          promptChars: prompt.length,
          error: e,
        });
        rememberTask(taskId, { status: "failed", createdAt: Date.now(), userId, error: errorMessage(e) });
      }
    })();

    res.status(202).json({ taskId, status: "processing" });
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

  router.get("/task-status", (req, res) => {
    const taskId = String(req.query.taskId ?? "");
    const task = imageTasks.get(taskId);
    if (!task) return res.status(404).json({ status: "failed", error: "task_not_found" });
    if (task.userId !== req.user!.id) return res.status(404).json({ status: "failed", error: "task_not_found" });
    if (task.status === "processing") return res.json({ status: "processing" });
    if (task.status === "failed") return res.json({ status: "failed", error: task.error });
    return res.json({ status: "success", ...task.result });
  });

  return router;
}

// Re-export for callers/tests that want the provider id list.
export { PROVIDER_IDS };
