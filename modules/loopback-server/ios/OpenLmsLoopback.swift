import Foundation
import React

/// JS API of the loopback server: start(rootDir) -> { port, token }, stop(), setKey(itemId, base64Key).
/// One server per app process; keys live only in its memory and die with it. A legacy module,
/// exposed to the new architecture through React Native's interop layer.
@objc(OpenLmsLoopback)
final class OpenLmsLoopback: NSObject {
  private let lock = NSLock()
  private var server: LoopbackHTTPServer?

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(start:resolver:rejecter:)
  func start(_ rootDir: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    let root = URL(fileURLWithPath: rootDir, isDirectory: true).standardizedFileURL.resolvingSymlinksInPath()
    lock.lock()
    if let running = server, running.isRunning, running.root == root {
      let reply: [String: Any] = ["port": Int(running.port), "token": running.token]
      lock.unlock()
      return resolve(reply)
    }
    server?.stop()
    try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    let next = LoopbackHTTPServer(root: root)
    server = next
    lock.unlock()
    next.start { result in
      switch result {
      case .success(let port): resolve(["port": Int(port), "token": next.token])
      case .failure(let error): reject("LOOPBACK_START_FAILED", error.localizedDescription, error)
      }
    }
  }

  @objc(stop:rejecter:)
  func stop(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    lock.lock()
    server?.stop()
    server = nil
    lock.unlock()
    resolve(nil)
  }

  @objc(setKey:base64Key:resolver:rejecter:)
  func setKey(_ itemId: String, base64Key: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    lock.lock()
    let running = server
    lock.unlock()
    guard let running else { return reject("LOOPBACK_NOT_RUNNING", "Start the loopback server first", nil) }
    guard LoopbackHTTPServer.isSafeSegment(itemId) else { return reject("LOOPBACK_BAD_ID", "Invalid item id", nil) }
    guard let key = Data(base64Encoded: base64Key, options: .ignoreUnknownCharacters) else { return reject("LOOPBACK_BAD_KEY", "The key is not valid base64", nil) }
    running.setKey(key, for: itemId)
    resolve(nil)
  }

  @objc func invalidate() {
    lock.lock()
    server?.stop()
    server = nil
    lock.unlock()
  }
}
