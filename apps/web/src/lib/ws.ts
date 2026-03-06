const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export function getWsUrl(): string {
  const url = new URL(API_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  return url.toString();
}
