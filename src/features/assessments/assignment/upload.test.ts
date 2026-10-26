import ReactNativeBlobUtil from "react-native-blob-util";
import type { ApiClient } from "../../../api/client";
import { isApiError } from "../../../api/vendor/client/errors";
import { blobPath, putHeaders, submissionMimeType, uploadSubmissionFile, validateSubmissionFile } from "./upload";

jest.mock("react-native-blob-util", () => ({
  __esModule: true,
  default: { fetch: jest.fn(), wrap: (p: string) => `RNFetchBlob-file://${p}`, fs: { dirs: { CacheDir: "/cache" } } },
}));

const blobFetch = ReactNativeBlobUtil.fetch as unknown as jest.Mock;

/** A stand-in for blob-util's StatefulPromise. */
function task(status: number, progress: Array<[number, number]> = []) {
  let cb: ((s: number, t: number) => void) | null = null;
  const p = Promise.resolve().then(() => {
    for (const [s, t] of progress) cb?.(s, t);
    return { info: () => ({ status }) };
  }) as Promise<{ info: () => { status: number } }> & { uploadProgress: jest.Mock; cancel: jest.Mock };
  p.uploadProgress = jest.fn((_cfg: unknown, fn: (s: number, t: number) => void) => {
    cb = fn;
    return p;
  });
  p.cancel = jest.fn();
  return p;
}

const ticket = { uploadId: "up_1", put: { url: "https://bucket.example/obj?sig=1", method: "PUT", headers: { "Content-Type": "application/pdf", Host: "bucket.example", "Content-Length": "9" }, expiresAt: "" } };

function fakeApi() {
  const request = jest.fn(async (method: string, path: string) => {
    if (method === "POST" && path === "/media/uploads") return ticket;
    if (method === "POST" && path.endsWith("/complete")) return { id: "up_1", fileName: "essay.pdf" };
    return undefined;
  });
  return { api: { http: { request } } as unknown as ApiClient, request };
}

describe("upload paths", () => {
  it("turns file URIs into decoded paths and keeps content URIs", () => {
    expect(blobPath("file:///var/mobile/Containers/Data/tmp/My%20Essay.pdf")).toBe("/var/mobile/Containers/Data/tmp/My Essay.pdf");
    expect(blobPath("content://com.android.providers.downloads/document/12")).toBe("content://com.android.providers.downloads/document/12");
    expect(blobPath("/already/a/path.pdf")).toBe("/already/a/path.pdf");
    expect(blobPath("file:///bad%E0%A4%A.pdf")).toBe("/bad%E0%A4%A.pdf");
  });

  it("keeps presigned headers except the ones the platform sets, and adds the type when unsigned", () => {
    expect(putHeaders(ticket.put, "application/pdf")).toEqual({ "Content-Type": "application/pdf" });
    expect(putHeaders({ ...ticket.put, headers: {} }, "image/png")).toEqual({ "Content-Type": "image/png" });
  });
});

describe("upload validation", () => {
  it("uses the vendored limits per kind", () => {
    expect(validateSubmissionFile({ name: "essay.pdf", size: 1000, type: "application/pdf" })).toBeNull();
    expect(validateSubmissionFile({ name: "essay.pdf", size: 26 * 1024 * 1024, type: "application/pdf" })).toMatch(/25 MB/);
    expect(validateSubmissionFile({ name: "photo.heic", size: 1000, type: null })).toBeNull();
    expect(validateSubmissionFile({ name: "page.html", size: 10, type: "text/html" })).toMatch(/not allowed/);
    expect(validateSubmissionFile({ name: "run.exe", size: 10, type: "application/x-msdownload" })).toMatch(/not supported/);
    expect(validateSubmissionFile({ name: "empty.pdf", size: 0, type: "application/pdf" })).toMatch(/empty/);
  });

  it("accepts zip archives up to the server's 50 MB", () => {
    expect(submissionMimeType({ name: "code.zip", type: "application/octet-stream" })).toBe("application/zip");
    expect(validateSubmissionFile({ name: "code.zip", size: 40 * 1024 * 1024, type: null })).toBeNull();
    expect(validateSubmissionFile({ name: "code.zip", size: 51 * 1024 * 1024, type: "application/zip" })).toMatch(/50 MB/);
  });
});

describe("uploadSubmissionFile", () => {
  beforeEach(() => blobFetch.mockReset());

  it("asks for a ticket, streams the file with progress, then completes", async () => {
    const { api, request } = fakeApi();
    blobFetch.mockImplementation(() => task(200, [[5, 10], [10, 10]]));
    const progress: number[] = [];
    const media = await uploadSubmissionFile(api, { uri: "file:///tmp/My%20Essay.pdf", name: "essay.pdf", size: 10, type: "application/pdf" }, (f) => progress.push(f)).promise;
    expect(media).toEqual({ id: "up_1", fileName: "essay.pdf" });
    expect(request).toHaveBeenCalledWith("POST", "/media/uploads", { body: { purpose: "SUBMISSION", fileName: "essay.pdf", mimeType: "application/pdf", sizeBytes: 10 } });
    expect(blobFetch).toHaveBeenCalledWith("PUT", ticket.put.url, { "Content-Type": "application/pdf" }, "RNFetchBlob-file:///tmp/My Essay.pdf");
    expect(request).toHaveBeenCalledWith("POST", "/media/uploads/up_1/complete");
    expect(progress).toEqual([0.5, 1, 1]);
  });

  it("discards the ticket when storage refuses the bytes", async () => {
    const { api, request } = fakeApi();
    blobFetch.mockReturnValue(task(403));
    const err = await uploadSubmissionFile(api, { uri: "file:///tmp/a.pdf", name: "a.pdf", size: 10 }).promise.catch((e) => e);
    expect(isApiError(err) && err.code).toBe("UPLOAD_FAILED");
    expect(request).toHaveBeenCalledWith("DELETE", "/media/uploads/up_1");
    expect(request).not.toHaveBeenCalledWith("POST", "/media/uploads/up_1/complete");
  });

  it("rejects an invalid file before asking the API", async () => {
    const { api, request } = fakeApi();
    const err = await uploadSubmissionFile(api, { uri: "file:///tmp/a.html", name: "a.html", size: 10, type: "text/html" }).promise.catch((e) => e);
    expect(isApiError(err) && err.code).toBe("FILE_INVALID");
    expect(request).not.toHaveBeenCalled();
  });

  it("maps a transport failure to NETWORK_ERROR", async () => {
    const { api } = fakeApi();
    const rejected = Object.assign(Promise.reject(new Error("socket closed")), { uploadProgress: jest.fn(), cancel: jest.fn() });
    rejected.uploadProgress.mockReturnValue(rejected);
    rejected.catch(() => undefined);
    blobFetch.mockReturnValue(rejected);
    const err = await uploadSubmissionFile(api, { uri: "file:///tmp/a.pdf", name: "a.pdf", size: 10 }, () => undefined).promise.catch((e) => e);
    expect(isApiError(err) && err.code).toBe("NETWORK_ERROR");
  });
});
