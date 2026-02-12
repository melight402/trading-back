import express from 'express';
import { db } from '../db/database.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const router = express.Router();

router.get('/history_positions', (req, res) => {
  const {
    symbol,
    direction,
    startDate,
    endDate,
    tvx,
    session,
    sourceType,
    status,
    weekdays,
    limit = 100,
    offset = 0
  } = req.query;

  let query = 'SELECT * FROM positions WHERE 1=1';
  const params = [];

  if (symbol) {
    query += ' AND symbol = ?';
    params.push(symbol);
  }

  if (direction) {
    const positionSide = direction === 'Long' ? 'LONG' : direction === 'Short' ? 'SHORT' : null;
    if (positionSide) {
      query += ' AND position_side = ?';
      params.push(positionSide);
    }
  }

  if (tvx) {
    query += ' AND tvx = ?';
    params.push(tvx);
  }

  if (sourceType && sourceType !== 'all') {
    if (sourceType === 'history') {
      query += ' AND (source_type = ? OR source_type IS NULL)';
      params.push(sourceType);
    } else {
      query += ' AND source_type = ?';
      params.push(sourceType);
    }
  }

  if (status && status !== 'all') {
    if (status === 'open') {
      query += ' AND close_date_time IS NULL';
    } else if (status === 'closed') {
      query += ' AND close_date_time IS NOT NULL';
    }
  }

  if (session && session !== 'all') {
    const sessionHours = {
      'asia': { start: 0, end: 8 },
      'london': { start: 8, end: 17 },
      'frankfurt': { start: 7, end: 16 },
      'new_york': { start: 13, end: 22 }
    };
    
    const sessionRange = sessionHours[session];
    if (sessionRange) {
      query += ` AND CAST(strftime('%H', open_date_time) AS INTEGER) >= ? AND CAST(strftime('%H', open_date_time) AS INTEGER) < ?`;
      params.push(sessionRange.start, sessionRange.end);
    }
  }

  if (startDate) {
    query += ' AND open_date_time >= ?';
    params.push(startDate);
  }

  if (endDate) {
    query += ' AND open_date_time <= ?';
    params.push(endDate);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Error fetching history trades:', err);
      res.status(500).json({ error: 'Failed to fetch history trades' });
    } else {
      const trades = rows.map(trade => ({
        ...trade,
        direction: trade.position_side === 'LONG' ? 'Long' : 'Short',
        interval: 'N/A',
        entry_price: trade.price,
        stop_loss: trade.stop_loss_price,
        take_profit: trade.take_profit_price,
        quantity: trade.quantity,
        position_usdt: trade.position_usdt,
        open_date_time: trade.open_date_time,
        open_screenshot_path: trade.open_screenshot_path,
        close_screenshot_path: trade.close_screenshot_path,
        screenshot_url: trade.open_screenshot_path 
          ? `/api/screenshots/${trade.open_screenshot_path}`
          : null,
        close_screenshot_url: trade.close_screenshot_path 
          ? `/api/screenshots/${trade.close_screenshot_path}`
          : null,
        profit_loss: trade.profit_loss,
        close_date_time: trade.close_date_time,
        purchase_volume: trade.purchase_volume,
        commission: trade.commission,
        profit_amount: trade.profit_amount,
        loss_amount: trade.loss_amount,
        risk_reward_ratio: trade.risk_reward_ratio,
        risk_usdt: trade.risk_usdt,
        tvx: trade.tvx,
        note: trade.note
      }));

      if (selectedWeekdays.length > 0) {
        trades = trades.filter(trade => {
          const tradeDate = new Date(trade.open_date_time);
          const weekday = tradeDate.getUTCDay();
          return selectedWeekdays.includes(weekday);
        });
      }

      res.json({ trades, count: trades.length });
    }
  });
});

