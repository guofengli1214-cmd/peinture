import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteS3Object,
  listS3Files,
  uploadS3Object,
  type S3Config,
} from "./storageProxy";

const baseConfig: S3Config = {
  accessKeyId: "AK",
  secretAccessKey: "SK",
  bucket: "ai-photo-edit-2",
  region: "ap-southeast-1",
  endpoint: "https://ai-photo-edit-2.s3.ap-southeast-1.qiniucs.com",
  publicDomain: "https://aiphotoeditstatic.forevernewbie.com",
  prefix: "peinture/",
};

describe("storageProxy S3-compatible endpoints", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses virtual-hosted Qiniu endpoint without duplicating the bucket in object URLs", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: "OK" });
    vi.stubGlobal("fetch", fetchMock);

    const url = await uploadS3Object(
      baseConfig,
      Buffer.from("hello"),
      "sample.png",
      "image/png",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://ai-photo-edit-2.s3.ap-southeast-1.qiniucs.com/peinture/sample.png",
    );
    expect(fetchMock.mock.calls[0][0]).not.toContain("/ai-photo-edit-2/peinture/");
    expect(url).toBe("https://aiphotoeditstatic.forevernewbie.com/peinture/sample.png");
  });

  it("uses path-style URLs when the endpoint is not already bucket-hosted", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, statusText: "OK" });
    vi.stubGlobal("fetch", fetchMock);

    await deleteS3Object(
      {
        ...baseConfig,
        endpoint: "https://s3.ap-southeast-1.qiniucs.com",
        publicDomain: "",
      },
      "sample.png",
    );

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://s3.ap-southeast-1.qiniucs.com/ai-photo-edit-2/peinture/sample.png",
    );
  });

  it("lists image and video objects with the configured public domain", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => `
        <ListBucketResult>
          <Contents>
            <Key>peinture/a.png</Key>
            <LastModified>2026-06-05T10:00:00.000Z</LastModified>
            <Size>12</Size>
          </Contents>
          <Contents>
            <Key>peinture/b.mp4</Key>
            <LastModified>2026-06-05T10:01:00.000Z</LastModified>
            <Size>34</Size>
          </Contents>
          <Contents>
            <Key>peinture/right-code-input-123.png</Key>
            <LastModified>2026-06-05T10:01:30.000Z</LastModified>
            <Size>40</Size>
          </Contents>
          <Contents>
            <Key>peinture/c.txt</Key>
            <LastModified>2026-06-05T10:02:00.000Z</LastModified>
            <Size>56</Size>
          </Contents>
        </ListBucketResult>
      `,
    });
    vi.stubGlobal("fetch", fetchMock);

    const files = await listS3Files(baseConfig);

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://ai-photo-edit-2.s3.ap-southeast-1.qiniucs.com?list-type=2&prefix=peinture%2F",
    );
    expect(files).toEqual([
      {
        key: "peinture/a.png",
        lastModified: new Date("2026-06-05T10:00:00.000Z"),
        size: 12,
        url: "https://aiphotoeditstatic.forevernewbie.com/peinture/a.png",
        type: "image",
      },
      {
        key: "peinture/b.mp4",
        lastModified: new Date("2026-06-05T10:01:00.000Z"),
        size: 34,
        url: "https://aiphotoeditstatic.forevernewbie.com/peinture/b.mp4",
        type: "video",
      },
    ]);
  });
});
