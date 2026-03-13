import { env } from "@repo/env/native";
import { authClient } from "./auth-client";

const BASE_URL = env.EXPO_PUBLIC_SERVER_URL;

// Next.js frontend URL (used for the /api/chat proxy)
export const WEB_URL = env.EXPO_PUBLIC_SERVER_URL;

async function apiFetch(path: string, init?: RequestInit) {
  const session = await authClient.getSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string>),
  };

  if (session?.data?.session?.token) {
    headers.Authorization = `Bearer ${session.data.session.token}`;
  }

  return fetch(`${BASE_URL}${path}`, { ...init, headers });
}

export const api = {
  get: (path: string) => apiFetch(path, { method: "GET" }),
  post: (path: string, body: unknown) =>
    apiFetch(path, { method: "POST", body: JSON.stringify(body) }),
};
