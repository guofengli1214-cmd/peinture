import type { AppConfig } from "./config";
import type { Crypto } from "./crypto";
import type { Repositories } from "./repositories/types";

/**
 * Shared dependencies passed to route factories. Built from MySQL repositories
 * in production (src/index.ts) and from in-memory repositories in tests.
 */
export interface AppContext {
  config: AppConfig;
  crypto: Crypto;
  repos: Repositories;
}
