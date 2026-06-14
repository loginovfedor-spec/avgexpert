// @ts-ignore
import fetch from 'node-fetch';
import { getDatabasePort } from '../../core/pg';
import logger from '../../core/logger';

const log = logger.scoped('ExchangeRateService');

export class ExchangeRateService {
  private updateInterval: NodeJS.Timeout | null = null;
  public _fetch = fetch;
  private cachedRates: Record<string, number> = { USD: 90.0 };

  /**
   * Получает кэшированный в памяти курс.
   */
  getCachedRate(currency: string = 'USD'): number {
    return this.cachedRates[currency] || 90.0;
  }

  /**
   * Обновляет курс доллара США из API ЦБ РФ и сохраняет его в БД.
   * Возвращает полученный курс.
   */
  async updateRates(): Promise<number> {
    try {
      const response = await this._fetch('http://www.cbr.ru/scripts/XML_daily.asp');
      if (!response.ok) {
        throw new Error(`CBR API returned status ${response.status}`);
      }

      // XML от ЦБ РФ приходит в кодировке Windows-1251.
      // Так как мы ищем только латинские теги и цифры, node-fetch возвращает строку с корректными ASCII символами.
      const xmlText = await response.text();

      // Регулярное выражение для поиска USD (ID="R01235")
      const match = xmlText.match(/<Valute[^>]*?ID="R01235"[^>]*?>[\s\S]*?<Value>([^<]+)<\/Value>/i);
      if (!match) {
        throw new Error('USD rate not found in CBR XML response');
      }

      const valString = match[1].replace(',', '.');
      const rate = parseFloat(valString);
      if (Number.isNaN(rate) || rate <= 0) {
        throw new Error(`Invalid USD rate parsed from CBR XML: ${valString}`);
      }

      const db = getDatabasePort();
      const updatedAt = Date.now();
      
      await db.run(`
        INSERT INTO exchange_rates (currency, rate, updated_at)
        VALUES ('USD', @rate, @updatedAt)
        ON CONFLICT (currency) DO UPDATE
        SET rate = @rate, updated_at = @updatedAt
      `, { rate, updatedAt });

      log.info(`USD exchange rate updated successfully from CBR: ${rate} RUB`);
      this.cachedRates['USD'] = rate; // Обновляем кэш в памяти
      return rate;
    } catch (error) {
      log.error('Failed to update USD rate from CBR API', error);
      throw error;
    }
  }

  /**
   * Получает курс валюты (по умолчанию USD) из БД.
   * Если курса в БД нет, то пытается принудительно обновить его через API.
   * В случае сбоя возвращает fallback-значение.
   */
  async getRate(currency: string = 'USD'): Promise<number> {
    try {
      const db = getDatabasePort();
      const row = await db.get<{ rate: string | number; updated_at: string | number }>(
        'SELECT rate, updated_at FROM exchange_rates WHERE currency = @currency',
        { currency }
      );

      if (row) {
        const rate = typeof row.rate === 'string' ? parseFloat(row.rate) : Number(row.rate);
        const updatedAt = typeof row.updated_at === 'string' ? parseInt(row.updated_at, 10) : Number(row.updated_at);
        this.cachedRates[currency] = rate; // Обновляем кэш
        
        const ttl = 24 * 60 * 60 * 1000; // 24 часа
        if (Date.now() - updatedAt < ttl) {
          return rate;
        }

        log.info(`Rate for ${currency} is older than 24h, attempting to refresh...`);
        try {
          return await this.updateRates();
        } catch (updateErr) {
          log.error(`Failed to refresh rate for ${currency}, returning stale rate from DB`, updateErr);
          return rate;
        }
      }

      // Если в БД записи нет, пробуем обновить с ЦБ
      log.info(`No rate for ${currency} in DB, attempting to fetch from CBR...`);
      const freshRate = await this.updateRates();
      this.cachedRates[currency] = freshRate; // Обновляем кэш
      return freshRate;
    } catch (error) {
      log.error(`Error fetching rate for ${currency}, returning fallback`, error);
      const defaultRate = process.env.DEFAULT_USD_RATE 
        ? parseFloat(process.env.DEFAULT_USD_RATE) 
        : 90.0;
      const finalRate = Number.isNaN(defaultRate) ? 90.0 : defaultRate;
      this.cachedRates[currency] = finalRate; // Обновляем кэш
      return finalRate;
    }
  }

  /**
   * Запускает периодическое обновление курса раз в 24 часа.
   */
  startScheduler(): void {
    if (this.updateInterval) return;

    this.updateInterval = setInterval(() => {
      this.updateRates().catch((err) => {
        log.error('Scheduled exchange rate update failed', err);
      });
    }, 24 * 60 * 60 * 1000);

    log.info('Exchange rate scheduler started (daily updates)');
  }

  /**
   * Останавливает планировщик.
   */
  stopScheduler(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      log.info('Exchange rate scheduler stopped');
    }
  }
}

export default new ExchangeRateService();
