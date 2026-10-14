import crypto from 'crypto';
import fs from 'fs';
import * as binancePrecision from '../utils/binancePrecision.js';

const getCredentials = () => {
  const rawApiKey = process.env.BINANCE_API_KEY;
  const privateKeyPath = process.env.BINANCE_PRIVATE_KEY_PATH;
  const passphrase = process.env.BINANCE_PRIVATE_KEY_PASSPHRASE;
  const apiKey = rawApiKey ? rawApiKey.trim().replace(/^["']|["']$/g, '') : null;

  if (!apiKey || !privateKeyPath || !passphrase) {
    throw new Error('Binance credentials not found. Set BINANCE_API_KEY, BINANCE_PRIVATE_KEY_PATH and BINANCE_PRIVATE_KEY_PASSPHRASE in .env');
  }

  return {
    apiKey,
    privateKey: crypto.createPrivateKey({
      key: fs.readFileSync(privateKeyPath),
      format: 'pem',
      passphrase
    })
  };
};

const requestJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.msg || data.message || `HTTP ${response.status}: ${JSON.stringify(data)}`);
    error.code = data.code;
    error.binanceResponse = data;
    throw error;
  }

  return data;
};

const signedRequest = async (baseUrl, path, method, params) => {
  const credentials = getCredentials();
  const queryString = new URLSearchParams(
    Object.entries({ ...params, timestamp: params.timestamp || Date.now(), recvWindow: params.recvWindow || 60000 })
  ).toString();
  const signature = crypto
    .sign(null, Buffer.from(queryString), credentials.privateKey)
    .toString('base64');
  const url = `${baseUrl}${path}?${queryString}&signature=${encodeURIComponent(signature)}`;

  return requestJson(url, {
    method,
    headers: { 'X-MBX-APIKEY': credentials.apiKey }
  });
};

export const getFuturesPositionMode = async () => {
  const data = await signedRequest('https://fapi.binance.com', '/fapi/v1/positionSide/dual', 'GET', {});
  return data.dualSidePosition ? 'HEDGE' : 'ONE_WAY';
};

export const getAccountInfo = async () => {
  return signedRequest('https://api.binance.com', '/api/v3/account', 'GET', {});
};

export const getExchangeInfo = async () => {
  return requestJson('https://api.binance.com/api/v3/exchangeInfo');
};

export const getPrice = async (symbol) => {
  const data = await requestJson(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`);
  return data.price;
};

export const placeOrder = async (orderParams) => {
  return signedRequest('https://api.binance.com', '/api/v3/order', 'POST', orderParams);
};

export const placeFuturesOrder = async (orderParams) => {
  try {
    const symbol = String(orderParams.symbol);
    const orderType = String(orderParams.type);
    const isAlgoOrder = ['STOP', 'STOP_MARKET', 'TAKE_PROFIT', 'TAKE_PROFIT_MARKET', 'TRAILING_STOP_MARKET'].includes(orderType);
    const positionMode = orderParams.positionSide ? await getFuturesPositionMode() : null;
    
    const params = {
      symbol: symbol,
      side: String(orderParams.side),
      type: orderType
    };

    if (isAlgoOrder) {
      params.algoType = 'CONDITIONAL';
    }

    if (orderParams.positionSide && positionMode === 'HEDGE') {
      params.positionSide = String(orderParams.positionSide);
    }

    if (orderParams.closePosition) {
      params.closePosition = true;
    } else {

      if (orderParams.quantity) {
        const quantity = parseFloat(orderParams.quantity);
        const roundedQuantity = binancePrecision.roundQuantity(quantity, symbol);
        params.quantity = String(roundedQuantity);
      }

      if (orderParams.reduceOnly !== undefined) {
        params.reduceOnly = orderParams.reduceOnly;
      }
    }

    if (orderParams.price) {
      const price = parseFloat(orderParams.price);
      const roundedPrice = binancePrecision.roundPrice(price, symbol);
      params.price = String(roundedPrice);
    }

    if (orderParams.timeInForce && !isAlgoOrder) {
      params.timeInForce = String(orderParams.timeInForce);
    }

    if (orderParams.stopPrice && !isAlgoOrder) {
      const stopPrice = parseFloat(orderParams.stopPrice);
      const roundedStopPrice = binancePrecision.roundPrice(stopPrice, symbol);
      params.stopPrice = String(roundedStopPrice);
    }

    if (orderParams.stopPrice && isAlgoOrder) {
      const triggerPrice = parseFloat(orderParams.stopPrice);
      params.triggerPrice = String(binancePrecision.roundPrice(triggerPrice, symbol));
    }

    if (orderParams.workingType) {
      params.workingType = String(orderParams.workingType);
    }

    if (!isAlgoOrder && !params.timeInForce && (params.type === 'LIMIT' || params.type === 'STOP' || params.type === 'TAKE_PROFIT')) {
      params.timeInForce = 'GTX';
    }

    if (isAlgoOrder) {
      params.clientAlgoId = orderParams.clientAlgoId || `algo-${Date.now()}`;
    } else if (!params.newClientOrderId) {
      params.newClientOrderId = `x-${Date.now()}`;
    }

    const timestamp = Date.now();
    params.timestamp = timestamp;
    params.recvWindow = 60000;

    console.log('Placing direct Binance futures order:', JSON.stringify(params, null, 2));
    return await signedRequest(
      'https://fapi.binance.com',
      isAlgoOrder ? '/fapi/v1/algoOrder' : '/fapi/v1/order',
      'POST',
      params
    );
  } catch (error) {
    const enhancedError = new Error(error.message || error.toString());
    enhancedError.code = error.code;
    enhancedError.binanceResponse = error.binanceResponse;
    enhancedError.details = error;
    throw enhancedError;
  }
};

export const cancelFuturesOrder = async (cancelParams) => {
  try {
    const symbol = String(cancelParams.symbol);
    const algoId = cancelParams.algoId;
    const orderId = cancelParams.orderId || cancelParams.origClientOrderId;
    
    if (!algoId && !orderId) {
      throw new Error('Either algoId, orderId or origClientOrderId must be provided');
    }

    const params = {
      symbol: symbol,
      timestamp: Date.now(),
      recvWindow: 60000
    };

    if (algoId) {
      params.algoId = String(algoId);
    } else if (!isNaN(parseInt(orderId))) {
      params.orderId = String(orderId);
    } else {
      params.origClientOrderId = String(orderId);
    }

    console.log('Cancelling Binance futures order:', JSON.stringify(params, null, 2));
    return await signedRequest(
      'https://fapi.binance.com',
      algoId ? '/fapi/v1/algoOrder' : '/fapi/v1/order',
      'DELETE',
      params
    );
  } catch (error) {
    const enhancedError = new Error(error.message || error.toString());
    enhancedError.code = error.code;
    enhancedError.binanceResponse = error.binanceResponse;
    enhancedError.details = error;
    throw enhancedError;
  }
};

export const cancelAllFuturesOrders = async ({ symbol }) => {
  const params = { symbol: String(symbol), timestamp: Date.now(), recvWindow: 60000 };
  const [regularOrders, algoOrders] = await Promise.all([
    signedRequest('https://fapi.binance.com', '/fapi/v1/allOpenOrders', 'DELETE', params),
    signedRequest('https://fapi.binance.com', '/fapi/v1/algoOpenOrders', 'DELETE', params)
  ]);
  return { regularOrders, algoOrders };
};

export const testConnection = async () => {
  try {
    await getAccountInfo();
    return { success: true, message: 'Connection successful' };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

