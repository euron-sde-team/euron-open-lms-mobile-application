package org.openlms.loopback

import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

/**
 * JS API of the loopback server: start(rootDir) -> { port, token }, stop(), setKey(itemId, base64Key).
 * One server per app process; keys live only in its memory and die with it.
 */
class LoopbackServerModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private var server: LoopbackHttpServer? = null

  override fun getName() = NAME

  @ReactMethod
  fun start(rootDir: String, promise: Promise) {
    synchronized(this) {
      try {
        val root = File(rootDir).canonicalFile
        val running = server
        if (running != null && running.isRunning && running.root == root) {
          promise.resolve(describe(running))
          return
        }
        running?.stop()
        if (!root.exists()) root.mkdirs()
        val next = LoopbackHttpServer(root)
        next.start()
        server = next
        promise.resolve(describe(next))
      } catch (e: Exception) {
        promise.reject("LOOPBACK_START_FAILED", e.message, e)
      }
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    synchronized(this) {
      server?.stop()
      server = null
    }
    promise.resolve(null)
  }

  @ReactMethod
  fun setKey(itemId: String, base64Key: String, promise: Promise) {
    val running = synchronized(this) { server }
    if (running == null) {
      promise.reject("LOOPBACK_NOT_RUNNING", "Start the loopback server first")
      return
    }
    if (!LoopbackHttpServer.isSafeSegment(itemId)) {
      promise.reject("LOOPBACK_BAD_ID", "Invalid item id")
      return
    }
    try {
      running.setKey(itemId, Base64.decode(base64Key, Base64.DEFAULT))
      promise.resolve(null)
    } catch (e: IllegalArgumentException) {
      promise.reject("LOOPBACK_BAD_KEY", "The key is not valid base64", e)
    }
  }

  override fun invalidate() {
    synchronized(this) {
      server?.stop()
      server = null
    }
    super.invalidate()
  }

  private fun describe(s: LoopbackHttpServer) = Arguments.createMap().apply {
    putInt("port", s.port)
    putString("token", s.token)
  }

  companion object {
    const val NAME = "OpenLmsLoopback"
  }
}
