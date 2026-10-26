/**
 * The owner's certificate PDF, saved to the cache directory for the in-app viewer and
 * the share sheet. The download URL comes from an authenticated verify call (the API
 * signs it for the owner only), so the access token never leaves the API client and no
 * WebView ever holds a session. Fetched fresh each time because the signed URL is short
 * lived.
 */
import ReactNativeBlobUtil from "react-native-blob-util";
import Share from "react-native-share";
import type { ApiClient } from "../../../api/client";
import { ApiError, networkError } from "../../../api/vendor/client/errors";
import { config } from "../../../config";
import { joinUrl, safeExternalUrl } from "../../../lib/urls";

/** Serials are printed in upper case with dashes; accept what people type, paste or link. */
export function normaliseSerial(raw: string): string {
  const t = raw.trim();
  const fromUrl = t.match(/\/(?:verify|certificates)\/([^/?#\s]+)/);
  let s = fromUrl ? fromUrl[1]! : t;
  try {
    s = decodeURIComponent(s);
  } catch {
    // Keep it as typed.
  }
  return s.replace(/\s+/g, "").toUpperCase();
}

/** Only characters a serial can hold go into the file name. */
export function pdfFileName(serial: string): string {
  const safe = serial.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  return `certificate-${safe || "download"}.pdf`;
}

export function certificatePdfPath(serial: string, cacheDir: string = ReactNativeBlobUtil.fs.dirs.CacheDir): string {
  return `${cacheDir.replace(/\/+$/, "")}/certificates/${pdfFileName(serial)}`;
}

/** The public page anyone can open to check the certificate. */
export function verifyUrl(serial: string): string {
  return joinUrl(config.webBaseUrl, `/verify/${encodeURIComponent(serial)}`);
}

/**
 * Downloads the PDF and resolves with its local path. Rejects with 409
 * CERTIFICATE_RENDERING while the PDF is still being prepared and 409
 * CERTIFICATE_REVOKED for a revoked certificate, the same codes the API's PDF endpoint uses.
 */
export async function downloadCertificatePdf(api: ApiClient, serial: string): Promise<string> {
  const fresh = await api.certificates.verify(serial);
  if (fresh.revoked) throw new ApiError({ status: 409, code: "CERTIFICATE_REVOKED", message: "This certificate was revoked, so its PDF is no longer available." });
  const url = safeExternalUrl(fresh.pdfUrl);
  if (!url) throw new ApiError({ status: 409, code: "CERTIFICATE_RENDERING", message: "Your PDF is still being prepared. Try again in a minute." });

  const path = certificatePdfPath(serial);
  const dir = path.slice(0, path.lastIndexOf("/"));
  const fs = ReactNativeBlobUtil.fs;
  if (!(await fs.exists(dir))) await fs.mkdir(dir).catch(() => undefined);
  if (await fs.exists(path)) await fs.unlink(path).catch(() => undefined);

  let res;
  try {
    res = await ReactNativeBlobUtil.config({ path, overwrite: true }).fetch("GET", url);
  } catch (e) {
    throw networkError(e);
  }
  const status = res.info().status;
  if (status < 200 || status >= 300) {
    await fs.unlink(path).catch(() => undefined);
    throw new ApiError({ status, code: "DOWNLOAD_FAILED", message: "The PDF did not download. Try again." });
  }
  return res.path() || path;
}

const fileUrl = (path: string) => (path.startsWith("file://") ? path : `file://${path}`);

/** The share sheet with the PDF itself. Dismissing the sheet is not an error. */
export async function sharePdf(path: string, serial: string): Promise<void> {
  await Share.open({ url: fileUrl(path), type: "application/pdf", filename: pdfFileName(serial).replace(/\.pdf$/, ""), failOnCancel: false });
}

/** The share sheet with the public verification link. */
export async function shareVerifyLink(serial: string, courseTitle: string): Promise<void> {
  await Share.open({ url: verifyUrl(serial), message: `My certificate for ${courseTitle}`, failOnCancel: false });
}
