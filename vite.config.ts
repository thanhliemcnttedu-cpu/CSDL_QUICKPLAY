import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Thời điểm build: hiện ở chân trang là "ngày giờ cập nhật" của bản đang chạy
  define: { __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  server: { port: 5180 },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as never);
