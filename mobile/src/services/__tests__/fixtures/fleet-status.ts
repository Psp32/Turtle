import type { FleetPcSnapshot } from '../../../types/fleet';

export const mockFleetStatus: FleetPcSnapshot[] = [
  {
    id: 1,
    hostname: 'api-server-1',
    ip: '192.168.1.10',
    status: 'online',
    cpuLoad: 45,
    memoryUsage: 62,
    installedApps: JSON.stringify(['Node.js', 'Docker', 'Git']),
  },
  {
    id: 2,
    hostname: 'db-server-1',
    ip: '192.168.1.20',
    status: 'online',
    cpuLoad: 20,
    memoryUsage: 78,
    installedApps: JSON.stringify(['PostgreSQL', 'Redis', 'Docker']),
  },
  {
    id: 3,
    hostname: 'worker-1',
    ip: '192.168.1.30',
    status: 'offline',
    cpuLoad: 0,
    memoryUsage: 0,
    installedApps: JSON.stringify(['Python', 'Node.js']),
  },
];
