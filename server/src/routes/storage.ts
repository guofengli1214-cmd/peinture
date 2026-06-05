import { Router } from "express";
import multer from "multer";
import type { AppContext } from "../context";
import { createAuthMiddleware } from "../auth/middleware";
import {
  deleteCloudFile,
  fetchCloudFile,
  listCloudFiles,
  renameCloudFile,
  uploadCloudFile,
} from "../services/storageProxy";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
});

function sendError(res: import("express").Response, status: number, error: string) {
  res.status(status).json({ error });
}

/** Routes for the admin-managed storage service used by all users. */
export function createStorageRouter(ctx: AppContext): Router {
  const router = Router();
  const { requireAuth } = createAuthMiddleware(ctx);
  router.use(requireAuth);

  router.get("/files", async (_req, res) => {
    try {
      res.json({ files: await listCloudFiles(ctx) });
    } catch (e) {
      sendError(res, 400, (e as Error).message || "storage_list_failed");
    }
  });

  router.get("/blob", async (req, res) => {
    const keyOrUrl = String(req.query.keyOrUrl || "");
    if (!keyOrUrl) return sendError(res, 400, "invalid_request");

    try {
      const blob = await fetchCloudFile(ctx, keyOrUrl);
      res.type(blob.contentType).send(blob.data);
    } catch (e) {
      sendError(res, 400, (e as Error).message || "storage_fetch_failed");
    }
  });

  router.post("/upload", upload.single("file"), async (req, res) => {
    const file = req.file;
    const fileName = String(req.body.fileName || file?.originalname || "");
    if (!file || !fileName) return sendError(res, 400, "invalid_request");

    try {
      const url = await uploadCloudFile(
        ctx,
        file.buffer,
        fileName,
        String(req.body.contentType || file.mimetype || "application/octet-stream"),
      );
      res.json({ url });
    } catch (e) {
      sendError(res, 400, (e as Error).message || "storage_upload_failed");
    }
  });

  router.delete("/file", async (req, res) => {
    const keyOrUrl = String((req.body ?? {}).keyOrUrl || "");
    if (!keyOrUrl) return sendError(res, 400, "invalid_request");

    try {
      await deleteCloudFile(ctx, keyOrUrl);
      res.json({ ok: true });
    } catch (e) {
      sendError(res, 400, (e as Error).message || "storage_delete_failed");
    }
  });

  router.post("/rename", async (req, res) => {
    const oldKeyOrUrl = String((req.body ?? {}).oldKeyOrUrl || "");
    const newKeyOrUrl = String((req.body ?? {}).newKeyOrUrl || "");
    if (!oldKeyOrUrl || !newKeyOrUrl) return sendError(res, 400, "invalid_request");

    try {
      await renameCloudFile(ctx, oldKeyOrUrl, newKeyOrUrl);
      res.json({ ok: true });
    } catch (e) {
      sendError(res, 400, (e as Error).message || "storage_rename_failed");
    }
  });

  return router;
}
