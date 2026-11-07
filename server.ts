import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { createServer } from 'http';

async function startServer() {
  const app = express();
  const PORT = 3000;
  const httpServer = createServer(app);

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      engine: 'ggwave-waver-wasm',
      offlineReady: true,
      timestamp: new Date().toISOString(),
    });
  });

  // Serve standalone offline build if requested
  app.get('/QuantumLink.html', (_req, res) => {
    const filePath = path.resolve(process.cwd(), 'FINAL NEXUS/index.html');
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Disposition', 'attachment; filename="SoundLink_Offline.html"');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.sendFile(filePath);
    } else {
      res.status(404).send('Standalone offline build not found.');
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, { index: false }));
    app.get('*', (_req, res) => {
      const finalWorkPath = path.join(distPath, 'index.html');
      if (fs.existsSync(finalWorkPath)) {
        res.sendFile(finalWorkPath);
      } else {
        res.status(404).send('Not Found');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Sound Link (Waver Acoustic Suite) running on http://localhost:${PORT}`);
  });
}

startServer();
