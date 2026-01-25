import path from "path";
import { defineConfig, loadEnv, Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Custom plugin to redirect HTTP to HTTPS
const httpsRedirect = (): Plugin => ({
  name: 'https-redirect',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      // Check if request is not secure and not from localhost
      const proto = req.headers['x-forwarded-proto'];
      const host = req.headers.host || '';
      
      // In development, if accessing via HTTP (not HTTPS)
      if (req.headers['upgrade-insecure-requests'] || 
          (proto === 'http') || 
          (!req.connection.encrypted && !host.includes('localhost'))) {
        // Skip redirect for localhost to avoid issues
        if (host.includes('localhost') || host.includes('127.0.0.1')) {
          return next();
        }
        
        // Construct HTTPS URL
        const httpsUrl = `https://${host}${req.url}`;
        
        // Send redirect response
        res.writeHead(301, { Location: httpsUrl });
        res.end();
        return;
      }
      
      next();
    });
  }
});

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, ".", "");
    return {
      base: "/bible/",
      server: {
        port: 3000,
        host: "0.0.0.0",
        https: true, // Enable HTTPS for camera access
      },
      plugins: [httpsRedirect(), react()],
      define: {
        "process.env.API_KEY": JSON.stringify(env.GEMINI_API_KEY),
        "process.env.GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          "@": path.resolve(__dirname, "."),
        }
      }
    };
});
