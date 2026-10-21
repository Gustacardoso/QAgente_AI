import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.QAGENT_MODEL || 'claude-sonnet-5-5';

const PLAN_TOOL = {
  name: 'submit_test_plan',
  description: 'Entrega o plano de teste E2E como lista de passos executáveis.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Nome curto do teste' },
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            action: { enum: ['goto', 'fill', 'click', 'expect_visible', 'expect_text', 'expect_url'] },
            selector: { type: 'string', description: 'Seletor CSS (use apenas os do snapshot)' },
            value: { type: 'string', description: 'URL, texto a preencher ou texto esperado' },
          },
          required: ['action'],
        },
      },
    },
    required: ['name', 'steps'],
  },
};

const SYSTEM = `Você é um engenheiro de QA que automatiza testes E2E.
Dado um objetivo em linguagem natural e um snapshot da página, produza um plano de teste.
Regras: use SOMENTE seletores presentes no snapshot; termine sempre com ao menos uma asserção
(expect_*); o primeiro passo deve ser goto. Se receber uma falha anterior, corrija o plano
(ex.: seletor errado, passo faltando) mantendo a intenção do teste.`;

// Provedores compatíveis com a API da OpenAI (chat/completions). Chave via LLM_API_KEY.
const PRESETS = {
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash' }, // plano grátis
  groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' }, // plano grátis
  ollama: { baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b' }, // local, sem chave
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
};

export function createLLM({ mock = false } = {}) {
  if (mock) return mockLLM();
  const provider = process.env.QAGENT_PROVIDER || 'anthropic';
  if (provider === 'anthropic') return anthropicLLM();
  const preset = PRESETS[provider];
  if (!preset) throw new Error(`Provedor desconhecido: ${provider}. Use: anthropic, ${Object.keys(PRESETS).join(', ')}`);
  return openaiCompatLLM({
    baseUrl: process.env.LLM_BASE_URL || preset.baseUrl,
    model: process.env.QAGENT_MODEL || preset.model,
    apiKey: process.env.LLM_API_KEY || 'ollama',
  });
}

function openaiCompatLLM({ baseUrl, model, apiKey }) {
  const system = `${SYSTEM}
Responda APENAS com JSON puro, sem markdown, no formato:
{"name": "...", "steps": [{"action": "goto|fill|click|expect_visible|expect_text|expect_url", "selector": "...", "value": "..."}]}`;
  return {
    name: `${model} (${baseUrl})`,
    async plan({ goal, snapshot, previous, failure }) {
      let content = `Objetivo: ${goal}\n\nSnapshot da página:\n${JSON.stringify(snapshot, null, 2)}`;
      if (previous) {
        content += `\n\nPlano anterior:\n${JSON.stringify(previous, null, 2)}\n\nFalhou no passo ${failure.failedStep}: ${failure.error}\nCorrija o plano.`;
      }
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: system }, { role: 'user', content }],
        }),
      });
      if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const text = (await res.json()).choices[0].message.content;
      return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    },
  };
}

function anthropicLLM() {
  const client = new Anthropic(); // usa ANTHROPIC_API_KEY
  return {
    name: MODEL,
    async plan({ goal, snapshot, previous, failure }) {
      let content = `Objetivo: ${goal}\n\nSnapshot da página:\n${JSON.stringify(snapshot, null, 2)}`;
      if (previous) {
        content += `\n\nPlano anterior:\n${JSON.stringify(previous, null, 2)}\n\nFalhou no passo ${failure.failedStep}: ${failure.error}\nCorrija o plano.`;
      }
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 2000,
        system: SYSTEM,
        tools: [PLAN_TOOL],
        tool_choice: { type: 'tool', name: PLAN_TOOL.name },
        messages: [{ role: 'user', content }],
      });
      return res.content.find((b) => b.type === 'tool_use').input;
    },
  };
}

// LLM simulado (offline): erra de propósito na 1ª tentativa para demonstrar a auto-correção
function mockLLM() {
  return {
    name: 'mock',
    async plan({ goal, snapshot, previous }) {
      const find = (pred) => snapshot.elements.find(pred)?.selector;
      const email = find((e) => e.type === 'email');
      const pass = find((e) => e.type === 'password');
      const submit = previous ? find((e) => e.tag === 'button') : '#btn-login'; // seletor inventado
      const valid = !/inv[aá]lid/i.test(goal) || /v[aá]lid/i.test(goal);
      return {
        name: goal.slice(0, 60),
        steps: [
          { action: 'goto', value: snapshot.url },
          { action: 'fill', selector: email, value: valid ? 'qa@teste.com' : 'x@y.com' },
          { action: 'fill', selector: pass, value: valid ? '123456' : 'errada' },
          { action: 'click', selector: submit },
          { action: 'expect_text', value: valid ? 'Login realizado com sucesso' : 'Credenciais inválidas' },
        ],
      };
    },
  };
}
