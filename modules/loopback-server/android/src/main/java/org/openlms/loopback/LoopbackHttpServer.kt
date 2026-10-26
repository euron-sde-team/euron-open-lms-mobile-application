package org.openlms.loopback

import java.io.BufferedOutputStream
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.io.RandomAccessFile
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketException
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * A minimal HTTP/1.1 server on 127.0.0.1 for offline lectures. Plain JVM code (no Android
 * types) so it can be tested off device.
 *
 * Rules:
 *   - binds to 127.0.0.1 on a random port; every path must start with /<token>/, a random
 *     value made at start, so other apps on the phone cannot read the files;
 *   - GET and HEAD only, with single-range `Range: bytes=` support (206 / 416);
 *   - serves only regular files under `root`: path segments are limited to letters,
 *     digits, dot, dash and underscore, never "." or "..", and the canonical path must stay
 *     inside the root. Anything else is a 404;
 *   - /<token>/<itemId>/key answers the AES key set with setKey, from memory only;
 *   - one request per connection (Connection: close), handled on a small thread pool.
 */
class LoopbackHttpServer(val root: File) {
  val token: String = randomToken()
  private val keys = ConcurrentHashMap<String, ByteArray>()
  private var socket: ServerSocket? = null
  private var pool: ExecutorService? = null
  @Volatile private var running = false

  val isRunning: Boolean get() = running
  val port: Int get() = socket?.localPort ?: 0

  fun start() {
    val s = ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
    socket = s
    pool = Executors.newFixedThreadPool(4)
    running = true
    Thread({ acceptLoop(s) }, "open-lms-loopback").apply { isDaemon = true }.start()
  }

  fun stop() {
    running = false
    keys.clear()
    try {
      socket?.close()
    } catch (_: Exception) {
    }
    pool?.shutdownNow()
    socket = null
    pool = null
  }

  fun setKey(itemId: String, key: ByteArray) {
    keys[itemId] = key
  }

  private fun acceptLoop(s: ServerSocket) {
    while (running) {
      val client = try {
        s.accept()
      } catch (_: SocketException) {
        break
      } catch (_: Exception) {
        continue
      }
      val p = pool
      if (p == null) {
        client.close()
        break
      }
      try {
        p.execute { handle(client) }
      } catch (_: Exception) {
        client.close()
      }
    }
  }

  private fun handle(client: Socket) {
    client.use { sock ->
      try {
        sock.soTimeout = 15_000
        if (!sock.inetAddress.isLoopbackAddress) return
        val head = readHead(sock.getInputStream()) ?: return respond(sock.getOutputStream(), 400, "Bad Request")
        val lines = head.split("\r\n")
        val parts = lines.first().split(" ")
        if (parts.size < 3) return respond(sock.getOutputStream(), 400, "Bad Request")
        val method = parts[0]
        if (method != "GET" && method != "HEAD") return respond(sock.getOutputStream(), 405, "Method Not Allowed")
        val range = lines.drop(1).firstOrNull { it.lowercase(Locale.ROOT).startsWith("range:") }?.substringAfter(':')?.trim()
        serve(sock.getOutputStream(), method == "HEAD", parts[1], range)
      } catch (_: Exception) {
        // The player closed the connection or timed out: nothing to answer.
      }
    }
  }

