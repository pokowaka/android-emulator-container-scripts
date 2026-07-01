import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import terminal from 'vite-plugin-terminal';

const protoCommonjsPlugin = () => {
  return {
    name: 'proto-commonjs',
    transform(code, id) {
      if (id.endsWith('emulator_controller_pb.js')) {
        let transformed = code
          .replace(/var jspb = require\(['"]google-protobuf['"]\);/g, "import * as jspb from 'google-protobuf';")
          .replace(/var google_protobuf_empty_pb = require\(['"]google-protobuf\/google\/protobuf\/empty_pb\.js['"]\);/g, "import * as google_protobuf_empty_pb from 'google-protobuf/google/protobuf/empty_pb.js';");
        
        transformed = transformed.replace(/goog\.object\.extend\(exports, proto\.android\.emulation\.control\);/g, "export default proto.android.emulation.control;");
        
        return {
          code: transformed,
          map: null
        };
      }
      return null;
    }
  };
};

const customTerminalLoggingPlugin = () => {
  return {
    name: 'custom-terminal-logging',
    configureServer(server) {
      server.middlewares.use('/__terminal', (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const pathname = url.pathname;
        const message = url.searchParams.get('m') || '';
        const method = pathname.slice(1);

        const colors = {
          log: '\x1b[35m',   // Magenta
          info: '\x1b[37m',  // White
          debug: '\x1b[36m', // Cyan
          warn: '\x1b[33m',  // Yellow
          error: '\x1b[31m', // Red
          assert: '\x1b[31m',// Red
          reset: '\x1b[0m'
        };

        const color = colors[method] || colors.log;
        console.log(`${color}» ${message}${colors.reset}`);

        res.statusCode = 200;
        res.end();
      });
    }
  };
};

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  return {
    base: '/android-emulator-webrtc/',
    plugins: [
      react(),
      protoCommonjsPlugin(),
      customTerminalLoggingPlugin(),
      terminal({ console: command === 'serve' ? 'terminal' : undefined }),
    ],

    optimizeDeps: {
      include: [
        'google-protobuf/google/protobuf/empty_pb.js'
      ],
      esbuildOptions: {
        loader: {
          '.js': 'jsx',
        },
      },
    },
    build: {
      commonjsOptions: {
        include: [/node_modules/, /src\/proto/],
      },
    },
    server: {
      proxy: {
        '/api/v1/emulator/ws-jsep': {
          target: 'ws://localhost:8080',
          changeOrigin: true,
          ws: true,
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.error('Proxy WS Error:', err.message);
            });
            proxy.on('open', (_proxySocket) => {
              console.log('Proxy WS connection opened');
            });
            proxy.on('close', (_res, _socket, _head) => {
              console.log('Proxy WS connection closed');
            });
          }
        },
        '/api': {
          target: 'http://localhost:8080',
          changeOrigin: true,
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.error('Proxy HTTP Error:', err.message);
            });
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              console.log('Proxying HTTP Request:', req.method, req.url);
            });
          }
        }
      },
      fs: {
        allow: [
          // Allow serving files from the project root
          path.resolve(__dirname, '..'),
        ],
      },
    },
  };
});
