import ReactNativeBlobUtil from "react-native-blob-util";
import Share from "react-native-share";
import type { ApiClient } from "../../../api/client";
import { isApiError } from "../../../api/vendor/client/errors";
import type { Certificate } from "../../../api/vendor/types";
import { certificatePdfPath, downloadCertificatePdf, normaliseSerial, pdfFileName, sharePdf, shareVerifyLink, verifyUrl } from "./certificate-pdf";

const cert = (over: Partial<Certificate> = {}): Certificate => ({
  serial: "OLMS-7Q2K-91XD",
  learnerName: "Juniper Vale",
  courseTitle: "Field Botany",
  courseSlug: "field-botany",
  instructorNames: ["Ada Moss"],
  issuedAt: "2026-03-04T10:00:00Z",
  revoked: false,
  revokedAt: null,
  pdfUrl: "https://files.example/cert.pdf?sig=abc",
  verifyUrl: "http://web.test/verify/OLMS-7Q2K-91XD",
  academyName: "Northwind Academy",
  ...over,
});

const apiWith = (c: Certificate) => ({ certificates: { verify: jest.fn(async () => c) } }) as unknown as ApiClient;

describe("certificate paths and links", () => {
  it("normalises typed, pasted and linked serials", () => {
    expect(normaliseSerial(" olms-7q2k-91xd ")).toBe("OLMS-7Q2K-91XD");
    expect(normaliseSerial("https://academy.example/verify/olms-7q2k-91xd?ref=x")).toBe("OLMS-7Q2K-91XD");
    expect(normaliseSerial("OLMS 7Q2K 91XD")).toBe("OLMS7Q2K91XD");
  });

  it("builds a safe file name inside the cache directory", () => {
    expect(pdfFileName("OLMS-7Q2K-91XD")).toBe("certificate-OLMS-7Q2K-91XD.pdf");
    expect(pdfFileName("../../etc/passwd")).toBe("certificate-ETCPASSWD.pdf");
    expect(certificatePdfPath("OLMS-1", "/cache/")).toBe("/cache/certificates/certificate-OLMS-1.pdf");
  });

  it("points the public link at the academy website", () => {
    expect(verifyUrl("OLMS-1")).toBe("http://web.test/verify/OLMS-1");
  });
});

describe("downloadCertificatePdf", () => {
  const fs = ReactNativeBlobUtil.fs as unknown as { exists: jest.Mock; mkdir: jest.Mock; unlink: jest.Mock };

  it("downloads the signed PDF into the cache without an auth header", async () => {
    const fetch = jest.fn(async () => ({ path: () => "/cache/certificates/certificate-OLMS-7Q2K-91XD.pdf", info: () => ({ status: 200 }) }));
    const configSpy = jest.spyOn(ReactNativeBlobUtil, "config").mockReturnValue({ fetch } as never);
    const path = await downloadCertificatePdf(apiWith(cert()), "OLMS-7Q2K-91XD");
    expect(path).toBe("/cache/certificates/certificate-OLMS-7Q2K-91XD.pdf");
    expect(configSpy).toHaveBeenCalledWith({ path: "/cache/certificates/certificate-OLMS-7Q2K-91XD.pdf", overwrite: true });
    expect(fetch).toHaveBeenCalledWith("GET", "https://files.example/cert.pdf?sig=abc");
    expect(fs.mkdir).toHaveBeenCalledWith("/cache/certificates");
    configSpy.mockRestore();
  });

  it("says when the PDF is still rendering or the certificate was revoked", async () => {
    const pending = await downloadCertificatePdf(apiWith(cert({ pdfUrl: null })), "X").catch((e) => e);
    expect(isApiError(pending) && pending.code).toBe("CERTIFICATE_RENDERING");
    const revoked = await downloadCertificatePdf(apiWith(cert({ revoked: true })), "X").catch((e) => e);
    expect(isApiError(revoked) && revoked.code).toBe("CERTIFICATE_REVOKED");
  });

  it("removes a failed download", async () => {
    const fetch = jest.fn(async () => ({ path: () => "/x", info: () => ({ status: 403 }) }));
    const configSpy = jest.spyOn(ReactNativeBlobUtil, "config").mockReturnValue({ fetch } as never);
    fs.unlink.mockClear();
    const err = await downloadCertificatePdf(apiWith(cert()), "OLMS-1").catch((e) => e);
    expect(isApiError(err) && err.code).toBe("DOWNLOAD_FAILED");
    expect(fs.unlink).toHaveBeenCalledWith("/cache/certificates/certificate-OLMS-1.pdf");
    configSpy.mockRestore();
  });
});

describe("sharing", () => {
  it("shares the PDF file and the verification link", async () => {
    const open = Share.open as jest.Mock;
    await sharePdf("/cache/certificates/certificate-OLMS-1.pdf", "OLMS-1");
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ url: "file:///cache/certificates/certificate-OLMS-1.pdf", type: "application/pdf", failOnCancel: false }));
    await shareVerifyLink("OLMS-1", "Field Botany");
    expect(open).toHaveBeenLastCalledWith(expect.objectContaining({ url: "http://web.test/verify/OLMS-1" }));
  });
});
