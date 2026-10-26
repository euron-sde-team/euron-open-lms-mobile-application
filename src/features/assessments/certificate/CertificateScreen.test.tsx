import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import ReactNativeBlobUtil from "react-native-blob-util";
import Share from "react-native-share";
import { ApiError } from "../../../api/vendor/client/errors";
import type { Certificate } from "../../../api/vendor/types";
import { FakeSession } from "../../../../test/render";
import { fakeNavigation, renderScreen } from "../test-render";
import { CertificateScreen } from "./CertificateScreen";

// lucide's react-native entry is untransformed ESM under Jest; icons are not under test here.
jest.mock("lucide-react-native", () => new Proxy({ __esModule: true }, { get: (t: Record<string | symbol, unknown>, k) => (k in t ? t[k] : () => null) }));

const cert = (over: Partial<Certificate> = {}): Certificate => ({
  serial: "OLMS-7Q2K-91XD",
  learnerName: "Juniper Vale",
  courseTitle: "Field Botany",
  courseSlug: "field-botany",
  instructorNames: ["Ada Moss"],
  issuedAt: "2026-03-04T10:00:00Z",
  revoked: false,
  revokedAt: null,
  pdfUrl: null,
  verifyUrl: "http://web.test/verify/OLMS-7Q2K-91XD",
  academyName: "Northwind Academy",
  ...over,
});

async function setup(c: Certificate | Error, opts: { status?: "signedIn" | "signedOut"; mine?: Certificate[] } = {}) {
  const nav = fakeNavigation();
  const api = {
    certificates: { verify: jest.fn(async () => (c instanceof Error ? Promise.reject(c) : c)) },
    my: { certificates: jest.fn(async () => opts.mine ?? []) },
  };
  await renderScreen(
    <FakeSession api={api as never} status={opts.status ?? "signedOut"}>
      <CertificateScreen route={{ key: "c", name: "Certificate", params: { serial: "olms-7q2k-91xd" } } as never} navigation={nav as never} />
    </FakeSession>
  );
  return { api, nav };
}

afterEach(() => jest.restoreAllMocks());

describe("CertificateScreen", () => {
  it("verifies a valid certificate for anyone, without owner actions", async () => {
    const { api, nav } = await setup(cert());
    expect(await screen.findByTestId("certificate")).toBeTruthy();
    expect(api.certificates.verify).toHaveBeenCalledWith("OLMS-7Q2K-91XD");
    expect(api.my.certificates).not.toHaveBeenCalled();
    expect(screen.getByText("Valid")).toBeTruthy();
    expect(screen.getByText(/Issued by Northwind Academy on/)).toBeTruthy();
    expect(screen.getByTestId("certificate-learner").props.children).toBe("Juniper Vale");
    expect(screen.getByText("Taught by Ada Moss")).toBeTruthy();
    expect(screen.getByText("OLMS-7Q2K-91XD")).toBeTruthy();
    expect(screen.queryByTestId("certificate-download")).toBeNull();

    await fireEvent.press(screen.getByTestId("certificate-share-link"));
    expect(Share.open).toHaveBeenCalledWith(expect.objectContaining({ url: "http://web.test/verify/OLMS-7Q2K-91XD" }));
    await fireEvent.press(screen.getByTestId("certificate-course"));
    expect(nav.navigate).toHaveBeenCalledWith("Course", { slug: "field-botany" });
  });

  it("says when a certificate was revoked", async () => {
    await setup(cert({ revoked: true, revokedAt: "2026-04-01T00:00:00Z", pdfUrl: null }), { status: "signedIn", mine: [cert()] });
    expect(await screen.findByText("Revoked")).toBeTruthy();
    expect(screen.getByText(/was revoked on .* and is no longer valid\./)).toBeTruthy();
    expect(screen.queryByTestId("certificate-download")).toBeNull();
    expect(screen.queryByTestId("certificate-preparing")).toBeNull();
  });

  it("lets the owner download, view and share the PDF", async () => {
    const fetch = jest.fn(async () => ({ path: () => "/cache/certificates/certificate-OLMS-7Q2K-91XD.pdf", info: () => ({ status: 200 }) }));
    jest.spyOn(ReactNativeBlobUtil, "config").mockReturnValue({ fetch } as never);
    const { api } = await setup(cert({ pdfUrl: "https://files.example/c.pdf?sig=1" }), { status: "signedIn" });
    await fireEvent.press(await screen.findByTestId("certificate-download"));
    expect(await screen.findByTestId("certificate-pdf-viewer")).toBeTruthy();
    expect(screen.getByTestId("pdf").props.source).toEqual({ uri: "file:///cache/certificates/certificate-OLMS-7Q2K-91XD.pdf" });
    expect(fetch).toHaveBeenCalledWith("GET", "https://files.example/c.pdf?sig=1");
    // A fresh signed link is fetched for the download.
    expect(api.certificates.verify).toHaveBeenCalledTimes(2);
    await fireEvent.press(screen.getByTestId("certificate-share-pdf"));
    await waitFor(() => expect(Share.open).toHaveBeenCalledWith(expect.objectContaining({ url: "file:///cache/certificates/certificate-OLMS-7Q2K-91XD.pdf", type: "application/pdf" })));
  });

  it("tells the owner the PDF is still being prepared", async () => {
    await setup(cert(), { status: "signedIn", mine: [cert()] });
    expect(await screen.findByTestId("certificate-preparing")).toBeTruthy();
    expect(screen.queryByTestId("certificate-download")).toBeNull();
  });

  it("handles an unknown serial", async () => {
    await setup(new ApiError({ status: 404, code: "NOT_FOUND", message: "Not found" }));
    expect(await screen.findByTestId("certificate-not-found")).toBeTruthy();
  });
});
