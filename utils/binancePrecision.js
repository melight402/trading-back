import { BINANCE_FUTURES_PRECISION } from '../constants/binancePrecision.js';

const getTickSizePrecision = (tickSize) => {
  if (!tickSize || tickSize <= 0) {
    return 2;
  }

  if (tickSize >= 1) {
    return 0;
  } else if (tickSize >= 0.1) {
    return 1;
  } else if (tickSize >= 0.01) {
    return 2;
  } else if (tickSize >= 0.001) {
    return 3;
  } else if (tickSize >= 0.0001) {
    return 4;
  } else if (tickSize >= 0.00001) {
    return 5;
  } else if (tickSize >= 0.000001) {
    return 6;
  } else {
    return 8;
  }
};

const getStepSizePrecision = (stepSizeString) => {
  if (!stepSizeString) {
    return 8;
  }

  if (stepSizeString.includes('.')) {
    const parts = stepSizeString.split('.');
    if (parts.length === 2) {
      return parts[1].length;
    }
  }

  return 0;
};

export const roundPrice = (price, symbol) => {
  if (!price || price <= 0) {
    return price;
  }

  const precisionData = BINANCE_FUTURES_PRECISION[symbol];
  if (!precisionData || !precisionData.tickSize) {
    const rounded = parseFloat(price.toFixed(2));
    return rounded;
  }

  const tickSize = parseFloat(precisionData.tickSize);
  if (isNaN(tickSize) || tickSize <= 0) {
    const rounded = parseFloat(price.toFixed(2));
    return rounded;
  }

  const precision = getTickSizePrecision(tickSize);
  const steps = Math.round(price / tickSize);
  const rounded = steps * tickSize;
  
  return parseFloat(rounded.toFixed(precision));
};

export const roundQuantity = (quantity, symbol) => {
  if (!quantity || quantity <= 0) {
    return quantity || 0;
  }

  const precisionData = BINANCE_FUTURES_PRECISION[symbol];
  if (!precisionData || !precisionData.stepSize) {
    return quantity;
  }

  const stepSizeString = precisionData.stepSize;
  const stepSize = parseFloat(stepSizeString);
  if (isNaN(stepSize) || stepSize <= 0) {
    return quantity;
  }

  const precision = getStepSizePrecision(stepSizeString);
  const steps = Math.floor(quantity / stepSize);
  const rounded = steps * stepSize;
  
  if (precision > 0) {
    return parseFloat(rounded.toFixed(precision));
  }
  
  return Math.round(rounded);
};

