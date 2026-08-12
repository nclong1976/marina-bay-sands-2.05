import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0A0E1A] text-white flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/50 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-2 text-amber-200">Đã có lỗi xảy ra</h2>
          <p className="text-sm text-gray-400 max-w-sm mb-6">
            Hệ thống gặp sự cố không mong muốn. Vui lòng tải lại trang hoặc quay lại trang chủ.
          </p>
          <div className="flex gap-3">
            <button
              onClick={this.handleReload}
              className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-semibold rounded-lg text-sm transition-all"
            >
              Về Trang Chủ
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold rounded-lg text-sm transition-all border border-gray-700"
            >
              Tải Lại Trang
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