router.get('/history', (req, res) => {
  const {
    symbol,
    direction,
    startDate,
    endDate,
    tvx,
    session,
    limit = 100,
    offset = 0
  } = req.query;

  let query = 'SELECT * FROM positions WHERE 1=1';
  const params = [];

  if (symbol) {
    query += ' AND symbol = ?';
    params.push(symbol);
  }

  if (direction) {
    const positionSide = direction === 'Long' ? 'LONG' : direction === 'Short' ? 'SHORT' : null;
    if (positionSide) {
      query += ' AND position_side = ?';
      params.push(positionSide);
    }
  }

  if (tvx) {
    query += ' AND tvx = ?';
    params.push(tvx);
  }

  if (session && session !== 'all') {
    const sessionHours = {
      'asia': { start: 0, end: 8 },
      'london': { start: 8, end: 17 },
      'frankfurt': { start: 7, end: 16 },
      'new_york': { start: 13, end: 22 }
    };
    
    const sessionRange = sessionHours[session];
    if (sessionRange) {
      query += ` AND CAST(strftime('%H', open_date_time) AS INTEGER) >= ? AND CAST(strftime('%H', open_date_time) AS INTEGER) < ?`;
      params.push(sessionRange.start, sessionRange.end);
    }
  }

  if (startDate) {
    query += ' AND open_date_time >= ?';
    params.push(startDate);
  }

  if (endDate) {
    query += ' AND open_date_time <= ?';
    params.push(endDate);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Error fetching history trades:', err);
      res.status(500).json({ error: 'Failed to fetch history trades' });
    } else {
      const trades = rows.map(trade => ({
        ...trade,
        direction: trade.position_side === 'LONG' ? 'Long' : 'Short',
        interval: 'N/A',
        entry_price: trade.price,
        stop_loss: trade.stop_loss_price,
        take_profit: trade.take_profit_price,
        quantity: trade.quantity,
        position_usdt: trade.position_usdt,
        open_date_time: trade.open_date_time,
        open_screenshot_path: trade.open_screenshot_path,
        close_screenshot_path: trade.close_screenshot_path,
        screenshot_url: trade.open_screenshot_path 
          ? `/api/screenshots/${trade.open_screenshot_path}`
          : null,
        close_screenshot_url: trade.close_screenshot_path 
          ? `/api/screenshots/${trade.close_screenshot_path}`
          : null,
        profit_loss: trade.profit_loss,
        close_date_time: trade.close_date_time,
        purchase_volume: trade.purchase_volume,
        commission: trade.commission,
        profit_amount: trade.profit_amount,
        loss_amount: trade.loss_amount,
        risk_reward_ratio: trade.risk_reward_ratio,
        risk_usdt: trade.risk_usdt,
        tvx: trade.tvx,
        note: trade.note
      }));

      res.json({ trades, count: trades.length });
    }
  });
});

router.get('/', (req, res) => {
  const {
    symbol,
    direction,
    startDate,
    endDate,
    limit = 100,
    offset = 0
  } = req.query;

  let query = 'SELECT * FROM trades WHERE 1=1';
  const params = [];

  if (symbol) {
    query += ' AND symbol = ?';
    params.push(symbol);
  }

  if (direction) {
    query += ' AND direction = ?';
    params.push(direction);
  }

  if (startDate) {
    query += ' AND created_at >= ?';
    params.push(startDate);
  }

  if (endDate) {
    query += ' AND created_at <= ?';
    params.push(endDate);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Error fetching trades:', err);
      res.status(500).json({ error: 'Failed to fetch trades' });
    } else {
      const trades = rows.map(trade => ({
        ...trade,
        screenshot_url: trade.screenshot_path 
          ? `/api/screenshots/${trade.screenshot_path}`
          : null
      }));

      res.json({ trades, count: trades.length });
    }
  });
});

router.get('/tvx_list', (req, res) => {
  db.all('SELECT DISTINCT tvx FROM positions WHERE tvx IS NOT NULL AND tvx != "" ORDER BY tvx', (err, rows) => {
    if (err) {
      console.error('Error fetching TVX list:', err);
      res.status(500).json({ error: 'Failed to fetch TVX list' });
    } else {
      const tvxList = rows.map(row => row.tvx).filter(Boolean);
      res.json({ tvxList });
    }
  });
});

