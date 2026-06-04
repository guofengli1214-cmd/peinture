import { describe, it, expect } from "vitest";
import { renderTemplate, getByPath, extractUrl } from "./gradio";

describe("renderTemplate", () => {
  it("substitutes $vars and leaves literals untouched", () => {
    const out = renderTemplate(["$prompt", "$height", "$width", "$steps", "$seed", false], {
      prompt: "a cat",
      height: 1024,
      width: 768,
      steps: 9,
      seed: 42,
    });
    expect(out).toEqual(["a cat", 1024, 768, 9, 42, false]);
  });

  it("recurses into nested arrays/objects (edit payload)", () => {
    const out = renderTemplate(["$imagePayload", "$prompt", 3], {
      imagePayload: [{ image: { path: "/tmp/x" }, caption: null }],
      prompt: "p",
    });
    expect(out).toEqual([[{ image: { path: "/tmp/x" }, caption: null }], "p", 3]);
  });

  it("throws on a missing variable", () => {
    expect(() => renderTemplate(["$prompt"], {})).toThrow("gradio_template_var_missing:prompt");
  });
});

describe("getByPath", () => {
  it("reads bracket + dot paths", () => {
    const root = { data: [{ url: "u0" }, 42] };
    expect(getByPath(root, "data[0].url")).toBe("u0");
    expect(getByPath(root, "data[1]")).toBe(42);
  });

  it("reads deeply nested array paths", () => {
    const root = { data: [[{ image: { url: "deep" } }]] };
    expect(getByPath(root, "data[0][0].image.url")).toBe("deep");
  });

  it("returns undefined for a broken path", () => {
    expect(getByPath({ data: [] }, "data[0].url")).toBeUndefined();
  });
});

describe("extractUrl", () => {
  it("handles {url}, {image:{url}}, array, and string shapes", () => {
    expect(extractUrl({ url: "a" })).toBe("a");
    expect(extractUrl({ image: { url: "b" } })).toBe("b");
    expect(extractUrl([{ image: { url: "c" } }])).toBe("c");
    expect(extractUrl("d")).toBe("d");
    expect(extractUrl({ video: { url: "v" } })).toBe("v");
    expect(extractUrl({})).toBeUndefined();
  });
});
