/** Autolinking for the local loopback server module (iOS pod and Android library). */
module.exports = {
  dependency: {
    platforms: {
      ios: { podspecPath: require("path").join(__dirname, "open-lms-loopback.podspec") },
      android: {
        sourceDir: "./android",
        packageImportPath: "import org.openlms.loopback.LoopbackServerPackage;",
        packageInstance: "new LoopbackServerPackage()",
      },
    },
  },
};
