/**
 * Minimal fleet row for Gemini prompts (matches PcAgent fields from SpacetimeDB).
 * Map from generated client rows when wiring the app.
 */
export interface FleetPcSnapshot {
  id: number | bigint;
  hostname: string;
  ip: string;
  status: string;
  cpuLoad: number;
  memoryUsage: number;
  installedApps: string;
}
