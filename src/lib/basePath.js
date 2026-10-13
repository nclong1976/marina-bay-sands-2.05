// Đường dẫn gốc mà app được phục vụ. Mặc định là "/" (Render / server Node),
// còn khi build cho GitHub Pages thì là "/<tên-repo>/" (xem VITE_BASE_PATH
// trong vite.config.js và .github/workflows/deploy-pages.yml).
export const BASE_PATH = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '') || '';

// Gắn base path vào một đường dẫn tuyệt đối trong app, vd "/login" -> "/repo/login".
// Dùng cho các chỗ điều hướng bằng window.location thay vì react-router.
export const withBase = (path = '/') => {
  if (/^[a-z]+:\/\//i.test(path)) return path;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_PATH}${p}`;
};

// Bỏ base path khỏi window.location.pathname để so sánh với route trong app.
export const stripBase = (pathname = '/') => {
  if (BASE_PATH && pathname.startsWith(BASE_PATH)) {
    return pathname.slice(BASE_PATH.length) || '/';
  }
  return pathname;
};
