const fs = await import('fs');
const path = await import('path');
const { fileURLToPath } = await import('url');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const generateBinancePrecision = async () => {
  try {
    console.log('Fetching exchange info from Binance...');
    const response = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const exchangeInfo = await response.json();
    
    const precisionData = {};
    
    exchangeInfo.symbols
      .filter((symbolInfo) => {
        return (
          symbolInfo.status === 'TRADING' &&
          symbolInfo.contractType === 'PERPETUAL' &&
          (symbolInfo.symbol.endsWith("USDT") || symbolInfo.symbol.endsWith("USDC"))
        );
      })
      .forEach((symbolInfo) => {
        const lotSizeFilter = symbolInfo.filters?.find(f => f.filterType === 'LOT_SIZE');
        const priceFilter = symbolInfo.filters?.find(f => f.filterType === 'PRICE_FILTER');
        
        if (lotSizeFilter && lotSizeFilter.stepSize && priceFilter && priceFilter.tickSize) {
          precisionData[symbolInfo.symbol] = {
            stepSize: lotSizeFilter.stepSize,
            tickSize: priceFilter.tickSize
          };
        }
      });

    const jsContent = `export const BINANCE_FUTURES_PRECISION = ${JSON.stringify(precisionData, null, 2)};\n`;

    console.log(`Generated precision data for ${Object.keys(precisionData).length} symbols`);
    console.log('Sample symbols:', Object.keys(precisionData).slice(0, 5));
    
    return jsContent;
  } catch (error) {
    console.error('Error generating precision data:', error);
    throw error;
  }
};

const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     process.argv[1]?.endsWith('generateBinancePrecision.js') ||
                     import.meta.url.endsWith('generateBinancePrecision.js');

if (isMainModule) {
  generateBinancePrecision()
    .then((content) => {
      const outputPath = path.join(__dirname, '../constants/binancePrecision.js');
      fs.writeFileSync(outputPath, content, 'utf8');
      console.log(`Precision data saved to ${outputPath}`);
    })
    .catch((error) => {
      console.error('Failed to generate precision data:', error);
      process.exit(1);
    });
}

export { generateBinancePrecision };

