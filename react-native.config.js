/**
 * Native module linking. Razorpay is Android only: on iOS the app never offers an
 * in-app checkout (purchases happen on the web), so its SDK is not linked there.
 */
module.exports = {
  project: { ios: {}, android: {} },
  dependencies: {
    "react-native-razorpay": { platforms: { ios: null } },
  },
  assets: ["./src/assets/fonts"],
};
