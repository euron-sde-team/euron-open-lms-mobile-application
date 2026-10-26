/**
 * HLS playlist handling for offline copies. Pure, so it is unit tested:
 *
 *   - parse a master playlist and pick ONE variant (the highest with a height of at most
 *     720; without heights, the highest bandwidth under 2.5 Mbps, else the lowest);
 *   - parse the media playlist: segments, the init map (fMP4) and the AES-128 key;
 *   - write the local media playlist: every URI relative (segments next to it on disk) and
 *     the key URI "key", which the loopback server answers from memory. The key itself is
 *     never written to disk.
 *
 * URL resolution is done here rather than with `URL`, whose React Native polyfill does not
 * resolve relative references.
 */

export interface Variant {
  uri: string;
  bandwidth: number;
  height: number | null;
  /** A separate audio rendition group (not supported offline). */
  audio: string | null;
}

export interface MediaEntry {
  /** Absolute remote URL. */
  uri: string;
  /** File name on disk, relative to the item's folder. */
  local: string;
  /** Seconds of video (0 for the init map). */
  duration: number;
}

export interface ParsedMedia {
  /** The source lines, kept to rebuild the playlist with local URIs. */
  lines: string[];
  segments: MediaEntry[];
  map: MediaEntry | null;
  /** Distinct AES-128 key URIs (absolute). More than one means rotating keys. */
  keyUris: string[];
  /** Any EXT-X-KEY with a method other than NONE or AES-128 (SAMPLE-AES, DRM). */
  unsupportedEncryption: boolean;
  totalDuration: number;
}

/** Resolves `ref` against the playlist URL it appeared in. */
export function resolveUrl(base: string, ref: string): string {
  const r = ref.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(r)) return r;
  const m = /^([a-z][a-z0-9+.-]*:)\/\/([^/?#]*)([^?#]*)/i.exec(base);
  if (!m) return r;
  const [, scheme, host, basePath] = m;
  if (r.startsWith("//")) return `${scheme}${r}`;
  const [refPath, refRest] = splitQuery(r);
  let path: string;
  if (r.startsWith("/")) path = refPath;
  else if (refPath === "") path = basePath || "/";
  else path = basePath.replace(/[^/]*$/, "") + refPath;
  return `${scheme}//${host}${normalisePath(path)}${refRest}`;
}

function splitQuery(s: string): [string, string] {
  const i = s.search(/[?#]/);
  return i < 0 ? [s, ""] : [s.slice(0, i), s.slice(i)];
}

function normalisePath(path: string): string {
  const out: string[] = [];
  const parts = path.split("/");
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p === ".") {
      if (i === parts.length - 1) out.push("");
      continue;
    }
    if (p === "..") {
      if (out.length > 1) out.pop();
      if (i === parts.length - 1) out.push("");
      continue;
    }
    out.push(p);
  }
  const joined = out.join("/");
  return joined.startsWith("/") ? joined : `/${joined}`;
}

/** Attribute lists (`BANDWIDTH=1,RESOLUTION=640x360,CODECS="a,b"`), quotes respected. */
export function parseAttributes(list: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(list))) out[m[1]] = m[2].startsWith('"') ? m[2].slice(1, -1) : m[2];
  return out;
}

function lines(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n");
}

export function isMasterPlaylist(text: string): boolean {
  return /#EXT-X-STREAM-INF/.test(text);
}

export function parseMaster(text: string, baseUrl: string): Variant[] {
  const out: Variant[] = [];
  const ls = lines(text);
  for (let i = 0; i < ls.length; i++) {
    const line = ls[i].trim();
    if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;
    const attrs = parseAttributes(line.slice("#EXT-X-STREAM-INF:".length));
    let j = i + 1;
    while (j < ls.length && (ls[j].trim() === "" || ls[j].trim().startsWith("#"))) j++;
    if (j >= ls.length) break;
    const res = /^(\d+)x(\d+)$/.exec(attrs.RESOLUTION ?? "");
    out.push({ uri: resolveUrl(baseUrl, ls[j].trim()), bandwidth: Number(attrs.BANDWIDTH) || 0, height: res ? Number(res[2]) : null, audio: attrs.AUDIO ?? null });
    i = j;
  }
  return out;
}

