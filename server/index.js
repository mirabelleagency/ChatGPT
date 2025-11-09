import compression from 'compression';
import express from 'express';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const distPath = path.resolve(__dirname, '../dist');

app.use(express.json());
app.use(morgan(isProduction ? 'combined' : 'dev'));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

if (isProduction) {
  app.use(compression());
  app.use(
    express.static(distPath, {
      extensions: ['html'],
      maxAge: '1h',
    }),
  );

  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  if (!isProduction) {
    console.log('Health check available at /api/health');
  }
});
