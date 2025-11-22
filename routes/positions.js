import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { db } from '../db/database.js';
import * as binanceService from '../services/binanceService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const screenshotsPath = process.env.SCREENSHOTS_PATH || path.join(__dirname, '../data/screenshots');

if (!fs.existsSync(screenshotsPath)) {
  fs.mkdirSync(screenshotsPath, { recursive: true });
}

const saveScreenshot = (buffer) => {
  const timestamp = Date.now();
  const filename = `screenshot_${timestamp}_${Math.random().toString(36).substring(7)}.png`;
  const filePath = path.join(screenshotsPath, filename);
  fs.writeFileSync(filePath, buffer);
  return filename;
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

const router = express.Router();

const calculateClosePositionData = (originalPrice, originalQuantity, positionSide, stopLossPrice, takeProfitPrice, profitLoss) => {
  const price = parseFloat(originalPrice);
  const quantity = parseFloat(originalQuantity);
  const stopLoss = parseFloat(stopLossPrice);
  const takeProfit = parseFloat(takeProfitPrice);
  const isLong = positionSide === 'LONG';

  const purchaseVolume = price * quantity;
  const commission = Math.round((purchaseVolume * 0.001) * 100) / 100;

  let profitAmount = null;
  let lossAmount = null;

  if (profitLoss === 'profit') {
    if (isLong) {
      profitAmount = Math.round(((takeProfit - price) * quantity) * 100) / 100;
    } else {
      profitAmount = Math.round(((price - takeProfit) * quantity) * 100) / 100;
    }
  } else {
    if (isLong) {
      lossAmount = Math.round(((price - stopLoss) * quantity) * 100) / 100;
    } else {
      lossAmount = Math.round(((stopLoss - price) * quantity) * 100) / 100;
    }
  }

  return {
    purchaseVolume,
    commission,
    profitAmount,
    lossAmount
  };
};

router.post('/', (req, res) => {
  const { positions, screenshot, metadata } = req.body;

  if (!positions || !Array.isArray(positions) || positions.length === 0) {
    return res.status(400).json({ error: 'Invalid positions data' });
  }

  if (metadata) {
    console.log('Received metadata:', JSON.stringify(metadata, null, 2));
  }

  const insertPromises = positions.map((position) => {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO trades (
          position_id, symbol, interval, direction, entry_price, stop_loss, take_profit,
          entry_stop_loss_usdt, entry_stop_loss_coins, entry_stop_loss_text,
          entry_pt_usdt, entry_pt_coins, entry_pt_text, screenshot_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          position.id,
          position.symbol,
          position.interval,
          position.direction,
          position.entryPrice,
          position.stopLoss,
          position.takeProfit,
          position.entryStopLossUSDT || null,
          position.entryStopLossCoins || null,
          position.entryStopLossText || null,
          position.entryPtUSDT || null,
          position.entryPtCoins || null,
          position.entryPtText || null,
          screenshot || null
        ],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ id: this.lastID, positionId: position.id });
          }
        }
      );
    });
  });

  Promise.all(insertPromises)
    .then((results) => {
      res.json({
        success: true,
        message: `Saved ${results.length} position(s)`,
        saved: results
      });
    })
    .catch((error) => {
      console.error('Error saving positions:', error);
      res.status(500).json({ error: 'Failed to save positions', details: error.message });
    });
});

