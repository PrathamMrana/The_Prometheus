import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Critical UI Failure Caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-8 glass border border-bear/20 rounded-sm bg-bear/5">
          <div className="w-12 h-12 rounded-full bg-bear/20 flex items-center justify-center mb-6">
            <span className="text-bear text-2xl font-black">!</span>
          </div>
          <h2 className="text-xl font-syne font-black text-white tracking-widest uppercase mb-4">Module Integration Error</h2>
          <p className="text-[10px] font-mono text-muted uppercase tracking-widest text-center max-w-md leading-relaxed">
            The system encountered a synchronization error in this component. This usually happens during modular hot-reload.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-8 px-6 py-2 bg-white/5 border border-white/10 text-[10px] font-mono text-white tracking-widest uppercase hover:bg-white/10 transition-all"
          >
            Terminal Reset →
          </button>
          <div className="mt-8 p-4 bg-black/40 rounded border border-white/5 w-full max-w-lg overflow-x-auto">
             <pre className="text-[9px] font-mono text-bear/70">{this.state.error?.stack || this.state.error?.toString()}</pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
