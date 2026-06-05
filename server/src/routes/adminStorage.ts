import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../context";
import { createAuthMiddleware } from "../auth/middleware";
import {
  getAdminSystemStorage,
  updateSystemStorage,
  type StorageType,
} from "../services/systemStorage";

const storageTypeSchema = z.enum(["off", "s3", "webdav", "opfs"]);

const storagePatchSchema = z.object({
  storageType: storageTypeSchema.optional(),
  s3Config: z
    .object({
      accessKeyId: z.string().optional(),
      secretAccessKey: z.string().optional(),
      bucket: z.string().optional(),
      region: z.string().optional(),
      endpoint: z.string().optional(),
      publicDomain: z.string().optional(),
      prefix: z.string().optional(),
    })
    .optional(),
  webdavConfig: z
    .object({
      url: z.string().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
      directory: z.string().optional(),
    })
    .optional(),
});

/** Admin-only system storage configuration. */
export function createAdminStorageRouter(ctx: AppContext): Router {
  const router = Router();
  const { requireAdmin } = createAuthMiddleware(ctx);
  router.use(requireAdmin);

  router.get("/storage", async (_req, res) => {
    res.json({ storage: await getAdminSystemStorage(ctx) });
  });

  router.put("/storage", async (req, res) => {
    const parsed = storagePatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }

    const storage = await updateSystemStorage(ctx, {
      ...parsed.data,
      storageType: parsed.data.storageType as StorageType | undefined,
    });
    res.json({ storage });
  });

  return router;
}
