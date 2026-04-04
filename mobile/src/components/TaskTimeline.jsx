import StatusPill from './StatusPill';

function TaskTimeline({ tasks }) {
  if (!tasks.length) {
    return (
      <div className="timeline-empty">
        Draft a command to generate a routed workflow preview.
      </div>
    );
  }

  return (
    <div className="timeline-list">
      {tasks.map((task, index) => (
        <article key={task.id} className="timeline-card">
          <div className="timeline-rail">
            <span className={`timeline-dot is-${task.status}`} />
            {index < tasks.length - 1 ? <span className="timeline-line" /> : null}
          </div>

          <div className="timeline-content">
            <div className="timeline-header">
              <h4>{task.title}</h4>
              <StatusPill status={task.status} />
            </div>
            <p>{task.detail}</p>
            <span className="timeline-target">{task.nodeId ?? 'Pending node assignment'}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

export default TaskTimeline;
