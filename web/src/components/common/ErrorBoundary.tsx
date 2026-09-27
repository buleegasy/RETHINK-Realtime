import React, { Component, type ReactNode } from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, errorInfo);
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleClearAndReset = () => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('rethink_run_mode');
        localStorage.removeItem('rethink_teacher_auth');
      }
    } catch {}
    if (this.props.onReset) {
      this.props.onReset();
    }
    window.location.href = '/';
  };

  private isChunkLoadFailure(msg: string): boolean {
    return (
      msg.includes('dynamically imported module') ||
      msg.includes('Loading chunk') ||
      msg.includes('ChunkLoadError') ||
      msg.includes('Failed to fetch')
    );
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const errorMsg = this.state.error?.message || '未知前端渲染异常';
    const isChunkError = this.isChunkLoadFailure(errorMsg);

    return (
      <div className="fixed inset-0 w-full h-[100dvh] bg-[#f8f9fa] flex items-center justify-center p-4 font-sans select-none">
        <div className="bg-white max-w-md w-full rounded-3xl border border-[#c4c7c5] shadow-sm p-6 sm:p-8 space-y-6 text-center animate-in fade-in duration-200">
          <div className="w-12 h-12 rounded-2xl bg-[#fee2e2] text-[#ba1a1a] flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>

          <div className="space-y-2">
            <h2 className="text-base sm:text-lg font-bold text-[#1f1f1f]">
              {isChunkError ? '系统资源已更新' : this.props.fallbackTitle || '页面加载遇到意外'}
            </h2>
            <p className="text-xs text-[#5e5e5e] leading-relaxed">
              {isChunkError
                ? '检测到云端已部署最新版本。请刷新页面以载入最新的运行环境与资源。'
                : '系统在渲染过程中遇到临时状态不一致，您可以直接刷新或重置本地会话缓存。'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="flex-1 py-2.5 px-4 rounded-xl text-xs font-medium bg-[#004a77] text-white hover:bg-[#003355] transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{isChunkError ? '载入最新版本' : '刷新重试'}</span>
            </button>
            <button
              type="button"
              onClick={this.handleClearAndReset}
              className="flex-1 py-2.5 px-4 rounded-xl text-xs font-medium bg-white text-[#444746] border border-[#c4c7c5] hover:bg-[#f0f4f9] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Home className="w-3.5 h-3.5" />
              <span>重置状态返回</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
}
