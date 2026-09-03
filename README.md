# Cofre — Controle Financeiro Pessoal

A web app for tracking personal finances, with transaction management, monthly views, forecasts, and investment tracking.

## Funcionalidades

- **Lançamentos**: Adicionar, visualizar e remover receitas e despesas por categoria
- **Mês**: Ver saldo, receitas, gastos e breakdown por categoria com barras
- **Previsão**: Média de meses passados para estimar sobra e sugestão de investimento
- **Investir**: Cadastro de ativos (crypto/ações) para ver patrimônio e performance
- **Persistência**: Dados salvos no localStorage ou sincronizados com Google Sheets

## Como usar

1. Abra `index.html` em um navegador
2. Se quiser sincronizar com uma planilha Google, configure o `SHEETS_API_URL` em `config.js` (via Netlify builds ou manualmente)
3. Comece a lançar transações na aba "Lançar"

## Estrutura

- `index.html` — Interface e forms
- `app.js` — Lógica de negócio, store, renderização
- `styles.css` — Estilos visual
- `AppScript_code.gs` — Código para colar no Apps Script da sua planilha (para backend)
- `netlify.toml` — Configuração de build para injetar a variável de ambiente `SHEETS_API_URL`
- `config.js` — Gerado pelo Netlify, contém a URL da API (opcional)

## Desenvolvimento

Os dados são armazenados por `key` com um `USER_ID` fixo (padrão: `"meu-cofre-pessoal"`). Mude esse valor no `app.js` se quiser um identificador exclusivo.
