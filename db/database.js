import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configuredDbPath = process.env.DB_PATH;
const dbPath = configuredDbPath
  ? (path.isAbsolute(configuredDbPath) ? configuredDbPath : path.resolve(__dirname, '..', configuredDbPath))
  : path.join(__dirname, '../data/trading.db');
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
        CREATE TABLE IF NOT EXISTS strategies (
          value TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS app_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);

      db.get('SELECT value FROM app_metadata WHERE key = ?', ['strategies_seed_v1'], (metadataError, metadataRow) => {
        if (metadataError || metadataRow) return;

        const defaultStrategies = [
          ['level_breakout', 'Пробой уровня', 'Цена пробивает сильный уровень с подтверждением движения.'],
          ['rollup', 'нарастание вверх с закруглением снизу', 'Постепенное усиление движения вверх с округлым основанием.'],
          ['rolldown', 'медленное падение с закруглением сверху', 'Постепенное ослабление движения вниз с округлой вершиной.'],
          ['false_breakout', 'Ложный пробой (без импульса за уровнем)', 'Цена выходит за уровень, но не получает импульса и возвращается обратно.'],
          ['false_breakout_cup', 'После ложного пробоя нет отбоя, чашка на пробой', 'После ложного пробоя формируется чашка перед новым пробоем.'],
          ['level_bounce', 'Отбой от сильного уровня', 'Цена касается сильного уровня и разворачивается от него.'],
          ['retest', 'Ретест от уровня в сторону пробоя', 'После пробоя цена возвращается к уровню и продолжает движение.'],
          ['breakout', 'поджатие к уровню на пробой с наторговкой', 'Цена сжимается у уровня, формируя базу перед пробоем.'],
          ['ipo_down', 'Цена заходит за IPO', 'Цена пересекает и закрепляется за уровнем IPO.'],
          ['inclined_level', 'Выход из наклонного уровня', 'Цена выходит из наклонного канала или уровня.'],
          ['ma_up', 'Средняя скользящая показывает вверх', 'Скользящая средняя направлена вверх.'],
          ['ma_down', 'Средняя скользящая показывает вниз', 'Скользящая средняя направлена вниз.']
        ];

        db.get('SELECT COUNT(*) AS count FROM strategies', (countError, row) => {
          if (countError) return;
          const markSeedComplete = () => db.run(
            'INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?, ?)',
            ['strategies_seed_v1', 'complete']
          );

          if (row.count > 0) {
            markSeedComplete();
            return;
          }

          const seedStrategy = db.prepare('INSERT INTO strategies (value, label, description) VALUES (?, ?, ?)');
          defaultStrategies.forEach((strategy) => seedStrategy.run(strategy));
          seedStrategy.finalize(markSeedComplete);
        });
      });

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
        ALTER TABLE positions ADD COLUMN timeframe TEXT;
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

