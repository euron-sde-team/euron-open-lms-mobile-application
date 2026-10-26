import { getApp } from "@react-native-firebase/app";
import { pushDecision, getPushMessaging, pushUrlOf, readPushPermission, registerPushToken, unregisterThisDevice, forgetThisDevice } from "./push";
import { PREF, prefs } from "./storage";

const base = { pushEnabled: true, hasFirebase: true, signedIn: true, permission: "granted" as const, asked: false };

describe("push registration guard", () => {
  it("stays off without Firebase, with push switched off on the server, or signed out", () => {
    expect(pushDecision({ ...base, hasFirebase: false })).toBe("off");
    expect(pushDecision({ ...base, pushEnabled: false })).toBe("off");
    expect(pushDecision({ ...base, signedIn: false })).toBe("off");
  });
  it("registers when allowed, asks once when undecided, and never re-asks after a refusal", () => {
    expect(pushDecision(base)).toBe("register");
    expect(pushDecision({ ...base, permission: "undetermined" })).toBe("ask");
    expect(pushDecision({ ...base, permission: "undetermined", asked: true })).toBe("off");
    expect(pushDecision({ ...base, permission: "denied" })).toBe("off");
    expect(pushDecision({ ...base, permission: "unavailable" })).toBe("off");
  });
  it("treats a build without a Firebase app as push off, silently", async () => {
    expect(getApp).toBeDefined();
    expect(getPushMessaging()).toBeNull();
    expect(await readPushPermission(null)).toBe("unavailable");
  });
});

describe("devices", () => {
  afterEach(() => prefs.remove(PREF.pushToken));
  it("registers the token and remembers it, then removes it on sign-out", async () => {
    const api = { devices: { register: jest.fn(async () => ({})), remove: jest.fn(async () => undefined) } } as never;
    await registerPushToken(api, "tok_1");
    expect((api as { devices: { register: jest.Mock } }).devices.register).toHaveBeenCalledWith(expect.objectContaining({ token: "tok_1", platform: expect.stringMatching(/^(IOS|ANDROID)$/) }));
    expect(prefs.getString(PREF.pushToken)).toBe("tok_1");
    await unregisterThisDevice(api);
    expect((api as { devices: { remove: jest.Mock } }).devices.remove).toHaveBeenCalledWith("tok_1");
    await forgetThisDevice(null);
    expect(prefs.getString(PREF.pushToken)).toBeUndefined();
  });
  it("reads the app path a push opens", () => {
    expect(pushUrlOf({ data: { url: "/learn/sql/it_1", type: "QA_REPLY" } })).toBe("/learn/sql/it_1");
    expect(pushUrlOf({ data: {} })).toBeNull();
    expect(pushUrlOf(null)).toBeNull();
  });
});
