# QAgent AI (protótipo)

Agente que recebe um objetivo de teste em linguagem natural, inspeciona a página, gera um plano de teste E2E, executa no Playwright e **se auto-corrige** quando falha. Ao passar, exporta um `.spec.ts` do Playwright.

```
objetivo + URL -> snapshot da página -> LLM gera plano (JSON) -> executa -> falhou? -> LLM corrige (até 3x)
                                                                     \-> passou -> generated/agent.spec.ts
```

## Uso

```bash
npm install && npx playwright install chromium

npm run demo        # app de exemplo + LLM simulado (offline, sem API key)
npm run demo:llm    # app de exemplo + Claude (requer ANTHROPIC_API_KEY)

# em qualquer site
node src/agent.mjs --url https://meusite.com --goal "Buscar por 'camisa' e ver resultados" [--headed] [--mock]
```

Modelo configurável via `QAGENT_MODEL` (padrão `claude-sonnet-5-5`).

### Outros provedores (sem Claude)

Defina `QAGENT_PROVIDER` (`gemini`, `groq`, `ollama`, `openai`) e `LLM_API_KEY`:

```powershell
$env:QAGENT_PROVIDER = "gemini"; $env:LLM_API_KEY = "chave"   # chave grátis: aistudio.google.com/apikey
$env:QAGENT_PROVIDER = "ollama"                                # local, sem chave (ollama pull qwen2.5:7b)
```

`QAGENT_MODEL` e `LLM_BASE_URL` sobrescrevem o modelo e o endereço padrão.

## Estrutura

- `src/agent.mjs` – CLI e loop gerar -> executar -> corrigir; gera relatório e spec
- `src/snapshot.mjs` – resumo dos elementos interativos da página
- `src/llm.mjs` – provedor Claude (tool use com schema) e mock offline
- `src/executor.mjs` – executor Playwright dos passos (`goto`, `fill`, `click`, `expect_*`)
- `demo/app.html` – app de login para testar o agente

## Limitações / próximos passos

- Snapshot de uma única página (sem navegação multi-tela nem iframes/shadow DOM)
- Sem login/fixtures reutilizáveis nem massa de dados
- Auto-correção só por mensagem de erro; poderia usar o screenshot (`reports/falha-N.png`) como entrada visual
- Spec gerado usa a URL da execução; parametrizar com `baseURL`
# QAgente_AI
