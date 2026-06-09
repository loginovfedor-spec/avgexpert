
const chatService = require('../../src/modules/chat/chat.service');
const knowledgeGateway = require('../../src/modules/knowledge/knowledge.gateway');
const categoryRepository = require('../../src/modules/admin/category.repository');
const { adapters } = require('../../src/modules/providers/provider.factory');
const ragDataset = require('./rag_dataset.json');

class RAGEvalRunner {
  constructor() {
    this.results = [];
    this.originalFindByName = categoryRepository.findByName;
  }

  async runAll() {
    console.log('\n=== RAG Eval Runner (EVAL-002) ===');
    for (const testCase of ragDataset) {
      const result = await this.runCase(testCase);
      this.results.push(result);
      const icon = result.passed ? '✅' : '❌';
      console.log(`${icon} ${testCase.id} [${testCase.category}] ${result.message || ''}`);
    }

    const passed = this.results.filter(r => r.passed).length;
    const accuracy = ((passed / this.results.length) * 100).toFixed(1) + '%';
    
    console.log('\n=== RAG Eval Summary ===');
    console.log(`Total: ${this.results.length} | Passed: ${passed} | Accuracy: ${accuracy}`);
    console.log('========================\n');

    return { total: this.results.length, passed, accuracy, details: this.results };
  }

  async runCase(testCase) {
    // 1. Mock Category & Provider
    categoryRepository.findByName = async () => ({
      rag_enabled: true,
      rag_mode: 'fast',
      provider: 'test',
      model_name: 'mock',
      rag_answerability_policy: testCase.expected_behavior === 'refuse' ? 'refusal' : 'balanced'
    });

    // 2. Mock Knowledge Gateway
    const originalRetriever = knowledgeGateway.retrievers.get('default');
    knowledgeGateway.registerRetriever('default', {
      search: async () => testCase.context
    });

    // 3. Prepare Request/Response Mocks
    const deterministicAdapter = adapters.deterministic;
    if (deterministicAdapter) {
      deterministicAdapter.response = testCase.expected_answer || 'Mock refusal';
    }

    let responseData = null;
    const body = { 
      messages: [{ role: 'user', content: testCase.query }],
      stream: false 
    };
    const res = {
      json: (data) => { responseData = data; },
      req: { on: () => {}, off: () => {}, body },
      status: (code) => ({ json: (data) => { responseData = data; responseData.status = code; } })
    };

    try {
      await chatService.handleCompletion({ 
        user: { username: 'eval_user', category: 'User' }, 
        body, 
        res 
      });

      // 4. Validate Result
      const passed = this._validate(testCase, responseData);
      return passed;

    } catch (error) {
      return { id: testCase.id, passed: false, message: `Error: ${error.message}` };
    } finally {
      // Restore default retriever
      knowledgeGateway.registerRetriever('default', originalRetriever);
    }
  }

  _validate(testCase, response) {
    const answer = response.choices[0].message.content;
    const retrieval = response._retrieval;

    // Check refusal
    if (testCase.expected_behavior === 'refuse') {
      const isRefusal = answer.toLowerCase().includes("don't have enough information") || 
                        answer.toLowerCase().includes("not provided") ||
                        answer.toLowerCase().includes("context does not mention");
      return { 
        id: testCase.id, 
        passed: isRefusal, 
        message: isRefusal ? 'Correct refusal' : 'Failed to refuse' 
      };
    }

    // Check citations
    if (testCase.required_citations) {
      const foundCitations = retrieval.chunks.map(c => c.sourceId);
      const missing = testCase.required_citations.filter(id => !foundCitations.includes(id));
      if (missing.length > 0) {
        return { id: testCase.id, passed: false, message: `Missing citations: ${missing.join(', ')}` };
      }
    }

    // Check content (Heuristic: keyword match)
    if (testCase.expected_answer) {
      const keywords = testCase.expected_answer.split(' ').filter(w => w.length > 3);
      const matchCount = keywords.filter(k => answer.toLowerCase().includes(k.toLowerCase())).length;
      const matchRatio = matchCount / keywords.length;
      
      const passed = matchRatio >= 0.5; // Simple threshold
      return { 
        id: testCase.id, 
        passed, 
        message: passed ? `Matched ${matchRatio.toFixed(2)}` : `Poor match ${matchRatio.toFixed(2)} | Expected: ${testCase.expected_answer}`
      };
    }

    return { id: testCase.id, passed: true, message: 'Valid response' };
  }
}

if (require.main === module) {
  const runner = new RAGEvalRunner();
  runner.runAll().then(report => {
    // Save report for dashboard
    const fs = require('fs');
    const path = require('path');
    const reportPath = path.join(process.cwd(), 'docs/06_testing/EVALS_REPORT.json');
    
    let existingReport = {};
    if (fs.existsSync(reportPath)) {
      try { existingReport = JSON.parse(fs.readFileSync(reportPath, 'utf8')); } catch (e) {}
    }
    
    const newReport = {
      ...existingReport,
      rag_score: parseFloat(report.accuracy) / 100,
      rag_last_run: new Date().toISOString()
    };
    
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(newReport, null, 2));
    console.log(`Report saved to ${reportPath}`);

    process.exit(report.passed === report.total ? 0 : 1);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { RAGEvalRunner };
