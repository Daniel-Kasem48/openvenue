import { Component, type ReactNode } from 'react';
export class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="empty">3D is unavailable on this device. Use the 2D view to continue.</div>
    ) : (
      this.props.children
    );
  }
}
