import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Bắt lỗi hiển thị của một màn hình để KHÔNG làm trắng cả app: hiện thông báo dễ hiểu kèm dòng lỗi ngắn (để gửi cho người hỗ trợ)
 * và nút thử lại / tải lại. Đổi `resetKey` (ví dụ chuyển tab) thì tự thử vẽ lại.
 */
interface Props { children: ReactNode; resetKey?: string }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Lỗi hiển thị màn hình', error, info.componentStack); }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const stale = /dynamically imported module|Failed to fetch dynamically|Importing a module script failed|Loading chunk|ChunkLoadError/i.test(error.message);
    return (
      <div className="card" role="alert">
        <h2>Màn hình này gặp lỗi</h2>
        <p>{stale ? 'Có vẻ app vừa được cập nhật nên một phần chưa tải kịp. Hãy tải lại app.' : 'Dữ liệu của bạn vẫn an toàn. Hãy thử lại; nếu vẫn lỗi, gửi dòng bên dưới cho người hỗ trợ.'}</p>
        <p className="muted" style={{ wordBreak: 'break-word' }}>{error.message.slice(0, 240)}</p>
        <div className="btnrow">
          <button className="primary" onClick={() => window.location.reload()}>Tải lại app</button>
          <button className="secondary" onClick={() => this.setState({ error: null })}>Thử lại</button>
        </div>
      </div>
    );
  }
}
