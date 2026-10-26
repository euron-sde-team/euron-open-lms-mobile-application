/** The keys read from .env by react-native-config (see .env.example). */
declare module "react-native-config" {
  export interface NativeConfig {
    API_BASE_URL?: string;
    WEB_BASE_URL?: string;
    APP_SCHEME?: string;
    APP_LINK_HOST?: string;
    CAPTURE_GUARD?: string;
  }
  export const Config: NativeConfig;
  export default Config;
}
