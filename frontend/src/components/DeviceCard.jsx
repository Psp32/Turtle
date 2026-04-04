import { motion } from 'framer-motion';
import StatusPill from './StatusPill';

function DeviceCard({ device, index = 0 }) {
  return (
    <motion.article
      className="device-card glass-panel"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
    >
      <div className="device-card-header">
        <div>
          <p className="eyebrow">{device.zone}</p>
          <h3>{device.name}</h3>
        </div>
        <StatusPill status={device.status} />
      </div>

      <div className="device-meta">
        <span>{device.ip}</span>
        <span>{device.latency}ms latency</span>
      </div>

      <div className="metric-stack">
        <div className="metric-row">
          <div className="metric-label">
            <span>CPU</span>
            <span>{Math.round(device.cpu)}%</span>
          </div>
          <div className="metric-bar">
            <span style={{ width: `${device.cpu}%` }} />
          </div>
        </div>

        <div className="metric-row">
          <div className="metric-label">
            <span>Memory</span>
            <span>{Math.round(device.memory)}%</span>
          </div>
          <div className="metric-bar secondary">
            <span style={{ width: `${device.memory}%` }} />
          </div>
        </div>
      </div>

      <p className="device-task">{device.activeTask}</p>
      <div className="capability-row">
        {device.capabilities.map((capability) => (
          <span key={capability} className="capability-pill">
            {capability}
          </span>
        ))}
      </div>
    </motion.article>
  );
}

export default DeviceCard;
