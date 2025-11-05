import Binance from 'node-binance-api';

let binanceClient = null;

const getCredentials = () => {
          if (process.env.BINANCE_API_KEY && process.env.BINANCE_SECRET_KEY) {
    return {
              apiKey: process.env.BINANCE_API_KEY,
              secretKey: process.env.BINANCE_SECRET_KEY
    };
          } else {
    throw new Error('Binance credentials not found in .env. Please set BINANCE_API_KEY and BINANCE_SECRET_KEY');
      }
};

const getBinanceClient = () => {
  if (binanceClient) {
    return binanceClient;
  }

  try {
    const credentials = getCredentials();
    binanceClient = Binance({
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
    const client = getBinanceClient();
    return new Promise((resolve, reject) => {
      client.futuresOrder(orderParams, (error, response) => {
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

export const testConnection = async () => {
  try {
    await getAccountInfo();
    return { success: true, message: 'Connection successful' };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

