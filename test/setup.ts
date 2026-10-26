/**
 * Mocks for every native module the app links, so screens and hooks render in Node.
 * Keep them minimal: tests assert behaviour through these, not native internals.
 */
jest.mock("react-native-config", () => ({ __esModule: true, default: { API_BASE_URL: "http://api.test/api", WEB_BASE_URL: "http://web.test", APP_SCHEME: "openlms" } }));
jest.mock("@react-native-community/netinfo", () => require("@react-native-community/netinfo/jest/netinfo-mock.js"));
jest.mock("react-native-device-info", () => require("react-native-device-info/jest/react-native-device-info-mock.js"));

jest.mock("react-native-mmkv", () => {
  const stores = new Map<string, Map<string, unknown>>();
  return {
    createMMKV: ({ id = "default" }: { id?: string } = {}) => {
      if (!stores.has(id)) stores.set(id, new Map());
      const m = stores.get(id)!;
      return {
        set: (k: string, v: unknown) => m.set(k, v),
        getString: (k: string) => (typeof m.get(k) === "string" ? (m.get(k) as string) : undefined),
        getNumber: (k: string) => (typeof m.get(k) === "number" ? (m.get(k) as number) : undefined),
        getBoolean: (k: string) => (typeof m.get(k) === "boolean" ? (m.get(k) as boolean) : undefined),
        contains: (k: string) => m.has(k),
        remove: (k: string) => m.delete(k),
        clearAll: () => m.clear(),
      };
    },
  };
});

jest.mock("react-native-keychain", () => {
  const vault = new Map<string, { username: string; password: string }>();
  return {
    ACCESSIBLE: { AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "AccessibleAfterFirstUnlockThisDeviceOnly" },
    setGenericPassword: jest.fn(async (username: string, password: string, o?: { service?: string }) => {
      vault.set(o?.service ?? "default", { username, password });
      return { service: o?.service, storage: "mock" };
    }),
    getGenericPassword: jest.fn(async (o?: { service?: string }) => vault.get(o?.service ?? "default") ?? false),
    resetGenericPassword: jest.fn(async (o?: { service?: string }) => vault.delete(o?.service ?? "default")),
  };
});

jest.mock("react-native-safe-area-context", () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});

jest.mock("react-native-video", () => {
  const React = require("react");
  const { View } = require("react-native");
  const Video = React.forwardRef((props: object, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({ seek: jest.fn(), presentFullscreenPlayer: jest.fn(), dismissFullscreenPlayer: jest.fn(), pause: jest.fn(), resume: jest.fn() }));
    return React.createElement(View, { testID: "video", ...props });
  });
  return { __esModule: true, default: Video, SelectedTrackType: { INDEX: "index", AUTO: "auto", DISABLED: "disabled", RESOLUTION: "resolution" }, ResizeMode: { CONTAIN: "contain", COVER: "cover" } };
});

jest.mock("react-native-youtube-iframe", () => {
  const React = require("react");
  const { View } = require("react-native");
  return { __esModule: true, default: (p: object) => React.createElement(View, { testID: "youtube", ...p }) };
});
jest.mock("react-native-webview", () => {
  const React = require("react");
  const { View } = require("react-native");
  return { __esModule: true, WebView: (p: object) => React.createElement(View, { testID: "webview", ...p }), default: (p: object) => React.createElement(View, p) };
});
jest.mock("react-native-pdf", () => {
  const React = require("react");
  const { View } = require("react-native");
  return { __esModule: true, default: (p: object) => React.createElement(View, { testID: "pdf", ...p }) };
});
jest.mock("react-native-blob-util", () => ({
  __esModule: true,
  default: {
    fs: { dirs: { DocumentDir: "/docs", CacheDir: "/cache" }, exists: jest.fn(async () => false), unlink: jest.fn(async () => undefined), mkdir: jest.fn(async () => undefined), ls: jest.fn(async () => []), stat: jest.fn(async () => ({ size: 0 })), writeFile: jest.fn(async () => undefined), readFile: jest.fn(async () => "") },
    config: () => ({ fetch: jest.fn(async () => ({ path: () => "/cache/file", info: () => ({ status: 200 }) })) }),
    fetch: jest.fn(async () => ({ info: () => ({ status: 200 }), path: () => "/cache/file" })),
    wrap: (p: string) => `RNFetchBlob-file://${p}`,
  },
}));
jest.mock("react-native-screenguard", () => ({ __esModule: true, default: { register: jest.fn(), registerWithBlurView: jest.fn(), unregister: jest.fn() } }));
jest.mock("react-native-orientation-director", () => ({ __esModule: true, default: { lockTo: jest.fn(), unlock: jest.fn() }, Orientation: { portrait: 1, landscapeLeft: 4, landscapeRight: 3 } }));
jest.mock("@react-native-firebase/app", () => ({ __esModule: true, getApp: jest.fn(() => { throw new Error("no firebase in tests"); }), getApps: jest.fn(() => []) }));
jest.mock("@react-native-firebase/messaging", () => ({ __esModule: true, getMessaging: jest.fn(), getToken: jest.fn(async () => "push-token"), onMessage: jest.fn(() => () => undefined), onTokenRefresh: jest.fn(() => () => undefined), requestPermission: jest.fn(async () => 1), AuthorizationStatus: { AUTHORIZED: 1, PROVISIONAL: 2, DENIED: 0 } }));
jest.mock("react-native-razorpay", () => ({ __esModule: true, default: { open: jest.fn() } }));
jest.mock("react-native-inappbrowser-reborn", () => ({ __esModule: true, InAppBrowser: { isAvailable: jest.fn(async () => true), openAuth: jest.fn(async () => ({ type: "cancel" })), open: jest.fn(async () => ({ type: "cancel" })), close: jest.fn() }, default: { isAvailable: jest.fn(async () => true), openAuth: jest.fn(async () => ({ type: "cancel" })) } }));
jest.mock("@react-native-documents/picker", () => ({ __esModule: true, pick: jest.fn(async () => []), types: { images: "public.image", pdf: "com.adobe.pdf", allFiles: "public.item" }, isErrorWithCode: () => false, errorCodes: { OPERATION_CANCELED: "OPERATION_CANCELED" } }));
jest.mock("react-native-share", () => ({ __esModule: true, default: { open: jest.fn(async () => ({ success: true })) } }));
jest.mock("react-native-render-html", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return { __esModule: true, default: ({ source }: { source: { html: string } }) => React.createElement(Text, null, source.html.replace(/<[^>]+>/g, "")) };
});
jest.mock("@react-native-clipboard/clipboard", () => ({ __esModule: true, default: { setString: jest.fn(), getString: jest.fn(async () => "") } }));

// React only checks act() wrapping when this is set; Testing Library's async render and
// findBy* queries wrap their own updates.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
