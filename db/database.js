import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/trading.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
  }
});

export const initDatabase = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS positions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT NOT NULL,
          position_side TEXT NOT NULL,
          price REAL NOT NULL,
          quantity REAL NOT NULL,
          stop_loss_price REAL NOT NULL,
          take_profit_price REAL NOT NULL,
          tvx TEXT,
          open_date_time TEXT NOT NULL,
          open_screenshot_path TEXT,
          close_date_time TEXT,
          profit_loss TEXT,
          close_screenshot_path TEXT,
          purchase_volume REAL,
          commission REAL,
          profit_amount REAL,
          loss_amount REAL,
          risk_reward_ratio REAL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        ALTER TABLE positions ADD COLUMN purchase_volume REAL;
      `, () => {});

      db.run(`
        ALTER TABLE positions ADD COLUMN commission REAL;
      `, () => {});

      db.run(`
        ALTER TABLE positions ADD COLUMN profit_amount REAL;
      `, () => {});

      db.run(`
        ALTER TABLE positions ADD COLUMN loss_amount REAL;
      `, () => {});

      db.run(`
        ALTER TABLE positions ADD COLUMN risk_reward_ratio REAL;
      `, () => {});

      db.run(`
        ALTER TABLE positions ADD COLUMN source_type TEXT;
      `, () => {});

      db.run(`
        ALTER TABLE positions ADD COLUMN line_tool_id TEXT;
      `, () => {});

      db.run(`
        ALTER TABLE positions ADD COLUMN risk_usdt REAL;
      `, () => {});

      db.run(`
        ALTER TABLE positions ADD COLUMN position_usdt REAL;
      `, () => {});

      db.run(`
        ALTER TABLE positions ADD COLUMN note TEXT;
      `, () => {});

      db.run(`
        CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol);
      `);

      db.run(`
        CREATE INDEX IF NOT EXISTS idx_positions_close_date ON positions(close_date_time);
      `);

      db.run(`
        CREATE INDEX IF NOT EXISTS idx_positions_open_date ON positions(open_date_time);
      `);

      db.run(`
        CREATE INDEX IF NOT EXISTS idx_positions_symbol_close ON positions(symbol, close_date_time);
      `, () => {});

      db.run(`
        CREATE INDEX IF NOT EXISTS idx_positions_line_tool_id ON positions(line_tool_id);
      `, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
};

export const closeDatabase = () => {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) {
        reject(err);
      } else {
        console.log('Database connection closed');
        resolve();
      }
    });
  });
};

