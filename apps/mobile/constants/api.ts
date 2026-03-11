import Constants from "expo-constants";

// In dev: set API_URL in app.json extra or .env
// On device: use your machine's LAN IP, e.g. "http://192.168.1.x:8000"
export const API_URL: string =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  "http://localhost:8000";
