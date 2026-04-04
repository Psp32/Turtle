import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[Turtle UI]', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="glass-panel" style={{ margin: '2rem', padding: '1.5rem', maxWidth: 560 }}>
          <p className="eyebrow">CLIENT ERROR</p>
          <h2>Something broke in the cockpit</h2>
          <p className="subtle-copy">{String(this.state.error?.message ?? this.state.error)}</p>
          <button
            type="button"
            className="primary-button"
            style={{ marginTop: '1rem' }}
            onClick={() => {
              this.setState({ error: null });
              window.location.assign('/');
            }}
          >
            Reload app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
