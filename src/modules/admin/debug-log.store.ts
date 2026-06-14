import { RedactionService } from '../policy/redaction.service';

type DebugLogEntry = Record<string, unknown> & {
  ts?: number;
  level?: string;
  message?: string;
  provider?: string;
};

const debugLogStore: DebugLogEntry[] = [];
const MAX_DEBUG_STORE = 500;

export function pushDebugLog(entry: DebugLogEntry): void {
  const redacted = RedactionService.redact(entry) as DebugLogEntry;
  debugLogStore.unshift(redacted);
  if (debugLogStore.length > MAX_DEBUG_STORE) debugLogStore.pop();
}

export function getDebugLogsSince(since: number): DebugLogEntry[] {
  return debugLogStore.filter((e) => (e.ts || 0) > since);
}

export function clearDebugLogs(): void {
  debugLogStore.length = 0;
}