const handleOpenPosition = async (req, res, sourceType) => {
  try {
    let positionData;
    
    if (req.body.positionData) {
      positionData = JSON.parse(req.body.positionData);
    } else {
      positionData = req.body;
    }

    const finalSourceType = sourceType || null;

    console.log('Received position data:', JSON.stringify(positionData, null, 2));
    console.log('Order type:', positionData.type, 'closePosition:', positionData.closePosition);

    if (!positionData.dateTime || !positionData.positionSide || !positionData.symbol || 
        !positionData.price || !positionData.stopLossPrice || !positionData.takeProfitPrice) {
      return res.status(400).json({ error: 'Missing required fields: dateTime, positionSide, symbol, price, stopLossPrice, and takeProfitPrice are required' });
    }

    if (!positionData.closePosition && !positionData.quantity) {
      return res.status(400).json({ error: 'Missing required field: quantity is required when closePosition is not true' });
    }

    if (!positionData.risk || isNaN(parseFloat(positionData.risk)) || parseFloat(positionData.risk) <= 0) {
      return res.status(400).json({ error: 'Risk must be greater than zero. Risk field is required and must be a positive number in USDT.' });
    }

    const screenshotBuffer = req.file ? req.file.buffer : null;

    const price = parseFloat(positionData.price);
    const stopLossPrice = parseFloat(positionData.stopLossPrice);
    const takeProfitPrice = parseFloat(positionData.takeProfitPrice);
    const isLong = positionData.positionSide === 'LONG';

    let risk;
    let reward;
    let riskRewardRatio = null;

    if (isLong) {
      risk = price - stopLossPrice;
      reward = takeProfitPrice - price;
    } else {
      risk = stopLossPrice - price;
      reward = price - takeProfitPrice;
    }

    if (risk > 0) {
      riskRewardRatio = reward / risk;
    }

    let binanceOrderResult = null;

    let screenshotPath = null;

    if (finalSourceType === 'trading') {
      if (!positionData.type) {
        return res.status(400).json({ error: 'Order type is required for trading positions' });
      }

      try {
        const orderType = String(positionData.type || 'MARKET');
        const isPostOnly = orderType === 'POST_ONLY';
        const finalOrderType = isPostOnly ? 'LIMIT' : orderType;
        
        const orderParams = {
          symbol: positionData.symbol,
          side: String(positionData.side || (isLong ? 'BUY' : 'SELL')),
          type: finalOrderType,
          quantity: parseFloat(positionData.quantity).toString(),
          positionSide: String(positionData.positionSide || (isLong ? 'LONG' : 'SHORT'))
        };

        if (finalOrderType === 'LIMIT' || isPostOnly || finalOrderType === 'TAKE_PROFIT' || finalOrderType === 'STOP') {
          if (positionData.price) {
            orderParams.price = parseFloat(positionData.price).toString();
          }
          if (isPostOnly) {
            orderParams.timeInForce = 'GTX';
          } else {
            orderParams.timeInForce = String(positionData.timeInForce || 'GTC');
          }
        }

        if (positionData.stopPrice) {
          orderParams.stopPrice = parseFloat(positionData.stopPrice).toString();
        }

        if (positionData.closePosition !== undefined) {
          orderParams.closePosition = Boolean(positionData.closePosition);
        }

        if (positionData.reduceOnly !== undefined) {
          orderParams.reduceOnly = Boolean(positionData.reduceOnly);
        }

        if (positionData.workingType) {
          orderParams.workingType = String(positionData.workingType);
        }

        const orderQuantity = orderParams.quantity ? parseFloat(orderParams.quantity) : 0;
        const orderPrice = orderParams.price ? parseFloat(orderParams.price) : price;
        const notionalValue = orderQuantity * orderPrice;
        const MIN_NOTIONAL = 20;

        console.log('Order validation - type:', finalOrderType, 'quantity:', orderQuantity, 'price:', orderPrice, 'notionalValue:', notionalValue, 'reduceOnly:', orderParams.reduceOnly, 'closePosition:', orderParams.closePosition);

        if (notionalValue < MIN_NOTIONAL && !orderParams.reduceOnly && !orderParams.closePosition) {
          return res.status(400).json({ 
            error: `Order notional value (${notionalValue.toFixed(2)} USDT) is below Binance minimum of ${MIN_NOTIONAL} USDT`,
            details: {
              quantity: orderQuantity,
              price: orderPrice,
              notionalValue: notionalValue.toFixed(2),
              minimumRequired: MIN_NOTIONAL,
              suggestion: `Increase quantity to at least ${(MIN_NOTIONAL / orderPrice).toFixed(6)} or increase risk amount`
            }
          });
        }

        console.log('Placing Binance futures order:', JSON.stringify(orderParams, null, 2));
        binanceOrderResult = await binanceService.placeFuturesOrder(orderParams);
        console.log('Binance order result:', JSON.stringify(binanceOrderResult, null, 2));

        if (!binanceOrderResult || (binanceOrderResult.status !== 'NEW' && binanceOrderResult.status !== 'FILLED' && binanceOrderResult.status !== 'PARTIALLY_FILLED')) {
          throw new Error(`Order not successfully placed. Status: ${binanceOrderResult?.status || 'unknown'}, Response: ${JSON.stringify(binanceOrderResult)}`);
        }

        if (screenshotBuffer) {
          screenshotPath = saveScreenshot(screenshotBuffer);
          console.log('Screenshot saved after successful order:', screenshotPath);
        }
      } catch (error) {
        console.error('Error placing Binance order:', error);
        const errorMessage = error.message || error.toString();
        const binanceResponse = error.binanceResponse || {};
        
        const errorDetails = {
          message: binanceResponse.msg || errorMessage,
          code: binanceResponse.code || error.code,
          binanceResponse: binanceResponse
        };
        
        return res.status(500).json({ 
          error: 'Failed to place order on Binance', 
          details: errorMessage,
          binanceError: errorDetails
        });
      }
    } else {
      if (screenshotBuffer) {
        screenshotPath = saveScreenshot(screenshotBuffer);
        console.log('Screenshot saved for history position:', screenshotPath);
      }
    }

    const quantity = parseFloat(positionData.quantity);
    const positionUsdt = positionData.positionUsdt !== undefined && positionData.positionUsdt !== null
      ? parseFloat(positionData.positionUsdt)
      : (!isNaN(price) && !isNaN(quantity) && price > 0 && quantity > 0 
          ? Math.round((price * quantity) * 100) / 100 
          : null);

    db.run(
      `INSERT INTO positions (
        symbol, position_side, price, quantity, stop_loss_price, 
        take_profit_price, tvx, open_date_time, open_screenshot_path, risk_reward_ratio, source_type, line_tool_id, risk_usdt, position_usdt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        positionData.symbol,
        positionData.positionSide,
        positionData.price,
        positionData.quantity,
        positionData.stopLossPrice,
        positionData.takeProfitPrice,
        positionData.tvx || null,
        positionData.dateTime,
        screenshotPath,
        riskRewardRatio,
        finalSourceType,
        positionData.lineToolId || null,
        parseFloat(positionData.risk),
        positionUsdt
      ],
      function(err) {
        if (err) {
          console.error('Error saving position:', err);
          if (screenshotPath && fs.existsSync(path.join(screenshotsPath, screenshotPath))) {
            fs.unlinkSync(path.join(screenshotsPath, screenshotPath));
          }
          if (binanceOrderResult && finalSourceType === 'trading') {
            console.error('WARNING: Position saved in Binance but failed to save in database!');
          }
          return res.status(500).json({ error: 'Failed to save position', details: err.message });
        }

        const responseData = {
          success: true,
          message: finalSourceType === 'trading' 
            ? 'Position opened and order placed on Binance' 
            : 'Position data saved',
          id: this.lastID,
          data: {
            ...positionData,
            openScreenshotPath: screenshotPath,
            openScreenshotUrl: screenshotPath ? `/api/screenshots/${screenshotPath}` : null
          }
        };

        if (binanceOrderResult) {
          responseData.binanceOrder = binanceOrderResult;
        }

        res.json(responseData);
      }
    );
  } catch (error) {
    console.error('Error processing position data:', error);
    res.status(500).json({ error: 'Failed to process position data', details: error.message });
  }
};

router.post('/trading/open', upload.single('screenshot'), (req, res) => handleOpenPosition(req, res, 'trading'));

router.post('/history/open', upload.single('screenshot'), (req, res) => handleOpenPosition(req, res, 'history'));

router.post('/trading/close', upload.single('screenshot'), (req, res) => {
  try {
    let closeData;
    
    if (req.body.closeData) {
      closeData = JSON.parse(req.body.closeData);
    } else {
      closeData = req.body;
    }

    const sourceType = 'trading';

    console.log('Received close position data:', JSON.stringify(closeData, null, 2));

    if (!closeData.symbol || !closeData.profitLoss || !closeData.stopLossPrice || !closeData.takeProfitPrice) {
      return res.status(400).json({ error: 'Missing required fields: symbol, profitLoss, stopLossPrice, and takeProfitPrice are required' });
    }

    if (!closeData.lineToolId) {
      return res.status(400).json({ error: 'Missing required field: lineToolId is required' });
    }

    let screenshotPath = null;
    console.log('=== CHECKING SCREENSHOT (TRADING) ===');
    console.log('req.file:', req.file ? `EXISTS - size: ${req.file.size}, mimetype: ${req.file.mimetype}, buffer: ${req.file.buffer ? 'present' : 'missing'}` : 'NULL/UNDEFINED');
    
    if (req.file && req.file.buffer) {
      screenshotPath = saveScreenshot(req.file.buffer);
      console.log('✅ Screenshot saved:', screenshotPath, 'Size:', req.file.size, 'bytes');
    } else {
      console.error('❌ NO SCREENSHOT FILE RECEIVED in close position request for trading');
      if (req.file) {
        console.error('req.file exists but no buffer. Keys:', Object.keys(req.file));
      }
      console.error('req.body keys:', Object.keys(req.body));
      console.error('req.headers content-type:', req.headers['content-type']);
    }

    db.get(
      `SELECT id, price, quantity, position_side FROM positions 
       WHERE line_tool_id = ? AND close_date_time IS NULL 
       AND source_type = ?
       ORDER BY created_at DESC LIMIT 1`,
      [
        closeData.lineToolId,
        sourceType
      ],
      (err, existingPosition) => {
        if (err) {
          console.error('Error finding position to close:', err);
          return res.status(500).json({ error: 'Failed to find position to close', details: err.message });
        }

        if (!existingPosition) {
          return res.status(404).json({ error: 'Не найдена открытая позиция для закрытия' });
        }

        const { purchaseVolume, commission, profitAmount, lossAmount } = calculateClosePositionData(
          existingPosition.price,
          existingPosition.quantity,
          existingPosition.position_side,
          closeData.stopLossPrice,
          closeData.takeProfitPrice,
          closeData.profitLoss
        );

        db.run(
          `UPDATE positions 
           SET close_date_time = ?, profit_loss = ?, close_screenshot_path = ?, 
               purchase_volume = ?, commission = ?, profit_amount = ?, loss_amount = ?, 
               stop_loss_price = ?, take_profit_price = ?, note = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            closeData.dateTime || new Date().toISOString(),
            closeData.profitLoss,
            screenshotPath,
            purchaseVolume,
            commission,
            profitAmount,
            lossAmount,
            closeData.stopLossPrice,
            closeData.takeProfitPrice,
            closeData.note || null,
            existingPosition.id
          ],
          function(updateErr) {
            if (updateErr) {
              console.error('Error closing position:', updateErr);
              return res.status(500).json({ error: 'Failed to close position', details: updateErr.message });
            }

            console.log('Position closed successfully. Screenshot path:', screenshotPath || 'none');
            res.json({
              success: true,
              message: 'Position closed',
              id: existingPosition.id,
              data: {
                ...closeData,
                closeScreenshotPath: screenshotPath,
                closeScreenshotUrl: screenshotPath ? `/api/screenshots/${screenshotPath}` : null,
                purchaseVolume,
                commission,
                profitAmount,
                lossAmount
              }
            });
          }
        );
      }
    );
  } catch (error) {
    console.error('Error processing close position data:', error);
    res.status(500).json({ error: 'Failed to process close position data', details: error.message });
  }
});

