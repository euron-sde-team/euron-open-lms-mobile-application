/**
 * open-lms-loopback: serves downloaded HLS lectures to the platform player from
 * 127.0.0.1, with the content key held in native memory only.
 */
const { NativeModules } = require("react-native");

function native() {
  const m = NativeModules.OpenLmsLoopback;
  if (!m) throw new Error("open-lms-loopback is not linked. Rebuild the app after installing it.");
  return m;
}

module.exports = {
  isAvailable: () => !!NativeModules.OpenLmsLoopback,
  start: (rootDir) => native().start(rootDir),
  stop: () => native().stop(),
  setKey: (itemId, base64Key) => native().setKey(itemId, base64Key),
};
