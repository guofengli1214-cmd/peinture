import type { ProviderFormat } from "../../repositories/types";
import { type FormatAdapter, type ImageParams } from "./shared";
import { openaiAdapter } from "./openai";
import { claudeAdapter } from "./claude";
import { geminiAdapter } from "./gemini";
import { gradioAdapter } from "./gradio";

export type { FormatAdapter, ImageParams };

/** Format → client. Used by the generation dispatch to talk to custom/relay endpoints. */
export const ADAPTERS: Record<ProviderFormat, FormatAdapter> = {
  openai: openaiAdapter,
  claude: claudeAdapter,
  gemini: geminiAdapter,
  gradio: gradioAdapter,
};
