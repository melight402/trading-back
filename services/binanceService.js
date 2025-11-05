import Binance from 'node-binance-api';
import crypto from 'crypto';

let binanceClient = null;

const getCredentials = () => {
  const rawApiKey = process.env.BINANCE_API_KEY;
  const rawSecretKey = process.env.BINANCE_SECRET_KEY;
  
  console.log('Raw API Key from env:', rawApiKey ? `Length: ${rawApiKey.length}, First 20: ${rawApiKey.substring(0, 20)}...` : 'NOT SET');
  console.log('Raw Secret Key from env:', rawSecretKey ? `Length: ${rawSecretKey.length}, First 20: ${rawSecretKey.substring(0, 20)}...` : 'NOT SET');
  
  const apiKey = rawApiKey ? rawApiKey.trim().replace(/^["']|["']$/g, '') : null;
  const secretKey = rawSecretKey ? rawSecretKey.trim().replace(/^["']|["']$/g, '') : null;
  
  if (!apiKey || !secretKey) {
    throw new Error('Binance credentials not found in .env. Please set BINANCE_API_KEY and BINANCE_SECRET_KEY');
  }
  
  console.log('Processed API Key length:', apiKey.length);
  console.log('Processed Secret Key length:', secretKey.length);
  
  if (apiKey.length < 20) {
    console.error(`ERROR: API key length is ${apiKey.length}, expected ~64 characters.`);
    console.error('API Key value (first 30 chars):', apiKey.substring(0, 30));
    console.error('Please check your .env file format. It should be:');
    console.error('BINANCE_API_KEY=your_full_key_without_quotes');
    console.error('BINANCE_SECRET_KEY=your_full_secret_without_quotes');
    throw new Error(`Invalid API key format. API key length is ${apiKey.length}, expected ~64 characters. Please check your .env file and ensure BINANCE_API_KEY contains the full key without quotes or spaces.`);
  }
  
  return {
    apiKey: apiKey,
    secretKey: secretKey
  };
};

const getBinanceClient = () => {
  if (binanceClient) {
    return binanceClient;
  }

  try {
    const credentials = getCredentials();
    binanceClient = new Binance({
      APIKEY: credentials.apiKey,
      APISECRET: credentials.secretKey
    });
    return binanceClient;
  } catch (error) {
    throw new Error(`Failed to initialize Binance client: ${error.message}`);
  }
};

export const getAccountInfo = async () => {
  try {
    const client = getBinanceClient();
    return new Promise((resolve, reject) => {
      client.account((error, data) => {
        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      });
    });
  } catch (error) {
    throw error;
  }
};

export const getExchangeInfo = async () => {
  try {
    const client = getBinanceClient();
    return new Promise((resolve, reject) => {
      client.exchangeInfo((error, data) => {
        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      });
    });
  } catch (error) {
    throw error;
  }
};

export const getPrice = async (symbol) => {
  try {
    const client = getBinanceClient();
    return new Promise((resolve, reject) => {
      client.prices(symbol, (error, data) => {
        if (error) {
          reject(error);
        } else {
          resolve(data[symbol]);
        }
      });
    });
  } catch (error) {
    throw error;
  }
};

export const placeOrder = async (orderParams) => {
  try {
    const client = getBinanceClient();
    return new Promise((resolve, reject) => {
      client.order(orderParams, (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });
  } catch (error) {
    throw error;
  }
};

export const placeFuturesOrder = async (orderParams) => {
  try {
    const credentials = getCredentials();
    
    if (credentials.apiKey.length < 20) {
      throw new Error(`Invalid API key format. API key length is ${credentials.apiKey.length}, expected ~64 characters. Please check your .env file and ensure BINANCE_API_KEY contains the full key without quotes or spaces.`);
    }
    
    const params = {
      symbol: String(orderParams.symbol),
      side: String(orderParams.side),
      type: String(orderParams.type),
      quantity: String(orderParams.quantity),
      positionSide: String(orderParams.positionSide)
    };

    if (orderParams.price) {
      params.price = String(orderParams.price);
    }

    if (orderParams.timeInForce) {
      params.timeInForce = String(orderParams.timeInForce);
    }

    if (orderParams.stopPrice) {
      params.stopPrice = String(orderParams.stopPrice);
    }

    if (orderParams.closePosition !== undefined) {
      params.closePosition = orderParams.closePosition ? 'true' : 'false';
    }

    if (orderParams.reduceOnly !== undefined) {
      params.reduceOnly = orderParams.reduceOnly ? 'true' : 'false';
    }

    if (!params.timeInForce && (params.type.includes('LIMIT') || params.type === 'STOP' || params.type === 'TAKE_PROFIT')) {
      params.timeInForce = 'GTX';
    }

    if (!params.newClientOrderId) {
      params.newClientOrderId = `x-${Date.now()}`;
    }

    const timestamp = Date.now();
    params.timestamp = timestamp;

    const sortedKeys = Object.keys(params).sort();
    const queryString = sortedKeys
      .map(key => `${key}=${encodeURIComponent(params[key])}`)
      .join('&');

    const signature = crypto
      .createHmac('sha256', credentials.secretKey)
      .update(queryString)
      .digest('hex');

    const url = `https://fapi.binance.com/fapi/v1/order?${queryString}&signature=${signature}`;

    console.log('Placing direct Binance futures order:', JSON.stringify(params, null, 2));
    console.log('Query string (without signature):', queryString);
    console.log('API Key length:', credentials.apiKey.length);
    console.log('Secret Key length:', credentials.secretKey.length);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': credentials.apiKey
      }
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data.msg || data.message || `HTTP ${response.status}: ${JSON.stringify(data)}`;
      console.error('Binance API error:', errorMsg);
      console.error('Response data:', JSON.stringify(data, null, 2));
      console.error('Request URL (without signature):', url.replace(/signature=[^&]+/, 'signature=***'));
      throw new Error(errorMsg);
    }

    console.log('Binance order result:', JSON.stringify(data, null, 2));
    return data;
  } catch (error) {
    const enhancedError = new Error(error.message || error.toString());
    enhancedError.details = error;
    throw enhancedError;
  }
};

export const testConnection = async () => {
  try {
    await getAccountInfo();
    return { success: true, message: 'Connection successful' };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

