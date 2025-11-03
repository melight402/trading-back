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

export default router;

