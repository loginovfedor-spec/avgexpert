export let exchangeRateCache = {
  rate: 90.0, // Fallback rate
  timestamp: 0,
};

export async function getUsdExchangeRate(): Promise<number> {
  const now = Date.now();
  // Cache for 4 hours
  if (now - exchangeRateCache.timestamp < 1000 * 60 * 60 * 4 && exchangeRateCache.rate > 0) {
    return exchangeRateCache.rate;
  }
  
  try {
    const response = await fetch('https://www.cbr-xml-daily.ru/daily_json.js');
    if (response.ok) {
      const data = await response.json();
      if (data?.Valute?.USD?.Value) {
        exchangeRateCache.rate = data.Valute.USD.Value;
        exchangeRateCache.timestamp = now;
      }
    }
  } catch (error) {
    console.error('Failed to fetch CBR exchange rate:', error);
  }
  
  return exchangeRateCache.rate;
}
