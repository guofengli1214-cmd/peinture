/**
 * Gradio format adapter — drives any Gradio Space from a DB-stored config
 * (baseUrl / fnIndex / triggerId / argsTemplate / outputPath). The args
 * template uses a tiny DSL: "$var" strings are substituted from runtime values,
 * everything else is passed through literally.
 */

/** Render a Gradio args template: "$var" → vars[var]; everything else literal. */
export function renderTemplate(template: unknown[], vars: Record<string, unknown>): unknown[] {
  return template.map((el) => renderValue(el, vars));
}

function renderValue(el: unknown, vars: Record<string, unknown>): unknown {
  if (typeof el === "string" && el.startsWith("$")) {
    const key = el.slice(1);
    if (!(key in vars)) throw new Error(`gradio_template_var_missing:${key}`);
    return vars[key];
  }
  if (Array.isArray(el)) return el.map((x) => renderValue(x, vars));
  if (el && typeof el === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(el as Record<string, unknown>)) out[k] = renderValue(v, vars);
    return out;
  }
  return el;
}

/** Read a value from a nested object by a path like "data[0].image.url". */
export function getByPath(root: unknown, path: string): unknown {
  const keys = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let cur: unknown = root;
  for (const k of keys) {
    if (cur == null) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/** Extract an image/file/video url from common Gradio output shapes. */
export function extractUrl(first: unknown): string | undefined {
  if (Array.isArray(first) && (first[0] as { image?: { url?: string } })?.image?.url) {
    return (first[0] as { image: { url: string } }).image.url;
  }
  const f = first as { image?: { url?: string }; url?: string; video?: { url?: string } };
  if (f?.image?.url) return f.image.url;
  if (f?.video?.url) return f.video.url;
  if (f?.url) return f.url;
  if (typeof first === "string") return first;
  return undefined;
}
