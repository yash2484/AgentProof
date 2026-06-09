# AgentProof

**Framework-agnostic eval, observability, and security harness for multi-agent systems.**

AgentProof traces every LLM call, tool invocation, and agent handoff across your
multi-agent system, then runs configurable evaluations (deterministic, LLM-as-judge,
and security red-teams) to catch quality regressions and adversarial vulnerabilities
before they reach production.

## Status: Active Development

Core features being built:
- [ ] Trace collector SDK (LangGraph + AutoGen adapters)
- [ ] Eval engine (deterministic + LLM-as-judge via Claude)
- [ ] Security eval module (prompt injection, tool misuse, data exfiltration)
- [ ] Regression detector (Welch t-test on rolling windows)
- [ ] CI/CD GitHub Action (blocks PRs on eval regressions)
- [ ] Dashboard (trace waterfall, eval timeseries, security reports)

## Quick Start

```bash
cp .env.example .env  # Fill in your API keys
docker compose up -d
# Server: http://localhost:8000
# Dashboard: http://localhost:5173
```

## License

MIT