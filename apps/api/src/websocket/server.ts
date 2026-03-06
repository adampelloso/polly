/**
 * WebSocket server for real-time updates:
 * - Pool size updates on new entries
 * - Resolution progress (event-by-event)
 * - Leaderboard updates during settling
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";

interface WsMessage {
  type: string;
  contestId: string;
  data: unknown;
}

// Map of contestId → Set of connected clients
const contestRooms = new Map<string, Set<WebSocket>>();

let wss: WebSocketServer | null = null;

export function initWebSocket(server: Server) {
  wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    let subscribedContest: string | null = null;

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === "subscribe" && msg.contestId) {
          // Unsubscribe from previous
          if (subscribedContest) {
            contestRooms.get(subscribedContest)?.delete(ws);
          }

          // Subscribe to new contest
          subscribedContest = msg.contestId;
          if (!contestRooms.has(subscribedContest!)) {
            contestRooms.set(subscribedContest!, new Set());
          }
          contestRooms.get(subscribedContest!)!.add(ws);
        }

        if (msg.type === "unsubscribe") {
          if (subscribedContest) {
            contestRooms.get(subscribedContest)?.delete(ws);
            subscribedContest = null;
          }
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on("close", () => {
      if (subscribedContest) {
        contestRooms.get(subscribedContest)?.delete(ws);
        // Cleanup empty rooms
        if (contestRooms.get(subscribedContest)?.size === 0) {
          contestRooms.delete(subscribedContest);
        }
      }
    });
  });

  return wss;
}

// ── Broadcast Helpers ──

function broadcastToContest(contestId: string, message: WsMessage) {
  const clients = contestRooms.get(contestId);
  if (!clients) return;

  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

export function broadcastPoolUpdate(
  contestId: string,
  totalEntries: number,
  totalPoolUsdc: number
) {
  broadcastToContest(contestId, {
    type: "pool_update",
    contestId,
    data: { totalEntries, totalPoolUsdc },
  });
}

export function broadcastEventResolution(
  contestId: string,
  eventId: string,
  resolvedOutcome: string
) {
  broadcastToContest(contestId, {
    type: "event_resolved",
    contestId,
    data: { eventId, resolvedOutcome },
  });
}

export function broadcastLeaderboardUpdate(
  contestId: string,
  standings: Array<{
    walletAddress: string;
    score: number;
    correctCount: number;
    rank: number;
  }>
) {
  broadcastToContest(contestId, {
    type: "leaderboard_update",
    contestId,
    data: { standings },
  });
}

export function broadcastContestStatus(contestId: string, status: string) {
  broadcastToContest(contestId, {
    type: "contest_status",
    contestId,
    data: { status },
  });
}
