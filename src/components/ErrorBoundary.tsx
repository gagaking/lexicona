import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-[#FCFBF9] p-8">
          <div className="bg-white border border-[#E0E0E0] p-8 max-w-lg shadow-xl">
            <h1 className="text-lg font-medium text-red-600 mb-4">应用发生错误</h1>
            <p className="text-sm text-[#7A7A7A] mb-4 leading-relaxed">
              组件渲染时出现异常。请尝试刷新页面。如果问题持续，请检查控制台日志。
            </p>
            <pre className="text-xs bg-[#F5F5F5] p-4 border border-[#E0E0E0] max-h-32 overflow-auto whitespace-pre-wrap break-all">
              {this.state.error?.message}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 px-6 py-2 bg-[#1E1E1E] text-white text-sm hover:bg-black transition-colors"
            >
              刷新页面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
