import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "./app";
import type { AppContext } from "./context";

// Health does not touch the DB/crypto, so a minimal context is sufficient.
const ctx = {} as AppContext;

describe("app", () => {
  it("GET /api/health returns ok", async () => {
    const res = await request(createApp(ctx)).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("unknown /api routes return a JSON 404", async () => {
    const res = await request(createApp(ctx)).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });
});
