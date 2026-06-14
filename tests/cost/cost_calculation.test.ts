import { describe, it } from 'node:test';
import assert from 'node:assert';
import costCalculator from '../../src/modules/cost/cost_calculator.service';
import { MODEL_RATES } from '../../src/modules/cost/rates.config';

describe('CostCalculatorService', () => {
  describe('parseCostRates', () => {
    it('should read flat rates from _env config', () => {
      const config = {
        _env: {
          COST_USD_PER_1M_INPUT: '5.00',
          COST_USD_PER_1M_CACHED_INPUT: '0.50',
          COST_USD_PER_1M_OUTPUT: '30.00',
          COST_MODE: 'standard',
          COST_CURRENCY: 'USD',
          COST_EXCHANGE_RATE: '1.0'
        }
      };

      const rates = costCalculator.parseCostRates(config, 'any-model');

      assert.strictEqual(rates.inputRate, 0.000005);
      assert.strictEqual(rates.cachedRate, 0.0000005);
      assert.strictEqual(rates.outputRate, 0.00003);
      assert.strictEqual(rates.costMode, 'standard');
      assert.strictEqual(rates.currency, 'USD');
      assert.strictEqual(rates.exchangeRate, 1.0);
    });

    it('should fallback to MODEL_RATES if config is empty or missing cost fields', () => {
      const config = {
        _env: {
          DEFAULT_MODEL: 'gpt-5.5'
        }
      };

      const rates = costCalculator.parseCostRates(config, 'gpt-5.5');
      const expected = MODEL_RATES['gpt-5.5'];

      assert.strictEqual(rates.inputRate, expected.input / 1_000_000);
      assert.strictEqual(rates.cachedRate, expected.cached! / 1_000_000);
      assert.strictEqual(rates.outputRate, expected.output / 1_000_000);
      assert.strictEqual(rates.costMode, 'standard');
    });

    it('should return 0 rates if model has no config and no fallback exists', () => {
      const rates = costCalculator.parseCostRates(null, 'non-existent-model-name');

      assert.strictEqual(rates.inputRate, 0);
      assert.strictEqual(rates.cachedRate, 0);
      assert.strictEqual(rates.outputRate, 0);
    });

    it('should read compute rates from config', () => {
      const config = {
        _env: {
          COST_MODE: 'compute',
          COST_USD_PER_HOUR: '0.36',
          COST_MIN_BILLABLE_SECONDS: '5.0',
          COST_CURRENCY: 'USD',
          COST_EXCHANGE_RATE: '1.0'
        }
      };

      const rates = costCalculator.parseCostRates(config, 'llamacpp-model');

      assert.strictEqual(rates.costMode, 'compute');
      assert.strictEqual(rates.inputRate, 0);
      assert.strictEqual(rates.cachedRate, 0);
      assert.strictEqual(rates.outputRate, 0);
      assert.strictEqual(rates.rateUsdPerHour, 0.36);
      assert.strictEqual(rates.minBillableSeconds, 5.0);
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost correctly with fresh/cached split in USD', () => {
      const rates = {
        inputRate: 5 / 1_000_000,
        cachedRate: 0.5 / 1_000_000,
        outputRate: 30 / 1_000_000,
        costMode: 'standard',
        currency: 'USD',
        exchangeRate: 1.0
      };

      // 1000 prompt tokens, 400 cached, 200 completion tokens
      const usage = {
        prompt_tokens: 1000,
        cached_input_tokens: 400,
        completion_tokens: 200,
        total_tokens: 1200
      };

      // fresh_input = 1000 - 400 = 600
      // cost = 600 * 5e-6 + 400 * 5e-7 + 200 * 3e-5
      // cost = 0.003 + 0.0002 + 0.006 = 0.0092
      const cost = costCalculator.calculateCost(usage, rates);
      assert.strictEqual(Math.abs(cost - 0.0092) < 1e-9, true);
    });

    it('should convert currency correctly using division when exchangeRate > 1.0', () => {
      const rates = {
        inputRate: 4.10 / 1_000_000, // RUB
        cachedRate: 0,
        outputRate: 4.10 / 1_000_000, // RUB
        costMode: 'sync',
        currency: 'RUB',
        exchangeRate: 90.0 // 90 RUB = 1 USD
      };

      const usage = {
        prompt_tokens: 1000000, // 1M input tokens = 4.10 RUB
        completion_tokens: 1000000, // 1M output tokens = 4.10 RUB
        total_tokens: 2000000
      };

      // Total in RUB = 4.10 + 4.10 = 8.20 RUB
      // In USD = 8.20 / 90 = 0.09111111 USD
      const cost = costCalculator.calculateCost(usage, rates);
      assert.strictEqual(Math.abs(cost - (8.20 / 90)) < 1e-9, true);
    });

    it('should convert currency correctly using multiplication when exchangeRate <= 1.0', () => {
      const rates = {
        inputRate: 4.10 / 1_000_000, // RUB
        cachedRate: 0,
        outputRate: 4.10 / 1_000_000, // RUB
        costMode: 'sync',
        currency: 'RUB',
        exchangeRate: 0.011 // 1 RUB = 0.011 USD
      };

      const usage = {
        prompt_tokens: 1000000, // 4.10 RUB
        completion_tokens: 1000000, // 4.10 RUB
        total_tokens: 2000000
      };

      // Total in RUB = 8.20 RUB
      // In USD = 8.20 * 0.011 = 0.0902 USD
      const cost = costCalculator.calculateCost(usage, rates);
      assert.strictEqual(Math.abs(cost - 0.0902) < 1e-9, true);
    });

    it('should calculate compute cost correctly using duration and hourly rate', () => {
      const rates = {
        inputRate: 0,
        cachedRate: 0,
        outputRate: 0,
        costMode: 'compute',
        currency: 'USD',
        exchangeRate: 1.0,
        rateUsdPerHour: 0.36,
        minBillableSeconds: 5.0
      };

      // 3 seconds elapsed, should bill minBillableSeconds (5.0s)
      // cost = (5 / 3600) * 0.36 = 0.0005 USD
      const usageMin = {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        compute_seconds: 3.0
      };
      const costMin = costCalculator.calculateCost(usageMin, rates);
      assert.strictEqual(Math.abs(costMin - 0.0005) < 1e-9, true);

      // 10 seconds elapsed, should bill actual seconds (10.0s)
      // cost = (10 / 3600) * 0.36 = 0.0010 USD
      const usageActual = {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        compute_seconds: 10.0
      };
      const costActual = costCalculator.calculateCost(usageActual, rates);
      assert.strictEqual(Math.abs(costActual - 0.001) < 1e-9, true);
    });
  });

  describe('enrichUsage', () => {
    it('should enrich usage with cost_usd rounded to 8 decimal places', () => {
      const config = {
        _env: {
          COST_USD_PER_1M_INPUT: '5.00',
          COST_USD_PER_1M_OUTPUT: '30.00'
        }
      };

      const usage = {
        prompt_tokens: 1000000,
        completion_tokens: 1000000,
        total_tokens: 2000000
      };

      const enriched = costCalculator.enrichUsage(usage, {
        providerId: 'openai',
        modelName: 'gpt-5.5',
        config
      });

      assert.strictEqual(enriched.cost_usd, 35.00);
      assert.strictEqual((enriched as any)._costMode, 'standard');
    });

    it('should enrich usage with compute_seconds and cost_usd', () => {
      const config = {
        _env: {
          COST_MODE: 'compute',
          COST_USD_PER_HOUR: '3.60',
          COST_MIN_BILLABLE_SECONDS: '1.0'
        }
      };

      const usage = {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150
      };

      const enriched = costCalculator.enrichUsage(usage, {
        providerId: 'llamacpp',
        modelName: 'qwen2.5-7b',
        config,
        computeSeconds: 10.0
      });

      // 10s: (10/3600)*3.60 = 0.01 USD
      assert.strictEqual(enriched.compute_seconds, 10.0);
      assert.strictEqual(enriched.cost_usd, 0.01);
      assert.strictEqual((enriched as any)._costMode, 'compute');
    });
  });
});
