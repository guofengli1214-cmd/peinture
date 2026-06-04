import { describe, it, expect, vi, afterEach } from "vitest";
import { renderTemplate, getByPath, extractUrl } from "./gradio";
import { ADAPTERS } from "./index";
import type { AdapterContext, ModelDef } from "./shared";

vi.mock("../gradio", () => ({
  runGradioTask: vi.fn(),
  uploadToGradio: vi.fn(),
  makeSessionHash: () => "sess-hash",
}));
import { runGradioTask, uploadToGradio } from "../gradio";

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

describe("Gradio format adapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  function gradioCtx(): AdapterContext {
    const model: ModelDef = {
      modelId: "z-image-turbo",
      name: "Z-Image Turbo",
      capabilities: ["image"],
      gradio: {
        baseUrl: "https://space.hf.space",
        fnIndex: 2,
        triggerId: 16,
        argsTemplate: ["$prompt", "$height", "$width", "$steps", "$seed", false],
        stepsDefault: 9,
        outputPath: "data[0]",
        seedPath: "data[1]",
      },
    };
    return { apiUrl: "", secret: null, model };
  }

  it("generate renders the template, calls the Space, and parses url + seed", async () => {
    (runGradioTask as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [{ url: "https://hf/out.png" }, 777] });

    const res = await ADAPTERS.gradio.generate!(gradioCtx(), { prompt: "a cat", aspectRatio: "1:1", seed: 42, steps: 9 });

    expect(res.url).toBe("https://hf/out.png");
    expect(res.seed).toBe(777); // read back from seedPath data[1]
    const [baseUrl, data, fnIndex, triggerId] = (runGradioTask as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(baseUrl).toBe("https://space.hf.space");
    expect(fnIndex).toBe(2);
    expect(triggerId).toBe(16);
    expect(data).toEqual(["a cat", expect.any(Number), expect.any(Number), 9, 42, false]);
  });

  it("upscale uploads the image then drives the Space", async () => {
    (uploadToGradio as ReturnType<typeof vi.fn>).mockResolvedValue("/tmp/up.png");
    (runGradioTask as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [{ url: "https://hf/big.png" }] });

    const ctx: AdapterContext = {
      apiUrl: "",
      secret: null,
      model: {
        modelId: "RealESRGAN_x4plus",
        name: "Upscaler",
        capabilities: ["upscale"],
        gradio: {
          baseUrl: "https://up.hf.space",
          fnIndex: 1,
          triggerId: 17,
          argsTemplate: ["$imageFile", "RealESRGAN_x4plus", 0.5, false, 4],
          outputPath: "data[0].url",
        },
      },
    };

    const res = await ADAPTERS.gradio.upscale!(ctx, new Blob([new Uint8Array([1, 2, 3])]));
    expect(res.url).toBe("https://hf/big.png");
    expect(uploadToGradio as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    const [, data] = (runGradioTask as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(data[0]).toEqual({ path: "/tmp/up.png", meta: { _type: "gradio.FileData" } });
  });
});
