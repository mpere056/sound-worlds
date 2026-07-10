export const MARBLE_LIVE_REQUEST_INTERVAL_MS = 100;

export function nextMarbleRequestDelay(now: number, lastRequestAt: number, intervalMs = MARBLE_LIVE_REQUEST_INTERVAL_MS): number {
  if (!Number.isFinite(lastRequestAt)) return 0;
  return Math.max(0, intervalMs - (now - lastRequestAt));
}
