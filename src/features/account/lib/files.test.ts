import ReactNativeBlobUtil from "react-native-blob-util";
import { exportFileName, pathFromUri, safeFileName, uploadFromUri } from "./files";

describe("file names and paths", () => {
  it("keeps cache file names safe", () => {
    expect(safeFileName("INV 0012/../x.pdf")).toBe("INV-0012-..-x.pdf");
    expect(exportFileName("juniper", new Date("2026-10-26T08:00:00Z"))).toBe("juniper-data-2026-10-26.json");
  });
  it("turns a file URI into a blob-util path", () => {
    expect(pathFromUri("file:///var/mobile/a%20b.jpg")).toBe("/var/mobile/a b.jpg");
    expect(pathFromUri("/plain/path.png")).toBe("/plain/path.png");
  });
});

describe("native upload", () => {
  it("asks for a ticket, PUTs the file from its path, then completes", async () => {
    const request = jest.fn(async (method: string, path: string) => {
      if (path === "/media/uploads") return { uploadId: "up_1", put: { url: "https://s3.test/put", method: "PUT", headers: { "Content-Type": "image/jpeg", "Content-Length": "9" }, expiresAt: "" } };
      return { id: "m_1" };
    });
    const fetchSpy = jest.spyOn(ReactNativeBlobUtil, "fetch").mockImplementation((async () => ({ info: () => ({ status: 200 }) })) as never);
    const api = { http: { request } } as never;
    const media = await uploadFromUri(api, "AVATAR", { uri: "file:///cache/photo.jpg", name: "photo.jpg", type: "image/jpeg", size: 1000 });
    expect(media).toEqual({ id: "m_1" });
    expect(fetchSpy).toHaveBeenCalledWith("PUT", "https://s3.test/put", { "Content-Type": "image/jpeg" }, "RNFetchBlob-file:///cache/photo.jpg");
    expect(request).toHaveBeenLastCalledWith("POST", "/media/uploads/up_1/complete");
  });
  it("refuses files the server would reject, before asking for a ticket", async () => {
    const request = jest.fn();
    await expect(uploadFromUri({ http: { request } } as never, "AVATAR", { uri: "file:///x.svg", name: "x.svg", type: "image/svg+xml", size: 10 })).rejects.toMatchObject({ code: "UPLOAD_INVALID" });
    expect(request).not.toHaveBeenCalled();
  });
});
