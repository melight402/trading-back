import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import positionsRoutes from './routes/positions.js';
import binanceRoutes from './routes/binance.js';
import screenshotsRoutes from './routes/screenshots.js';
import tradesRoutes from './routes/trades.js';
import { initDatabase } from './db/database.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/positions', positionsRoutes);
app.use('/api/binance', binanceRoutes);
app.use('/api/screenshots', screenshotsRoutes);
app.use('/api/trades', tradesRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}).catch((error) => {
  console.error('Failed to initialize database:', error);
  process.exit(1);
});

