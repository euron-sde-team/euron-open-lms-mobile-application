/**
 * Submission file uploads, natively. Same three steps as the web client (ask the API for
 * a ticket, PUT the bytes to the presigned URL, mark complete; discard the ticket on
 * failure) and the same validation and limits from the vendored upload helpers, but the
 * PUT streams the file from disk with react-native-blob-util, so a large video never
 * has to be read into JavaScript memory.
 */
import ReactNativeBlobUtil from "react-native-blob-util";
import type { ApiClient } from "../../../api/client";
import { ApiError, networkError } from "../../../api/vendor/client/errors";
import { mimeTypeOf, validateUpload, type UploadTicket } from "../../../api/vendor/client/upload";
import type { Media } from "../../../api/vendor/types";

/** A file picked on the device, copied into the app's cache so it can be streamed. */
export interface LocalFile {
  uri: string;
  name: string;
  size: number;
  type?: string | null;
}

/**
 * Submissions also take zip archives (apps/api/src/domain/media-rules.ts: ARCHIVE, 50 MB),
 * which the vendored web validation does not know about yet.
 */
const ARCHIVE_LIMIT = 50 * 1024 * 1024;
const ZIP_TYPES = new Set(["application/zip", "application/x-zip-compressed"]);

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function submissionMimeType(file: { name: string; type?: string | null }): string {
  const t = (file.type ?? "").trim();
  if (extOf(file.name) === "zip" && (!t || t === "application/octet-stream")) return "application/zip";
  return mimeTypeOf({ name: file.name, type: t || undefined });
}

/** Null when the file can be uploaded, else a message for the learner. */
export function validateSubmissionFile(file: { name: string; size: number; type?: string | null }): string | null {
  const mime = submissionMimeType(file);
  if (ZIP_TYPES.has(mime)) return file.size > ARCHIVE_LIMIT ? "This file is too large. The limit is 50 MB." : null;
  if (file.size <= 0) return "This file is empty.";
  return validateUpload({ name: file.name, type: mime, size: file.size });
}

/**
 * The path react-native-blob-util streams from: file:// URIs become plain, decoded
 * paths; content:// URIs (Android) are passed through, the library reads those itself.
 */
export function blobPath(uri: string): string {
  if (uri.startsWith("file://")) {
    const p = uri.slice("file://".length);
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  }
  return uri;
}

/** The PUT headers: the presigned ones (minus those the platform sets itself), plus the type when unsigned. */
export function putHeaders(ticket: UploadTicket["put"], mimeType: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(ticket.headers ?? {})) {
    if (/^(content-length|host)$/i.test(k)) continue;
    out[k] = v;
  }
  if (!Object.keys(out).some((k) => k.toLowerCase() === "content-type")) out["Content-Type"] = mimeType;
  return out;
}

export interface UploadHandle {
  promise: Promise<Media>;
  cancel: () => void;
}

const cancelled = () => Object.assign(new Error("Upload cancelled"), { name: "AbortError" });

export function isCancelled(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { name?: string }).name === "AbortError";
}

/** Upload one file for a submission. `onProgress` gets 0..1 as bytes go up. */
export function uploadSubmissionFile(api: ApiClient, file: LocalFile, onProgress?: (fraction: number) => void): UploadHandle {
  let stop: (() => void) | null = null;
  let isCancelledFlag = false;
  const promise = (async () => {
    const problem = validateSubmissionFile(file);
    if (problem) throw new ApiError({ status: 400, code: "FILE_INVALID", message: problem });
    const mimeType = submissionMimeType(file);
    const ticket = await api.http.request<UploadTicket>("POST", "/media/uploads", { body: { purpose: "SUBMISSION", fileName: file.name, mimeType, sizeBytes: file.size } });
    const discard = () => api.http.request("DELETE", `/media/uploads/${encodeURIComponent(ticket.uploadId)}`).catch(() => undefined);
    if (isCancelledFlag) {
      discard();
      throw cancelled();
    }
    try {
      const task = ReactNativeBlobUtil.fetch(
        (ticket.put.method || "PUT").toUpperCase() as "PUT",
        ticket.put.url,
        putHeaders(ticket.put, mimeType),
        ReactNativeBlobUtil.wrap(blobPath(file.uri))
      );
      stop = () => {
        task.cancel?.();
      };
      if (onProgress && typeof task.uploadProgress === "function") {
        task.uploadProgress({ interval: 150 }, (sent, total) => {
          const t = Number(total);
          if (t > 0) onProgress(Math.min(1, Number(sent) / t));
        });
      }
      let res;
      try {
        res = await task;
      } catch (e) {
        if (isCancelledFlag) throw cancelled();
        throw networkError(e);
      }
      const status = res.info().status;
      if (status < 200 || status >= 300) throw new ApiError({ status, code: "UPLOAD_FAILED", message: "The upload did not go through. Try again." });
      onProgress?.(1);
      return await api.http.request<Media>("POST", `/media/uploads/${encodeURIComponent(ticket.uploadId)}/complete`);
    } catch (e) {
      discard();
      throw e;
    }
  })();
  return {
    promise,
    cancel: () => {
      isCancelledFlag = true;
      stop?.();
    },
  };
}
