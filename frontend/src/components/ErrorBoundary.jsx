import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 m-6 bg-red-50 border border-red-200 rounded-2xl text-red-900 max-w-2xl">
          <div className="flex items-center gap-2 mb-2 font-bold text-base text-red-950">
            <span>⚠️</span> Rendering Error
          </div>
          <p className="text-xs text-red-700 mb-1">
            An error occurred while rendering this view. The navigation sidebar and rest of GeoVision AI remain accessible.
          </p>
          <p className="text-xs font-mono bg-red-100/70 p-3 rounded-lg text-red-900 my-3 break-all border border-red-200">
            {this.state.error?.message || 'Unknown rendering error'}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