  private fun serve(out: OutputStream, headOnly: Boolean, rawPath: String, range: String?) {
    val path = rawPath.substringBefore('?').substringBefore('#')
    val segs = path.split("/").drop(1)
    if (segs.size < 3 || !constantTimeEquals(segs[0], token)) return respond(out, 404, "Not Found")
    val itemId = segs[1]
    val rest = segs.drop(2)
    if (!isSafeSegment(itemId) || rest.any { !isSafeSegment(it) }) return respond(out, 404, "Not Found")

    if (rest.size == 1 && rest[0] == "key") {
      val key = keys[itemId] ?: return respond(out, 404, "Not Found")
      return sendBytes(out, headOnly, key, "application/octet-stream")
    }

    val file = File(File(root, itemId), rest.joinToString(File.separator)).canonicalFile
    val rootPath = root.canonicalPath + File.separator
    if (!file.path.startsWith(rootPath) || !file.isFile) return respond(out, 404, "Not Found")
    val length = file.length()
    val type = contentType(file.name)

    var start = 0L
    var end = length - 1
    var partial = false
    if (range != null) {
      val parsed = parseRange(range, length)
      if (parsed == null) {
        val body = ByteArray(0)
        writeHead(out, 416, "Range Not Satisfiable", mapOf("Content-Range" to "bytes */$length", "Content-Length" to "0"))
        out.write(body)
        out.flush()
        return
      }
      start = parsed.first
      end = parsed.second
      partial = true
    }
    val count = if (length == 0L) 0L else end - start + 1
    val headers = mutableMapOf("Content-Type" to type, "Content-Length" to count.toString(), "Accept-Ranges" to "bytes", "Cache-Control" to "no-store")
    if (partial) headers["Content-Range"] = "bytes $start-$end/$length"
    val buffered = BufferedOutputStream(out, 64 * 1024)
    writeHead(buffered, if (partial) 206 else 200, if (partial) "Partial Content" else "OK", headers)
    if (!headOnly && count > 0) {
      RandomAccessFile(file, "r").use { raf ->
        raf.seek(start)
        val buf = ByteArray(64 * 1024)
        var left = count
        while (left > 0) {
          val n = raf.read(buf, 0, minOf(buf.size.toLong(), left).toInt())
          if (n <= 0) break
          buffered.write(buf, 0, n)
          left -= n
        }
      }
    }
    buffered.flush()
  }

  private fun sendBytes(out: OutputStream, headOnly: Boolean, body: ByteArray, type: String) {
    writeHead(out, 200, "OK", mapOf("Content-Type" to type, "Content-Length" to body.size.toString(), "Cache-Control" to "no-store"))
    if (!headOnly) out.write(body)
    out.flush()
  }

  private fun respond(out: OutputStream, status: Int, reason: String) {
    val body = reason.toByteArray()
    writeHead(out, status, reason, mapOf("Content-Type" to "text/plain", "Content-Length" to body.size.toString()))
    out.write(body)
    out.flush()
  }

  private fun writeHead(out: OutputStream, status: Int, reason: String, headers: Map<String, String>) {
    val sb = StringBuilder("HTTP/1.1 $status $reason\r\n")
    for ((k, v) in headers) sb.append(k).append(": ").append(v).append("\r\n")
    sb.append("Connection: close\r\n\r\n")
    out.write(sb.toString().toByteArray(Charsets.US_ASCII))
  }

  /** Reads up to the blank line ending the request head (16 KB at most). */
  private fun readHead(input: InputStream): String? {
    val buf = StringBuilder()
    while (buf.length < 16 * 1024) {
      val b = input.read()
      if (b < 0) return null
      buf.append(b.toChar())
      if (buf.endsWith("\r\n\r\n")) return buf.substring(0, buf.length - 4)
    }
    return null
  }

  companion object {
    private val SAFE = Regex("^[A-Za-z0-9._-]{1,128}$")

    fun isSafeSegment(s: String): Boolean = s != "." && s != ".." && SAFE.matches(s)

    /** `bytes=a-b`, `bytes=a-` or `bytes=-n` against a file of `length`; null when unsatisfiable. */
    fun parseRange(header: String, length: Long): Pair<Long, Long>? {
      val m = Regex("^bytes=(\\d*)-(\\d*)$").find(header.trim()) ?: return null
      val (a, b) = m.destructured
      if (length <= 0) return null
      return when {
        a.isEmpty() && b.isEmpty() -> null
        a.isEmpty() -> {
          val n = b.toLongOrNull() ?: return null
          if (n <= 0) null else Pair(maxOf(0, length - n), length - 1)
        }
        else -> {
          val s = a.toLongOrNull() ?: return null
          val e = if (b.isEmpty()) length - 1 else minOf(b.toLongOrNull() ?: return null, length - 1)
          if (s >= length || e < s) null else Pair(s, e)
        }
      }
    }

    fun contentType(name: String): String = when (name.substringAfterLast('.', "").lowercase(Locale.ROOT)) {
      "m3u8" -> "application/vnd.apple.mpegurl"
      "ts" -> "video/mp2t"
      "m4s", "mp4", "m4v" -> "video/mp4"
      "aac" -> "audio/aac"
      "vtt" -> "text/vtt"
      else -> "application/octet-stream"
    }

    private fun randomToken(): String {
      val bytes = ByteArray(16)
      SecureRandom().nextBytes(bytes)
      return bytes.joinToString("") { "%02x".format(it) }
    }

    private fun constantTimeEquals(a: String, b: String): Boolean = MessageDigest.isEqual(a.toByteArray(), b.toByteArray())
  }
}
