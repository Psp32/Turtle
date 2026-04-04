import { DbConnection, type DbConnectionBuilder } from '../module_bindings/index';

export type SpacetimeReconnectConfig = {
  uri: string;
  databaseName: string;
  token?: string;
  /** First reconnect delay (default 1000 ms). */
  initialBackoffMs?: number;
  /** Cap for exponential backoff (default 30_000 ms). */
  maxBackoffMs?: number;
  /** Called after each successful connection (subscribe here). */
  onConnected?: (conn: DbConnection) => void;
};

/** Exported for tests — delay before reconnect attempt `n` (0-based). */
export function reconnectDelayMs(
  attemptIndex: number,
  initialBackoffMs = 1000,
  maxBackoffMs = 30_000
): number {
  return Math.min(maxBackoffMs, initialBackoffMs * 2 ** attemptIndex);
}

/**
 * Long-lived SpacetimeDB WebSocket: reconnects with exponential backoff after
 * disconnect or initial connect error. Call `stop()` to tear down cleanly.
 */
export function createSpacetimeReconnect(config: SpacetimeReconnectConfig): {
  start: () => void;
  stop: () => void;
  getConnection: () => DbConnection | null;
} {
  let connection: DbConnection | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let attempt = 0;
  const initial = config.initialBackoffMs ?? 1000;
  const max = config.maxBackoffMs ?? 30_000;

  const clearTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (stopped) return;
    clearTimer();
    const delay = reconnectDelayMs(attempt, initial, max);
    attempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectNow();
    }, delay);
  };

  const connectNow = () => {
    if (stopped) return;
    clearTimer();
    try {
      connection?.disconnect();
    } catch {
      /* already closed */
    }
    connection = null;

    const builder: DbConnectionBuilder = DbConnection.builder()
      .withUri(config.uri)
      .withDatabaseName(config.databaseName)
      .withToken(config.token)
      .onConnect((conn) => {
        attempt = 0;
        connection = conn;
        config.onConnected?.(conn);
      })
      .onDisconnect(() => {
        connection = null;
        if (!stopped) {
          scheduleReconnect();
        }
      })
      .onConnectError(() => {
        if (!stopped) {
          scheduleReconnect();
        }
      });

    connection = builder.build();
  };

  return {
    start: () => {
      stopped = false;
      attempt = 0;
      connectNow();
    },
    stop: () => {
      stopped = true;
      clearTimer();
      try {
        connection?.disconnect();
      } catch {
        /* ignore */
      }
      connection = null;
    },
    getConnection: () => connection,
  };
}