router.post('/history/close', upload.single('screenshot'), (req, res) => {
  try {
    let closeData;
    
    if (req.body.closeData) {
      closeData = JSON.parse(req.body.closeData);
    } else {
      closeData = req.body;
    }

    const sourceType = 'history';

    console.log('Received close position data:', JSON.stringify(closeData, null, 2));

    if (!closeData.symbol || !closeData.profitLoss || !closeData.stopLossPrice || !closeData.takeProfitPrice) {
      return res.status(400).json({ error: 'Missing required fields: symbol, profitLoss, stopLossPrice, and takeProfitPrice are required' });
    }

    if (!closeData.lineToolId) {
      return res.status(400).json({ error: 'Missing required field: lineToolId is required' });
    }

    let screenshotPath = null;
    console.log('=== CHECKING SCREENSHOT (HISTORY) ===');
    console.log('req.file:', req.file ? `EXISTS - size: ${req.file.size}, mimetype: ${req.file.mimetype}, buffer: ${req.file.buffer ? 'present' : 'missing'}` : 'NULL/UNDEFINED');
    
    if (req.file && req.file.buffer) {
      screenshotPath = saveScreenshot(req.file.buffer);
      console.log('✅ Screenshot saved:', screenshotPath, 'Size:', req.file.size, 'bytes');
    } else {
      console.error('❌ NO SCREENSHOT FILE RECEIVED in close position request for history');
      if (req.file) {
        console.error('req.file exists but no buffer. Keys:', Object.keys(req.file));
      }
      console.error('req.body keys:', Object.keys(req.body));
      console.error('req.headers content-type:', req.headers['content-type']);
    }

    db.get(
      `SELECT id, price, quantity, position_side FROM positions 
       WHERE line_tool_id = ? AND close_date_time IS NULL 
       AND source_type = ?
       ORDER BY created_at DESC LIMIT 1`,
      [
        closeData.lineToolId,
        sourceType
      ],
      (err, existingPosition) => {
        if (err) {
          console.error('Error finding position to close:', err);
          return res.status(500).json({ error: 'Failed to find position to close', details: err.message });
        }

        if (!existingPosition) {
          return res.status(404).json({ error: 'Не найдена открытая позиция для закрытия' });
        }

        const { purchaseVolume, commission, profitAmount, lossAmount } = calculateClosePositionData(
          existingPosition.price,
          existingPosition.quantity,
          existingPosition.position_side,
          closeData.stopLossPrice,
          closeData.takeProfitPrice,
          closeData.profitLoss
        );

        db.run(
          `UPDATE positions 
           SET close_date_time = ?, profit_loss = ?, close_screenshot_path = ?, 
               purchase_volume = ?, commission = ?, profit_amount = ?, loss_amount = ?, 
               stop_loss_price = ?, take_profit_price = ?, note = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            closeData.dateTime || new Date().toISOString(),
            closeData.profitLoss,
            screenshotPath,
            purchaseVolume,
            commission,
            profitAmount,
            lossAmount,
            closeData.stopLossPrice,
            closeData.takeProfitPrice,
            closeData.note || null,
            existingPosition.id
          ],
          function(updateErr) {
            if (updateErr) {
              console.error('Error closing position:', updateErr);
              return res.status(500).json({ error: 'Failed to close position', details: updateErr.message });
            }

            console.log('Position closed successfully (history). Screenshot path:', screenshotPath || 'none');
            res.json({
              success: true,
              message: 'Position closed',
              id: existingPosition.id,
              data: {
                ...closeData,
                closeScreenshotPath: screenshotPath,
                closeScreenshotUrl: screenshotPath ? `/api/screenshots/${screenshotPath}` : null,
                purchaseVolume,
                commission,
                profitAmount,
                lossAmount
              }
            });
          }
        );
      }
    );
  } catch (error) {
    console.error('Error processing close position data:', error);
    res.status(500).json({ error: 'Failed to process close position data', details: error.message });
  }
});

router.post('/open', upload.single('screenshot'), (req, res) => handleOpenPosition(req, res, null));

router.get('/open', (req, res) => {
  const { symbol, limit = 100, offset = 0 } = req.query;
  
  let query = 'SELECT * FROM positions WHERE close_date_time IS NULL';
  const params = [];

  if (symbol) {
    query += ' AND symbol = ?';
    params.push(symbol);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Error fetching opened positions:', err);
      res.status(500).json({ error: 'Failed to fetch opened positions' });
    } else {
      const positions = rows.map(position => ({
        ...position,
        openScreenshotUrl: position.open_screenshot_path 
          ? `/api/screenshots/${position.open_screenshot_path}`
          : null
      }));

      res.json({ positions, count: positions.length });
    }
  });
});

router.get('/history', (req, res) => {
  const { symbol, limit = 100, offset = 0 } = req.query;
  
  let query = 'SELECT * FROM positions WHERE 1=1';
  const params = [];

  if (symbol) {
    query += ' AND symbol = ?';
    params.push(symbol);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Error fetching positions:', err);
      res.status(500).json({ error: 'Failed to fetch positions' });
    } else {
      const positions = rows.map(position => ({
        ...position,
        open_screenshot_url: position.open_screenshot_path 
          ? `/api/screenshots/${position.open_screenshot_path}`
          : null,
        close_screenshot_url: position.close_screenshot_path 
          ? `/api/screenshots/${position.close_screenshot_path}`
          : null
      }));

      res.json({ positions, count: positions.length });
    }
  });
});

router.get('/', (req, res) => {
  const { symbol, limit = 100, offset = 0 } = req.query;
  
  let query = 'SELECT * FROM trades';
  const params = [];

  if (symbol) {
    query += ' WHERE symbol = ?';
    params.push(symbol);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Error fetching positions:', err);
      res.status(500).json({ error: 'Failed to fetch positions' });
    } else {
      res.json({ positions: rows, count: rows.length });
    }
  });
});

export default router;

