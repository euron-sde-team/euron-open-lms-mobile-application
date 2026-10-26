import Foundation
import Network

/// A minimal HTTP/1.1 server on 127.0.0.1 for offline lectures (Network.framework).
///
/// Rules (the same as the Android server):
///   - listens on 127.0.0.1 on a random port; every path starts with /<token>/, a random
///     value made at start, so other apps cannot read the files;
///   - GET and HEAD only, with single-range `Range: bytes=` support (206 / 416);
///   - serves only regular files under `root`: segments are letters, digits, dot, dash and
///     underscore, never "." or "..", and the resolved path must stay inside the root.
///     Anything else is a 404;
///   - /<token>/<itemId>/key answers the AES key set with setKey, from memory only;
///   - one request per connection (Connection: close); files stream in 256 KB chunks.
/// All state is touched on one serial queue.
final class LoopbackHTTPServer {
  let root: URL
  let token: String
  private let queue = DispatchQueue(label: "org.openlms.loopback.server")
  private var listener: NWListener?
  private var keys: [String: Data] = [:]
  private(set) var port: UInt16 = 0

  init(root: URL) {
    self.root = root.standardizedFileURL.resolvingSymlinksInPath()
    var bytes = [UInt8](repeating: 0, count: 16)
    if SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) != errSecSuccess {
      for i in bytes.indices { bytes[i] = UInt8.random(in: 0...255) }
    }
    self.token = bytes.map { String(format: "%02x", $0) }.joined()
  }

  var isRunning: Bool { queue.sync { listener != nil && port != 0 } }

  /// Starts listening; `completion` gets the port, or an error.
  func start(completion: @escaping (Result<UInt16, Error>) -> Void) {
    let params = NWParameters.tcp
    params.requiredLocalEndpoint = NWEndpoint.hostPort(host: .ipv4(.loopback), port: .any)
    params.allowLocalEndpointReuse = true
    let l: NWListener
    do {
      l = try NWListener(using: params)
    } catch {
      completion(.failure(error))
      return
    }
    var reported = false
    l.stateUpdateHandler = { [weak self] state in
      guard let self else { return }
      switch state {
      case .ready:
        self.port = l.port?.rawValue ?? 0
        if !reported {
          reported = true
          completion(.success(self.port))
        }
      case .failed(let error):
        self.listener = nil
        l.cancel()
        if !reported {
          reported = true
          completion(.failure(error))
        }
      default:
        break
      }
    }
    l.newConnectionHandler = { [weak self] conn in self?.accept(conn) }
    queue.async {
      self.listener = l
      l.start(queue: self.queue)
    }
  }

  func stop() {
    queue.sync {
      listener?.cancel()
      listener = nil
      keys.removeAll()
      port = 0
    }
  }

  func setKey(_ key: Data, for itemId: String) {
    queue.async { self.keys[itemId] = key }
  }

  // MARK: Connections

  private func accept(_ conn: NWConnection) {
    if case let .hostPort(host, _) = conn.endpoint, !Self.isLoopback(host) {
      conn.cancel()
      return
    }
    conn.start(queue: queue)
    receiveHead(conn, buffer: Data())
  }

  private static func isLoopback(_ host: NWEndpoint.Host) -> Bool {
    switch host {
    case .ipv4(let a): return a == .loopback
    case .ipv6(let a): return a == .loopback || a.asIPv4 == .loopback
    case .name(let n, _): return n == "localhost" || n == "127.0.0.1"
    @unknown default: return false
    }
  }

  private func receiveHead(_ conn: NWConnection, buffer: Data) {
    conn.receive(minimumIncompleteLength: 1, maximumLength: 16 * 1024) { [weak self] data, _, isComplete, error in
      guard let self else { return conn.cancel() }
      var buf = buffer
      if let data { buf.append(data) }
      if let end = buf.range(of: Data("\r\n\r\n".utf8)) {
        let head = String(decoding: buf[buf.startIndex..<end.lowerBound], as: UTF8.self)
        self.handle(conn, head: head)
      } else if error != nil || isComplete || buf.count > 16 * 1024 {
        if buf.count > 16 * 1024 { self.respond(conn, status: 400, reason: "Bad Request") } else { conn.cancel() }
      } else {
        self.receiveHead(conn, buffer: buf)
      }
    }
  }

  private func handle(_ conn: NWConnection, head: String) {
    let lines = head.components(separatedBy: "\r\n")
    let parts = (lines.first ?? "").split(separator: " ").map(String.init)
    guard parts.count >= 3 else { return respond(conn, status: 400, reason: "Bad Request") }
    let method = parts[0]
    guard method == "GET" || method == "HEAD" else { return respond(conn, status: 405, reason: "Method Not Allowed") }
    let range = lines.dropFirst().first { $0.lowercased().hasPrefix("range:") }
      .map { String($0.dropFirst("range:".count)).trimmingCharacters(in: .whitespaces) }
    serve(conn, headOnly: method == "HEAD", rawPath: parts[1], range: range)
  }

  private func serve(_ conn: NWConnection, headOnly: Bool, rawPath: String, range: String?) {
    let path = rawPath.split(separator: "?", maxSplits: 1).first.map(String.init) ?? rawPath
    let segs = path.split(separator: "/", omittingEmptySubsequences: false).dropFirst().map(String.init)
    guard segs.count >= 3, Self.constantTimeEquals(segs[0], token) else { return respond(conn, status: 404, reason: "Not Found") }
    let itemId = segs[1]
    let rest = Array(segs.dropFirst(2))
    guard Self.isSafeSegment(itemId), rest.allSatisfy(Self.isSafeSegment) else { return respond(conn, status: 404, reason: "Not Found") }

    if rest == ["key"] {
      guard let key = keys[itemId] else { return respond(conn, status: 404, reason: "Not Found") }
      let head = Self.head(status: 200, reason: "OK", headers: ["Content-Type": "application/octet-stream", "Content-Length": "\(key.count)", "Cache-Control": "no-store"])
      return send(conn, Data(head.utf8) + (headOnly ? Data() : key), last: true)
    }

    var url = root.appendingPathComponent(itemId, isDirectory: true)
    for s in rest { url.appendPathComponent(s) }
    url = url.standardizedFileURL.resolvingSymlinksInPath()
    var isDir: ObjCBool = false
    guard url.path.hasPrefix(root.path + "/"), FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir), !isDir.boolValue,
          let attrs = try? FileManager.default.attributesOfItem(atPath: url.path), let size = (attrs[.size] as? NSNumber)?.int64Value
    else { return respond(conn, status: 404, reason: "Not Found") }

    var start: Int64 = 0
    var end: Int64 = size - 1
    var partial = false
    if let range {
      guard let r = Self.parseRange(range, length: size) else {
        let head = Self.head(status: 416, reason: "Range Not Satisfiable", headers: ["Content-Range": "bytes */\(size)", "Content-Length": "0"])
        return send(conn, Data(head.utf8), last: true)
      }
      (start, end, partial) = (r.0, r.1, true)
    }
    let count: Int64 = size == 0 ? 0 : end - start + 1
    var headers = ["Content-Type": Self.contentType(url.lastPathComponent), "Content-Length": "\(count)", "Accept-Ranges": "bytes", "Cache-Control": "no-store"]
    if partial { headers["Content-Range"] = "bytes \(start)-\(end)/\(size)" }
    let head = Self.head(status: partial ? 206 : 200, reason: partial ? "Partial Content" : "OK", headers: headers)
    if headOnly || count == 0 { return send(conn, Data(head.utf8), last: true) }
    guard let fh = try? FileHandle(forReadingFrom: url) else { return respond(conn, status: 404, reason: "Not Found") }
    do {
      try fh.seek(toOffset: UInt64(start))
    } catch {
      try? fh.close()
      return respond(conn, status: 500, reason: "Internal Server Error")
    }
    conn.send(content: Data(head.utf8), completion: .contentProcessed { [weak self] err in
      if err != nil {
        try? fh.close()
        return conn.cancel()
      }
      self?.stream(conn, file: fh, remaining: count)
    })
  }

  /// Sends the file in chunks, each after the previous one was handed to the network.
  private func stream(_ conn: NWConnection, file: FileHandle, remaining: Int64) {
    let chunk = Int(min(remaining, 256 * 1024))
    let data = (try? file.read(upToCount: chunk)) ?? Data()
    if data.isEmpty {
      try? file.close()
      return conn.cancel()
    }
    let left = remaining - Int64(data.count)
    conn.send(content: data, completion: .contentProcessed { [weak self] err in
      if err != nil || left <= 0 {
        try? file.close()
        return conn.cancel()
      }
      self?.stream(conn, file: file, remaining: left)
    })
  }

  private func respond(_ conn: NWConnection, status: Int, reason: String) {
    let body = Data(reason.utf8)
    let head = Self.head(status: status, reason: reason, headers: ["Content-Type": "text/plain", "Content-Length": "\(body.count)"])
    send(conn, Data(head.utf8) + body, last: true)
  }

  private func send(_ conn: NWConnection, _ data: Data, last: Bool) {
    conn.send(content: data, completion: .contentProcessed { _ in
      if last { conn.cancel() }
    })
  }

  // MARK: Pure helpers

  static func head(status: Int, reason: String, headers: [String: String]) -> String {
    var s = "HTTP/1.1 \(status) \(reason)\r\n"
    for (k, v) in headers.sorted(by: { $0.key < $1.key }) { s += "\(k): \(v)\r\n" }
    return s + "Connection: close\r\n\r\n"
  }

  static func isSafeSegment(_ s: String) -> Bool {
    guard !s.isEmpty, s.count <= 128, s != ".", s != ".." else { return false }
    return s.unicodeScalars.allSatisfy { c in
      (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || c == "." || c == "-" || c == "_"
    }
  }

  /// `bytes=a-b`, `bytes=a-` or `bytes=-n` against a file of `length`; nil when unsatisfiable.
  static func parseRange(_ header: String, length: Int64) -> (Int64, Int64)? {
    guard length > 0, header.hasPrefix("bytes=") else { return nil }
    let spec = header.dropFirst("bytes=".count)
    guard !spec.contains(","), let dash = spec.firstIndex(of: "-") else { return nil }
    let a = String(spec[spec.startIndex..<dash])
    let b = String(spec[spec.index(after: dash)...])
    if a.isEmpty {
      guard let n = Int64(b), n > 0 else { return nil }
      return (max(0, length - n), length - 1)
    }
    guard let s = Int64(a), s < length else { return nil }
    let e: Int64
    if b.isEmpty { e = length - 1 } else {
      guard let v = Int64(b) else { return nil }
      e = min(v, length - 1)
    }
    return e < s ? nil : (s, e)
  }

  static func contentType(_ name: String) -> String {
    switch (name as NSString).pathExtension.lowercased() {
    case "m3u8": return "application/vnd.apple.mpegurl"
    case "ts": return "video/mp2t"
    case "m4s", "mp4", "m4v": return "video/mp4"
    case "aac": return "audio/aac"
    case "vtt": return "text/vtt"
    default: return "application/octet-stream"
    }
  }

  static func constantTimeEquals(_ a: String, _ b: String) -> Bool {
    let x = Array(a.utf8), y = Array(b.utf8)
    guard x.count == y.count else { return false }
    var diff: UInt8 = 0
    for i in 0..<x.count { diff |= x[i] ^ y[i] }
    return diff == 0
  }
}
