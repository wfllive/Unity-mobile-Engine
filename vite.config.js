import { defineConfig } from 'vite';
import { buildRuntime, RUNTIME_BUNDLE_PATH } from './tools/build-runtime.mjs';

/**
 * Рантайм-бандл (src/apk/runtime-bundle.js) генерируется скриптом и лежит в
 * .gitignore. Если запустить `vite` напрямую (минуя npm run dev), файла нет —
 * и Vite падает при анализе `import('./runtime-bundle.js')` в runtime-html.js.
 * Плагин собирает его до старта сервера и пересобирает при правках движка.
 */
function wflRuntimePlugin() {
  let building = null;
  const ensure = (force = false) => {
    building ??= buildRuntime({ force }).finally(() => { building = null; });
    return building;
  };

  return {
    name: 'wfl-runtime-bundle',
    // Должен отработать до resolve импортов — иначе Vite не найдёт файл
    async buildStart() { await ensure(); },
    async configureServer(server) {
      await ensure();
      // Правки движка/рантайма должны попадать в APK без перезапуска сервера
      server.watcher.on('change', async (file) => {
        const f = file.replace(/\\/g, '/');
        if (!f.includes('/src/')) return;
        if (f.endsWith('runtime-bundle.js')) return;
        if (!f.includes('/src/engine/') && !f.includes('/src/runtime/')) return;
        try {
          await ensure(true);
          const mod = server.moduleGraph.getModuleById(RUNTIME_BUNDLE_PATH);
          if (mod) server.moduleGraph.invalidateModule(mod);
        } catch (err) {
          server.config.logger.error(`WFL: не удалось пересобрать рантайм — ${err.message}`);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [wflRuntimePlugin()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    // Разрешаем превью-домены песочницы (иначе Vite отклонит запрос по Host)
    allowedHosts: true,
    hmr: { clientPort: 443, protocol: 'wss' },
  },
  preview: { host: '0.0.0.0', port: 3000, allowedHosts: true },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'] },
      },
    },
  },
  optimizeDeps: {
    include: ['three', 'fflate'],
    // Бандл — гигантская строка; предбандлить его незачем
    exclude: ['/src/apk/runtime-bundle.js'],
  },
});
