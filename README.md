# ZF API Explorer

Aplicação **Vite + React + TypeScript** para consultar as ofertas da API
**ZF / Pro-Parts** (`https://api.pro-parts.com/retailer/v1`), nos mesmos moldes do
`amz-api-explorer`. Pronta para publicar na Vercel.

![tela](https://img.shields.io/badge/stack-Vite%20%2B%20React%2019%20%2B%20TS-1f7ae0)

## O que ela faz

| Aba | Endpoint | Recursos |
| --- | --- | --- |
| **Oferta Única** | `GET /offers/:productOfferReference` | consulta uma ou **várias** referências de uma vez (cola da planilha, separadas por vírgula ou quebra de linha), tabela-resumo com status por referência, detalhe completo da oferta, export XLSX |
| **Buscar Ofertas** | `GET /offers` | filtros por `productOfferReference`, `merchantSku`, `brand`, `partNumber` e `isActive`, paginação `page[offset]` / `page[limit]`, ordenação por coluna, export XLSX |

Em ambas as abas há o drawer **Ver JSON** com a resposta crua da API e o
`x-correlation-id` da requisição — é o identificador que o suporte da ZF pede
para rastrear uma chamada ponta a ponta.

A tela de detalhe destaca uma armadilha comum: uma oferta pode estar
`isActive: true` e ainda assim estar **fora de vigência** por causa de
`validFrom` / `validTo`. O badge mostra `EM VIGÊNCIA`, `VIGÊNCIA FUTURA` ou
`VIGÊNCIA EXPIRADA`.

## Por que existe um proxy (`/zf-proxy`)

A API da ZF exige `client_id` e `client_secret` como **headers** de cada
requisição. Chamar direto do navegador não funciona por dois motivos:

1. **CORS** — `api.pro-parts.com` não libera a origem da aplicação.
2. **Segurança** — o `client_secret` ficaria visível em qualquer aba de DevTools
   de quem abrisse a página.

Então o navegador fala com `/zf-proxy` (mesma origem) e o servidor fala com a ZF:

```
navegador  ──POST /zf-proxy──▶  função serverless  ──GET /offers──▶  api.pro-parts.com
                                (headers client_id / client_secret)
```

Tudo vive em **`api/zf-proxy.ts`**, que é deliberadamente **autocontido** — sem
nenhum import relativo. O `server.ts` (desenvolvimento) importa `handleProxyRequest`
desse mesmo arquivo, então local e produção tratam os mesmos erros do mesmo jeito.

> ⚠️ **Não quebre isso.** O `package.json` usa `"type": "module"`, então a Vercel
> executa a função como ESM, onde todo import relativo precisa de **extensão
> explícita** (`"./x.js"`, não `"./x"`). Um import relativo sem extensão aqui
> derruba a função inteira no carregamento, com `FUNCTION_INVOCATION_FAILED` /
> `500 INTERNAL_SERVER_ERROR` antes mesmo do handler rodar — e o erro não aparece
> em `npm run dev`, porque o tsx resolve extensões sozinho.

## Credenciais

Há dois caminhos, e o segundo tem prioridade:

1. **Pela interface** — o usuário digita `CLIENT_ID` / `CLIENT_SECRET` em
   "Editar credenciais". Ficam salvos no `localStorage` do navegador dele e são
   enviados apenas para o proxy da própria aplicação.
2. **Por variável de ambiente** (recomendado se a URL for compartilhada) —
   defina `ZF_CLIENT_ID` e `ZF_CLIENT_SECRET` em *Project Settings → Environment
   Variables* na Vercel. Quando presentes, o proxy usa essas e ignora o que veio
   do navegador — ninguém precisa (nem consegue) ver o secret.

Variáveis suportadas pelo servidor:

| Variável | Padrão | Para que serve |
| --- | --- | --- |
| `ZF_CLIENT_ID` | — | Client-ID da aplicação ZF |
| `ZF_CLIENT_SECRET` | — | Client-Secret da aplicação ZF |
| `ZF_API_BASE_URL` | `https://api.pro-parts.com/retailer/v1` | trocar para um ambiente de homologação |

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # opcional: fixa as credenciais no servidor
npm run dev                  # http://localhost:3000
```

`npm run dev` sobe o Express com o Vite em middleware mode, servindo o front e o
endpoint `/zf-proxy` na mesma porta — igual ao comportamento em produção.

Outros scripts:

```bash
npm run lint     # tsc --noEmit
npm run build    # bundle de produção em dist/
npm run preview  # serve o build
```

## Deploy na Vercel

O repositório já está configurado: basta importar o projeto na Vercel.

- `vercel.json` roteia `/zf-proxy` para a função em `api/zf-proxy.ts` e manda
  todo o resto para o `index.html` (SPA).
- Build command: `npm run build` · Output directory: `dist` (detectado
  automaticamente pelo preset do Vite).
- Defina `ZF_CLIENT_ID` / `ZF_CLIENT_SECRET` nas *Environment Variables* se não
  quiser que as credenciais sejam digitadas na interface.

## Estrutura

```
api/
  zf-proxy.ts     função serverless da Vercel + toda a lógica do proxy
                  (monta URL, headers, trata erros). Autocontido de propósito.
server.ts         servidor de desenvolvimento (Vite + /zf-proxy), reaproveita
                  handleProxyRequest de api/zf-proxy.ts
src/
  App.tsx         abas, barra de credenciais, orquestração das consultas
  components/     OfferDetail, OffersTable, JsonDrawer
  services/       zfService — chama o proxy e traduz os status HTTP da ZF
  lib/            utils (formatação BRL/datas) e export XLSX
  types.ts        contrato da oferta
```

## Notas sobre a API

- `quantity` e `netPrice` chegam como **string** (`"50"`, `"1000.00"`) — a
  aplicação converte para número na exportação para que o Excel consiga somar.
- `validFrom` / `validTo` vêm no formato `2020-03-15 00:00:00`, sem timezone.
- `GET /offers` devolve um **array puro**, sem envelope nem total de registros.
  Por isso a paginação é por offset/limit e o botão "próxima página" é desligado
  quando a página volta com menos itens que o `limit`.
- Part numbers têm espaços (`0 280 156 096`); a querystring usa `%20` em vez de
  `+` porque nem todo gateway trata `+` como espaço.
- O payload enviado ao proxy vai hex-encodado. Isso **não é criptografia** — é só
  para o corpo não parecer "credencial em texto puro" para WAFs no caminho, que
  respondem HTML e quebram o parse do cliente. Mesma técnica do `amz-api-explorer`.
