/**
 * Files in and out of the account area: invoice PDFs and the data export are fetched
 * through the authenticated API client (so a stale token refreshes as usual), written to
 * the cache directory with react-native-blob-util, and opened or shared from there. Uploads
 * (the profile photo) PUT the file straight from its local path with blob-util, so a large
 * image never passes through the JS heap. Nothing is kept outside the cache.
 */
import ReactNativeBlobUtil from "react-native-blob-util";
import type { ApiClient } from "../../../api/client";
import { ApiError, networkError } from "../../../api/vendor/client/errors";
import { mimeTypeOf, validateUpload, type UploadTicket } from "../../../api/vendor/client/upload";
import type { Media, UploadPurpose } from "../../../api/vendor/types";

/** A file name safe for the cache directory ("INV-0012.pdf"). */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "file";
}

/** "juniper-data-2026-10-26.json" */
export function exportFileName(username: string, now: Date = new Date()): string {
  return safeFileName(`${username}-data-${now.toISOString().slice(0, 10)}.json`);
}

/** A local file URI as a plain path for blob-util ("file:///a%20b.jpg" -> "/a b.jpg"). */
export function pathFromUri(uri: string): string {
  const raw = uri.replace(/^file:\/\//, "");
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export const fileUri = (path: string) => (path.startsWith("file://") ? path : `file://${path}`);

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.onload = () => {
      const s = String(reader.result ?? "");
      resolve(s.slice(s.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/** Writes a downloaded body into the cache directory and returns its path. */
export async function saveBlobToCache(blob: Blob, name: string): Promise<string> {
  const path = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${safeFileName(name)}`;
  if (await ReactNativeBlobUtil.fs.exists(path)) await ReactNativeBlobUtil.fs.unlink(path);
  await ReactNativeBlobUtil.fs.writeFile(path, await blobToBase64(blob), "base64");
  return path;
}

/** Invoice or credit note PDF into the cache. 409 INVOICE_RENDERING while the server renders it. */
export async function downloadInvoice(api: ApiClient, invoice: { id: string; number: string }): Promise<string> {
  const blob = await api.billing.invoicePdf(invoice.id);
  return saveBlobToCache(blob, `${invoice.number}.pdf`);
}

export interface PickedFile {
  uri: string;
  name: string;
  type: string | null;
  size: number;
}

/**
 * The media upload flow with a native PUT: ask for a ticket, send the bytes from the file
 * path with progress, mark it complete. The ticket is discarded if anything fails.
 */
export async function uploadFromUri(api: ApiClient, purpose: UploadPurpose, file: PickedFile, onProgress?: (f: number) => void): Promise<Media> {
  const mimeType = mimeTypeOf({ type: file.type ?? undefined, name: file.name });
  const problem = validateUpload({ type: mimeType, name: file.name, size: file.size });
  if (problem) throw new ApiError({ status: 400, code: "UPLOAD_INVALID", message: problem });
  const ticket = await api.http.request<UploadTicket>("POST", "/media/uploads", { body: { purpose, fileName: file.name, mimeType, sizeBytes: file.size } });
  try {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(ticket.put.headers ?? {})) if (!/^(content-length|host)$/i.test(k)) headers[k] = v;
    if (!Object.keys(headers).some((k) => /^content-type$/i.test(k))) headers["Content-Type"] = mimeType;
    const task = ReactNativeBlobUtil.fetch((ticket.put.method || "PUT") as "PUT", ticket.put.url, headers, ReactNativeBlobUtil.wrap(pathFromUri(file.uri)));
    if (onProgress && typeof (task as { uploadProgress?: unknown }).uploadProgress === "function") task.uploadProgress((sent, total) => total > 0 && onProgress(Math.min(1, sent / total)));
    let res;
    try {
      res = await task;
    } catch (e) {
      throw networkError(e);
    }
    const status = res.info().status;
    if (status < 200 || status >= 300) throw new ApiError({ status, code: "UPLOAD_FAILED", message: "The upload did not go through. Try again." });
    onProgress?.(1);
    return await api.http.request<Media>("POST", `/media/uploads/${encodeURIComponent(ticket.uploadId)}/complete`);
  } catch (e) {
    api.http.request("DELETE", `/media/uploads/${encodeURIComponent(ticket.uploadId)}`).catch(() => undefined);
    throw e;
  }
}