/** The one variant to keep: highest at or under `maxHeight`, else the smallest. */
export function pickVariant(variants: Variant[], maxHeight = 720): Variant | null {
  if (!variants.length) return null;
  const withHeight = variants.filter((v) => v.height !== null);
  if (withHeight.length) {
    const fit = withHeight.filter((v) => (v.height ?? 0) <= maxHeight).sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || b.bandwidth - a.bandwidth);
    if (fit.length) return fit[0];
    return [...withHeight].sort((a, b) => (a.height ?? 0) - (b.height ?? 0) || a.bandwidth - b.bandwidth)[0];
  }
  const under = variants.filter((v) => v.bandwidth > 0 && v.bandwidth <= 2_500_000).sort((a, b) => b.bandwidth - a.bandwidth);
  return under[0] ?? [...variants].sort((a, b) => a.bandwidth - b.bandwidth)[0];
}

function extOf(uri: string, fallback: string): string {
  const path = splitQuery(uri)[0];
  const m = /\.([a-z0-9]{1,5})$/i.exec(path);
  return m ? m[1].toLowerCase() : fallback;
}

export function parseMedia(text: string, baseUrl: string): ParsedMedia {
  const ls = lines(text);
  const segments: MediaEntry[] = [];
  const keyUris: string[] = [];
  let map: MediaEntry | null = null;
  let unsupportedEncryption = false;
  let pendingDuration = 0;
  const seen = new Map<string, MediaEntry>();
  for (const raw of ls) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXTINF:")) {
      pendingDuration = parseFloat(line.slice(8)) || 0;
      continue;
    }
    if (line.startsWith("#EXT-X-KEY:")) {
      const a = parseAttributes(line.slice(11));
      if (a.METHOD === "AES-128" && a.URI) {
        const abs = resolveUrl(baseUrl, a.URI);
        if (!keyUris.includes(abs)) keyUris.push(abs);
      } else if (a.METHOD && a.METHOD !== "NONE") unsupportedEncryption = true;
      continue;
    }
    if (line.startsWith("#EXT-X-MAP:")) {
      const a = parseAttributes(line.slice(11));
      if (a.URI) {
        const abs = resolveUrl(baseUrl, a.URI);
        map = { uri: abs, local: `init.${extOf(abs, "mp4")}`, duration: 0 };
      }
      continue;
    }
    if (line.startsWith("#")) continue;
    const abs = resolveUrl(baseUrl, line);
    // Byte-range playlists list one file many times: download it once.
    const existing = seen.get(abs);
    if (existing) {
      existing.duration += pendingDuration;
    } else {
      const entry = { uri: abs, local: `s${String(segments.length).padStart(5, "0")}.${extOf(abs, "ts")}`, duration: pendingDuration };
      segments.push(entry);
      seen.set(abs, entry);
    }
    pendingDuration = 0;
  }
  return { lines: ls, segments, map, keyUris, unsupportedEncryption, totalDuration: segments.reduce((n, s) => n + s.duration, 0) };
}

/**
 * The playlist written next to the files: same tags, every URI made local and relative,
 * the key pointed at "key" (served from memory by the loopback server).
 */
export function rewriteMedia(parsed: ParsedMedia, baseUrl: string): string {
  const byUri = new Map(parsed.segments.map((s) => [s.uri, s.local]));
  const out: string[] = [];
  for (const raw of parsed.lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXT-X-KEY:")) {
      out.push(line.replace(/URI="[^"]*"/, 'URI="key"'));
      continue;
    }
    if (line.startsWith("#EXT-X-MAP:") && parsed.map) {
      out.push(line.replace(/URI="[^"]*"/, `URI="${parsed.map.local}"`));
      continue;
    }
    if (line.startsWith("#")) {
      out.push(line);
      continue;
    }
    out.push(byUri.get(resolveUrl(baseUrl, line)) ?? line);
  }
  if (!out.includes("#EXT-X-ENDLIST")) out.push("#EXT-X-ENDLIST");
  return `${out.join("\n")}\n`;
}
