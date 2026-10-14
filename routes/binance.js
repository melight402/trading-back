import express from 'express';
import * as binanceService from '../services/binanceService.js';

const router = express.Router();

router.get('/test', async (req, res) => {
  try {
    const result = await binanceService.testConnection();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/account', async (req, res) => {
  try {
    const accountInfo = await binanceService.getAccountInfo();
    res.json(accountInfo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/exchange-info', async (req, res) => {
  try {
    const exchangeInfo = await binanceService.getExchangeInfo();
    res.json(exchangeInfo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/price/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const price = await binanceService.getPrice(symbol);
    res.json({ symbol, price });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/order', async (req, res) => {
  try {
    const orderParams = req.body;
    const result = await binanceService.placeOrder(orderParams);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/trading/open', async (req, res) => {
  try {
    const {
      symbol,
      side,
      positionSide,
      orderType,
      quantity,
      entryPrice,
      stopPrice,
      workingType = 'CONTRACT_PRICE',
    } = req.body;

    const normalizedSide = String(side || '').toUpperCase();
    const normalizedPositionSide = String(positionSide || '').toUpperCase();
    const normalizedOrderType = String(orderType || '').toUpperCase();
    if (['LIMIT', 'STOP_MARKET'].includes(normalizedOrderType)) {
      return res.status(409).json({
        error: 'Pending entries are temporarily disabled',
        details: 'Отложенные заявки отключены: сервер пока не может гарантировать установку защитного стопа после исполнения. Заявка не отправлена.',
      });
    }
    const numericQuantity = Number(quantity);
    const positionMode = await binanceService.getFuturesPositionMode();

    if (!symbol || !['BUY', 'SELL'].includes(normalizedSide) ||
        !['LONG', 'SHORT'].includes(normalizedPositionSide) ||
        !['MARKET', 'LIMIT', 'STOP_MARKET'].includes(normalizedOrderType) ||
        !Number.isFinite(numericQuantity) || numericQuantity <= 0 ||
        !Number.isFinite(Number(stopPrice)) || Number(stopPrice) <= 0) {
      return res.status(400).json({
        error: 'symbol, side, positionSide, orderType, quantity, and stopPrice are required',
      });
    }

    if (['LIMIT', 'STOP_MARKET'].includes(normalizedOrderType) &&
        (!Number.isFinite(Number(entryPrice)) || Number(entryPrice) <= 0)) {
      return res.status(400).json({ error: 'entryPrice is required for LIMIT and STOP_MARKET orders' });
    }

    const isLong = normalizedSide === 'BUY';
    const numericEntryPrice = Number(entryPrice);
    const numericStopPrice = Number(stopPrice);
    if (normalizedOrderType === 'STOP_MARKET' &&
        ((isLong && numericEntryPrice <= numericStopPrice) || (!isLong && numericEntryPrice >= numericStopPrice))) {
      return res.status(400).json({
        error: 'Invalid stop direction',
        details: isLong
          ? 'For a LONG entry, entryPrice must be above stopPrice.'
          : 'For a SHORT entry, entryPrice must be below stopPrice.'
      });
    }

    const orderPositionSide = positionMode === 'HEDGE' ? normalizedPositionSide : undefined;

    const entryParams = {
      symbol,
      side: normalizedSide,
      type: normalizedOrderType,
      quantity: numericQuantity,
    };

    if (orderPositionSide) {
      entryParams.positionSide = orderPositionSide;
    }

    if (normalizedOrderType === 'LIMIT') {
      entryParams.price = Number(entryPrice);
      entryParams.timeInForce = 'GTC';
    }

    if (normalizedOrderType === 'STOP_MARKET') {
      entryParams.stopPrice = Number(entryPrice);
      entryParams.workingType = workingType;
    }

    const entryOrder = await binanceService.placeFuturesOrder(entryParams);

    // A close-position stop cannot exist before a pending entry creates a position.
    if (normalizedOrderType !== 'MARKET') {
      return res.json({
        success: true,
        entryOrder,
        stopOrder: null,
        stopLossPending: true,
        message: 'Entry order placed. Stop loss will be placed after the entry is filled.'
      });
    }

    let stopOrder;
    try {
      stopOrder = await binanceService.placeFuturesOrder({
        symbol,
        side: normalizedSide === 'BUY' ? 'SELL' : 'BUY',
        type: 'STOP_MARKET',
        stopPrice: Number(stopPrice),
        workingType,
        closePosition: true,
        ...(orderPositionSide ? { positionSide: orderPositionSide } : {})
      });
    } catch (stopError) {
      try {
        const closeQuantity = Number(entryOrder.executedQty || entryOrder.origQty || numericQuantity);
        const rollbackOrder = await binanceService.placeFuturesOrder({
          symbol,
          side: normalizedSide === 'BUY' ? 'SELL' : 'BUY',
          type: 'MARKET',
          quantity: closeQuantity,
          ...(orderPositionSide ? { positionSide: orderPositionSide } : { reduceOnly: true })
        });
        return res.status(502).json({
          error: 'Protective stop placement failed; emergency close submitted',
          details: 'Защитный стоп не выставлен. Приложение отправило рыночное закрытие позиции.',
          stopError: stopError.binanceResponse?.msg || stopError.message,
          rollbackOrder,
        });
      } catch (closeError) {
        return res.status(500).json({
          error: 'Protective stop placement and emergency close both failed',
          details: 'КРИТИЧНО: защитный стоп не выставлен и автоматическое закрытие не удалось. Немедленно проверьте позицию на Binance.',
          stopError: stopError.binanceResponse?.msg || stopError.message,
          closeError: closeError.binanceResponse?.msg || closeError.message,
        });
      }
    }

    res.json({ success: true, entryOrder, stopOrder });
  } catch (error) {
    const binanceResponse = error.binanceResponse || {};
    res.status(500).json({
      error: 'Failed to open live position',
      details: binanceResponse.msg || error.message,
      binanceError: binanceResponse,
    });
  }
});

router.post('/trading/close', async (req, res) => {
  try {
    const { symbol, side, positionSide, quantity, stopOrderId } = req.body;
    const normalizedSide = String(side || '').toUpperCase();
    const normalizedPositionSide = String(positionSide || '').toUpperCase();
    const numericQuantity = Number(quantity);
    const positionMode = await binanceService.getFuturesPositionMode();

    if (!symbol || !['BUY', 'SELL'].includes(normalizedSide) ||
        !['LONG', 'SHORT'].includes(normalizedPositionSide) ||
        !Number.isFinite(numericQuantity) || numericQuantity <= 0) {
      return res.status(400).json({ error: 'symbol, side, positionSide, and quantity are required' });
    }

    const order = await binanceService.placeFuturesOrder({
      symbol,
      side: normalizedSide,
      type: 'MARKET',
      quantity: numericQuantity,
      ...(positionMode === 'HEDGE' ? { positionSide: normalizedPositionSide } : {})
    });
    const cancelledOrders = stopOrderId
      ? await binanceService.cancelFuturesOrder({ symbol, algoId: stopOrderId })
      : await binanceService.cancelAllFuturesOrders({ symbol });

    res.json({ success: true, order, cancelledOrders });
  } catch (error) {
    const binanceResponse = error.binanceResponse || {};
    res.status(500).json({
      error: 'Failed to close live position',
      details: binanceResponse.msg || error.message,
      binanceError: binanceResponse,
    });
  }
});

export default router;

