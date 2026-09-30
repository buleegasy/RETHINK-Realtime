import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../src/components/common/ErrorBoundary';

const BombComponent = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test dynamic module crash');
  }
  return <div>正常的子组件内容</div>;
};

describe('ErrorBoundary 全局防白屏容灾测试', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('正常渲染无异常的子组件', () => {
    render(
      <ErrorBoundary>
        <BombComponent shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('正常的子组件内容')).toBeInTheDocument();
  });

  it('捕获子组件渲染异常并展示友好容灾界面，杜绝页面空白', () => {
    render(
      <ErrorBoundary fallbackTitle="页面崩溃降级提示">
        <BombComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.queryByText('正常的子组件内容')).not.toBeInTheDocument();
    expect(screen.getByText('页面崩溃降级提示')).toBeInTheDocument();
    expect(screen.getByText('刷新重试')).toBeInTheDocument();
    expect(screen.getByText('重置状态返回')).toBeInTheDocument();
  });

  it('捕获 ChunkLoadError 自动识别为云端资源更新提示', () => {
    const ChunkBomb = () => {
      throw new Error('Failed to fetch dynamically imported module /assets/AdminPortal.js');
    };

    render(
      <ErrorBoundary>
        <ChunkBomb />
      </ErrorBoundary>,
    );

    expect(screen.getByText('系统资源已更新')).toBeInTheDocument();
    expect(screen.getByText('载入最新版本')).toBeInTheDocument();
  });
});
