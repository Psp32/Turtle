function AudioVisualizer({ isActive }) {
  return (
    <div className={isActive ? 'audio-visualizer is-active' : 'audio-visualizer'}>
      {Array.from({ length: 12 }).map((_, index) => (
        <span key={index} style={{ animationDelay: `${index * 0.08}s` }} />
      ))}
    </div>
  );
}

export default AudioVisualizer;