router.get('/stats', (req, res) => {
  const { symbol, direction, startDate, endDate, tvx, session, sourceType, status, weekdays } = req.query;

  let query = `
    SELECT 
      id,
      open_date_time,
      profit_amount,
      loss_amount,
      commission
    FROM positions
    WHERE 1=1
  `;

  const params = [];

  if (status && status !== 'all') {
    if (status === 'open') {
      query += ' AND close_date_time IS NULL';
    } else if (status === 'closed') {
      query += ' AND close_date_time IS NOT NULL';
    }
  } else {
    query += ' AND close_date_time IS NOT NULL';
  }

  if (symbol) {
    query += ' AND symbol = ?';
    params.push(symbol);
  }

  if (direction) {
    const positionSide = direction === 'Long' ? 'LONG' : direction === 'Short' ? 'SHORT' : null;
    if (positionSide) {
      query += ' AND position_side = ?';
      params.push(positionSide);
    }
  }

  if (tvx) {
    query += ' AND tvx = ?';
    params.push(tvx);
  }

  if (sourceType && sourceType !== 'all') {
    if (sourceType === 'history') {
      query += ' AND (source_type = ? OR source_type IS NULL)';
      params.push(sourceType);
    } else {
      query += ' AND source_type = ?';
      params.push(sourceType);
    }
  }

  if (session && session !== 'all') {
    const sessionHours = {
      'asia': { start: 0, end: 8 },
      'london': { start: 8, end: 17 },
      'frankfurt': { start: 7, end: 16 },
      'new_york': { start: 13, end: 22 }
    };
    
    const sessionRange = sessionHours[session];
    if (sessionRange) {
      query += ` AND CAST(strftime('%H', open_date_time) AS INTEGER) >= ? AND CAST(strftime('%H', open_date_time) AS INTEGER) < ?`;
      params.push(sessionRange.start, sessionRange.end);
    }
  }

  if (startDate) {
    query += ' AND open_date_time >= ?';
    params.push(startDate);
  }

  if (endDate) {
    query += ' AND open_date_time <= ?';
    params.push(endDate);
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Error fetching stats:', err);
      res.status(500).json({ error: 'Failed to fetch stats' });
    } else {
      const parseWeekdays = (weekdaysStr) => {
        if (!weekdaysStr) return [];
        return weekdaysStr.split(',').map(w => parseInt(w)).filter(w => !isNaN(w));
      };

      const selectedWeekdays = parseWeekdays(weekdays);
      
      let filteredRows = rows;
      if (selectedWeekdays.length > 0) {
        filteredRows = rows.filter(row => {
          const tradeDate = new Date(row.open_date_time);
          const weekday = tradeDate.getUTCDay();
          return selectedWeekdays.includes(weekday);
        });
      }

      const total = filteredRows.length;
      const total_profit = filteredRows.reduce((sum, row) => sum + (row.profit_amount || 0), 0);
      const total_loss = filteredRows.reduce((sum, row) => sum + (row.loss_amount || 0), 0);
      const total_commission = filteredRows.reduce((sum, row) => sum + (row.commission || 0), 0);

      const netProfitLoss = total_profit - total_loss;
      const netProfit = netProfitLoss - total_commission;

      res.json({
        total,
        total_profit,
        total_loss,
        net_profit_loss: netProfitLoss,
        total_commission,
        net_profit: netProfit
      });
    }
  });
});

router.get('/:id', (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM trades WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('Error fetching trade:', err);
      res.status(500).json({ error: 'Failed to fetch trade' });
    } else if (!row) {
      res.status(404).json({ error: 'Trade not found' });
    } else {
      const trade = {
        ...row,
        screenshot_url: row.screenshot_path 
          ? `/api/screenshots/${row.screenshot_path}`
          : null
      };
      res.json(trade);
    }
  });
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const screenshotsPath = process.env.SCREENSHOTS_PATH || path.join(__dirname, '../data/screenshots');

  db.get('SELECT open_screenshot_path, close_screenshot_path FROM positions WHERE id = ?', [id], (err, position) => {
    if (err) {
      console.error('Error fetching position for deletion:', err);
      return res.status(500).json({ error: 'Failed to fetch position', details: err.message });
    }

    if (!position) {
      return res.status(404).json({ error: 'Position not found' });
    }

    const screenshotsToDelete = [];
    if (position.open_screenshot_path) {
      screenshotsToDelete.push(position.open_screenshot_path);
    }
    if (position.close_screenshot_path) {
      screenshotsToDelete.push(position.close_screenshot_path);
    }

    db.run('DELETE FROM positions WHERE id = ?', [id], function(deleteErr) {
      if (deleteErr) {
        console.error('Error deleting position:', deleteErr);
        return res.status(500).json({ error: 'Failed to delete position', details: deleteErr.message });
      }

      screenshotsToDelete.forEach(filename => {
        const filePath = path.join(screenshotsPath, filename);
        fs.unlink(filePath, (unlinkErr) => {
          if (unlinkErr && unlinkErr.code !== 'ENOENT') {
            console.error(`Error deleting screenshot ${filename}:`, unlinkErr);
          }
        });
      });

      res.json({
        success: true,
        message: 'Position deleted successfully',
        deletedScreenshots: screenshotsToDelete.length
      });
    });
  });
});

export default router;

