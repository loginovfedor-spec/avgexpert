import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chatService from '../../src/modules/chat/chat.service';
import knowledgeGateway from '../../src/modules/knowledge/knowledge.gateway';
import categoryRepository from '../../src/modules/admin/category.repository';
import providerFactory from '../../src/modules/providers/provider.factory';
import ragDataset from './rag_dataset.json';
import { asMock } from '../helpers/cast';
import type { Response } from 'express';

const __filename = fileURLToPath(import.meta.url);

type EvalCase = {
  id: string;
  category: string;
  query: string;
  context: unknown;
  expected_behavior?: string;
  expected_answer?: string;
  required_citations?: string[];
  must_include?: string[];
};

type EvalResult = {
  id: string;
  passed: boolean;
  message?: string;
};

type CompletionResponse = {
  choices: Array<{ message: { content?: string } }>;
  _retrieval?: { chunks?: Array<{ sourceId: string }> };
  status?: number;
};

type GatewayWithRetrievers = {
  retrievers: Map<string, { search: (query: string, config: Record<string, unknown>) => Promise<unknown> }>;
  registerRetriever: typeof knowledgeGateway.registerRetriever;
};

type DeterministicAdapter = { response?: string };

const { adapters } = providerFactory as { adapters: Record<string, DeterministicAdapter> };

export class RAGEvalRunner {
  results: EvalResult[] = [];
  originalFindByName = categoryRepository.findByName;

  async runAll() {
    console.log('\n=== RAG Eval Runner (EVAL-002) ===');
    for (const testCase of ragDataset as EvalCase[]) {
      const result = await this.runCase(testCase);
      this.results.push(result);
      const icon = result.passed ? '✅' : '❌';
      console.log(`${icon} ${testCase.id} [${testCase.category}] ${result.message || ''}`);
    }

    const passed = this.results.filter((r) => r.passed).length;
    const accuracy = ((passed / this.results.length) * 100).toFixed(1) + '%';

    console.log('\n=== RAG Eval Summary ===');
    console.log(`Total: ${this.results.length} | Passed: ${passed} | Accuracy: ${accuracy}`);
    console.log('========================\n');

    return { total: this.results.length, passed, accuracy, details: this.results };
  }

  async runCase(testCase: EvalCase): Promise<EvalResult> {
    categoryRepository.findByName = async () =>
      asMock<Awaited<ReturnType<typeof categoryRepository.findByName>>>({
        rag_enabled: true,
        rag_mode: 'fast',
        provider: 'test',
        model_name: 'mock',
        rag_answerability_policy: testCase.expected_behavior === 'refuse' ? 'refusal' : 'balanced',
      });

    const gateway = knowledgeGateway as unknown as GatewayWithRetrievers;
    const originalRetriever = gateway.retrievers.get('default');
    knowledgeGateway.registerRetriever('default', {
      search: async () => testCase.context as never,
    });

    const deterministicAdapter = adapters.deterministic;
    if (deterministicAdapter) {
      deterministicAdapter.response = testCase.expected_answer || 'Mock refusal';
    }

    let responseData: CompletionResponse | null = null;
    const body = {
      messages: [{ role: 'user', content: testCase.query }],
      stream: false,
    };
    const res = {
      json: (data: CompletionResponse) => {
        responseData = data;
      },
      req: { on: () => {}, off: () => {}, body },
      status: (_code: number) => ({
        json: (data: CompletionResponse) => {
          responseData = data;
          responseData.status = _code;
        },
      }),
    };

    try {
      await chatService.handleCompletion({
        user: { username: 'eval_user', category: 'User' },
        body: asMock<Parameters<typeof chatService.handleCompletion>[0]['body']>(body),
        catSettings: asMock<Parameters<typeof chatService.handleCompletion>[0]['catSettings']>({}),
        res: asMock<Response>(res),
      });

      return this._validate(testCase, responseData);
    } catch (error) {
      return {
        id: testCase.id,
        passed: false,
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      };
    } finally {
      if (originalRetriever) {
        knowledgeGateway.registerRetriever(
          'default',
          asMock<Parameters<typeof knowledgeGateway.registerRetriever>[1]>(originalRetriever)
        );
      }
    }
  }

  _validate(testCase: EvalCase, response: CompletionResponse | null): EvalResult {
    if (!response) {
      return { id: testCase.id, passed: false, message: 'No response' };
    }

    const answer = (response.choices[0].message.content || '').toLowerCase();
    const retrieval = response._retrieval;

    const RU_REFUSAL_MARKERS = [
      'недостаточно',
      'не указан',
      'не содержит',
      'не упомина',
      'не могу',
      'отсутств',
      "don't have enough information",
      'not provided',
      'context does not mention',
    ];

    if (testCase.expected_behavior === 'refuse') {
      const isRefusal = RU_REFUSAL_MARKERS.some((m) => answer.includes(m));
      return {
        id: testCase.id,
        passed: isRefusal,
        message: isRefusal ? 'Correct refusal' : 'Failed to refuse',
      };
    }

    if (testCase.required_citations) {
      if (!retrieval?.chunks) {
        return { id: testCase.id, passed: false, message: 'Missing retrieval metadata for citation check' };
      }
      const foundCitations = retrieval.chunks.map((c) => c.sourceId);
      const missing = testCase.required_citations.filter((id) => !foundCitations.includes(id));
      if (missing.length > 0) {
        return { id: testCase.id, passed: false, message: `Missing citations: ${missing.join(', ')}` };
      }
    }

    if (Array.isArray(testCase.must_include) && testCase.must_include.length > 0) {
      const missing = testCase.must_include.filter((k) => !answer.includes(k.toLowerCase()));
      const passed = missing.length === 0;
      return {
        id: testCase.id,
        passed,
        message: passed ? 'must_include OK' : `Missing: ${missing.join(', ')}`,
      };
    }

    if (testCase.expected_answer) {
      const tokens = testCase.expected_answer
        .split(/[\s(),./]+/)
        .map((w) => w.trim())
        .filter((w) => w.length > 2);
      const matchCount = tokens.filter((k) => answer.includes(k.toLowerCase())).length;
      const matchRatio = tokens.length ? matchCount / tokens.length : 0;
      const passed = matchRatio >= 0.5;
      return {
        id: testCase.id,
        passed,
        message: passed
          ? `Matched ${matchRatio.toFixed(2)}`
          : `Poor match ${matchRatio.toFixed(2)} | Expected: ${testCase.expected_answer}`,
      };
    }

    return { id: testCase.id, passed: true, message: 'Valid response' };
  }
}

if (process.argv[1] === __filename) {
  const runner = new RAGEvalRunner();
  runner
    .runAll()
    .then((report) => {
      const reportPath = path.join(process.cwd(), 'docs/06_testing/EVALS_REPORT.json');

      let existingReport: Record<string, unknown> = {};
      if (fs.existsSync(reportPath)) {
        try {
          existingReport = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as Record<string, unknown>;
        } catch {
          /* ignore */
        }
      }

      const newReport = {
        ...existingReport,
        rag_score: parseFloat(report.accuracy) / 100,
        rag_last_run: new Date().toISOString(),
      };

      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      fs.writeFileSync(reportPath, JSON.stringify(newReport, null, 2));
      console.log(`Report saved to ${reportPath}`);

      process.exit(report.passed === report.total ? 0 : 1);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
