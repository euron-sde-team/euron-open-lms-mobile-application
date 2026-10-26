import { isMasterPlaylist, parseAttributes, parseMaster, parseMedia, pickVariant, resolveUrl, rewriteMedia } from "./hls";

const MASTER = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.4d401e,mp4a.40.2"
360/index.m3u8?token=abc
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720
720/index.m3u8?token=abc
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
https://cdn.example.com/v1/1080/index.m3u8
`;

const MEDIA = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:4
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-KEY:METHOD=AES-128,URI="https://api.example.com/keys/vid1?t=xyz",IV=0x00000000000000000000000000000000
#EXTINF:4.000,
seg0.ts?sig=1
#EXTINF:4.000,
seg1.ts?sig=2
#EXTINF:2.5,
../shared/seg2.ts
#EXT-X-ENDLIST
`;

describe("URL resolution", () => {
  it("resolves relative, root-relative, protocol-relative and absolute references", () => {
    const base = "https://cdn.example.com/v1/720/index.m3u8?token=abc";
    expect(resolveUrl(base, "seg0.ts?sig=1")).toBe("https://cdn.example.com/v1/720/seg0.ts?sig=1");
    expect(resolveUrl(base, "../shared/seg2.ts")).toBe("https://cdn.example.com/v1/shared/seg2.ts");
    expect(resolveUrl(base, "./a/./b.ts")).toBe("https://cdn.example.com/v1/720/a/b.ts");
    expect(resolveUrl(base, "/keys/k")).toBe("https://cdn.example.com/keys/k");
    expect(resolveUrl(base, "//other.example.com/x.ts")).toBe("https://other.example.com/x.ts");
    expect(resolveUrl(base, "https://elsewhere.test/y.ts")).toBe("https://elsewhere.test/y.ts");
    expect(resolveUrl("https://h.test/a/b.m3u8", "../../../c.ts")).toBe("https://h.test/c.ts");
  });

  it("parses attribute lists with quoted commas", () => {
    expect(parseAttributes('BANDWIDTH=1,CODECS="a,b",RESOLUTION=640x360')).toEqual({ BANDWIDTH: "1", CODECS: "a,b", RESOLUTION: "640x360" });
  });
});

describe("variant choice", () => {
  const base = "https://cdn.example.com/v1/master.m3u8";
  it("picks the highest variant at or under 720p", () => {
    expect(isMasterPlaylist(MASTER)).toBe(true);
    const variants = parseMaster(MASTER, base);
    expect(variants).toHaveLength(3);
    expect(variants[0].uri).toBe("https://cdn.example.com/v1/360/index.m3u8?token=abc");
    expect(pickVariant(variants)?.height).toBe(720);
  });

  it("falls back to the smallest when every variant is larger, and to bandwidth without heights", () => {
    expect(pickVariant([{ uri: "a", bandwidth: 9e6, height: 1080, audio: null }, { uri: "b", bandwidth: 6e6, height: 900, audio: null }])?.uri).toBe("b");
    expect(pickVariant([{ uri: "a", bandwidth: 4e6, height: null, audio: null }, { uri: "b", bandwidth: 2e6, height: null, audio: null }, { uri: "c", bandwidth: 1e6, height: null, audio: null }])?.uri).toBe("b");
    expect(pickVariant([])).toBeNull();
  });
});

describe("media playlists", () => {
  const url = "https://cdn.example.com/v1/720/index.m3u8?token=abc";

  it("lists segments with local names, durations and the key", () => {
    const m = parseMedia(MEDIA, url);
    expect(isMasterPlaylist(MEDIA)).toBe(false);
    expect(m.segments.map((s) => s.local)).toEqual(["s00000.ts", "s00001.ts", "s00002.ts"]);
    expect(m.segments[1].uri).toBe("https://cdn.example.com/v1/720/seg1.ts?sig=2");
    expect(m.totalDuration).toBeCloseTo(10.5);
    expect(m.keyUris).toEqual(["https://api.example.com/keys/vid1?t=xyz"]);
    expect(m.unsupportedEncryption).toBe(false);
  });

  it("writes a local playlist: relative segments, the key at the loopback key route, nothing remote", () => {
    const m = parseMedia(MEDIA, url);
    const local = rewriteMedia(m, url);
    expect(local).toContain('#EXT-X-KEY:METHOD=AES-128,URI="key",IV=0x00000000000000000000000000000000');
    expect(local).toContain("\ns00000.ts\n");
    expect(local).toContain("\ns00002.ts\n");
    expect(local).not.toMatch(/https?:/);
    expect(local.trim().endsWith("#EXT-X-ENDLIST")).toBe(true);
  });

  it("handles fMP4 init maps, byte ranges and flags what it cannot save", () => {
    const fmp4 = `#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:4,\n#EXT-X-BYTERANGE:1000@0\nmain.m4s\n#EXTINF:4,\n#EXT-X-BYTERANGE:1000@1000\nmain.m4s\n`;
    const m = parseMedia(fmp4, "https://h.test/v/p.m3u8");
    expect(m.map).toMatchObject({ uri: "https://h.test/v/init.mp4", local: "init.mp4" });
    expect(m.segments).toHaveLength(1);
    expect(m.segments[0].duration).toBe(8);
    expect(rewriteMedia(m, "https://h.test/v/p.m3u8")).toContain('#EXT-X-MAP:URI="init.mp4"');
    expect(parseMedia(`#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://x"\n#EXTINF:4,\na.ts\n`, "https://h.test/p.m3u8").unsupportedEncryption).toBe(true);
    const rotating = parseMedia(`#EXT-X-KEY:METHOD=AES-128,URI="k1"\n#EXTINF:4,\na.ts\n#EXT-X-KEY:METHOD=AES-128,URI="k2"\n#EXTINF:4,\nb.ts\n`, "https://h.test/p.m3u8");
    expect(rotating.keyUris).toHaveLength(2);
  });
});
