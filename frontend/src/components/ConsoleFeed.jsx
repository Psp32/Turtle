function ConsoleFeed({ logs }) {
  if (!logs.length) {
    return <div className="terminal-empty">No output yet. Dispatch a command to populate the feed.</div>;
  }

  return (
    <div className="terminal-feed">
      {logs.map((log) => (
        <div key={log.id} className={`terminal-line is-${log.level}`}>
          <span className="terminal-timestamp">
            {new Date(log.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </span>
          <span>{log.line}</span>
        </div>
      ))}
    </div>
  );
}

export default ConsoleFeed;
