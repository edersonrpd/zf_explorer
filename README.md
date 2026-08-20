# ZF API Explorer

Aplicação **Vite + React + TypeScript** para consultar as ofertas da API
**ZF / Pro-Parts** (`https://api.pro-parts.com/retailer/v1`), nos mesmos moldes do
`amz-api-explorer`. Pronta para publicar na Vercel.

![tela](https://img.shields.io/badge/stack-Vite%20%2B%20React%2019%20%2B%20TS-1f7ae0)

## O que ela faz

| Aba | Endpoint | Recursos |
| --- | --- | --- |
| **Oferta Única** | `GET /offers/:productOfferReference` | consulta uma ou **várias** referências de uma vez (cola da planilha, separadas por vírgula ou quebra de linha), tabela-resumo com status por referência, detalhe completo da oferta, export XLSX |
| **Pedidos** | `GET /orders` + `GET /orders/:merchantOrderReference` | filtro por período e estado, paginação ou download do período inteiro, detalhe com itens/entregas/cliente aberto na própria linha, export XLSX (abas Pedidos + Itens) e CSV |
| **Buscar Ofertas** | `GET /offers` | filtros por `productOfferReference`, `merchantSku`, `brand`, `partNumber` e `isActive`, paginação `page[offset]` / `page[limit]`, ordenação por coluna, export XLSX |
| **Catálogo Completo** | `GET /offers` (varredura) | baixa **todas** as ofertas da conta página a página, com pausa configurável entre chamadas, pausar/retomar/parar, progresso ao vivo e export CSV/XLSX — inclusive do parcial |

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
  components/     OfferDetail, OffersTable, JsonDrawer, CatalogPanel,
                  OfferFiltersFields
  hooks/          useCatalogSync — orquestra a varredura (pausar/retomar/parar)
  lib/crawlOffers.ts  varredura paginada do catálogo, com backoff e dedupe
  services/       zfService — chama o proxy e traduz os status HTTP da ZF
  lib/            utils (formatação BRL/datas) e export XLSX
  types.ts        contrato da oferta
```

## Baixando o catálogo inteiro

A aba **Catálogo Completo** existe para contas grandes (milhares de ofertas).
Ela percorre `GET /offers` em sequência, acumulando o resultado, e foi desenhada
para **não sobrecarregar a API**:

- **Uma chamada por vez**, nunca em paralelo, com **pausa configurável** entre
  páginas (padrão 400 ms). Com 6 mil ofertas e 200 por página, são ~30 chamadas.
- **Backoff exponencial** em 429 e 5xx, respeitando o header `Retry-After` da ZF
  quando ele vem. Erros definitivos (401, 403, 400) abortam na hora, em vez de
  insistir à toa.
- **Pausar / retomar / parar** a qualquer momento. O que já foi baixado continua
  disponível para exportar — parar não joga fora o progresso.
- A tabela mostra **50 linhas por vez**, com busca e ordenação locais sobre o
  conjunto inteiro (sem gerar novas chamadas). Jogar 6 mil linhas no DOM
  travaria a aba.

### Três armadilhas da paginação da ZF

A API pagina por offset/limit e devolve um **array puro** — sem total de
registros e sem cursor. Isso obriga a cuidados que não são óbvios, e todos estão
cobertos em `src/lib/crawlOffers.ts`:

1. **O offset avança pelo número de itens realmente recebidos**, não pelo
   `pageSize` pedido. Se a ZF tiver um teto próprio de página (pedimos 200 e ela
   devolve 50), avançar pelo valor pedido pularia 150 ofertas a cada volta — o
   download sairia com buracos silenciosos.
2. **A parada é na página vazia**, não em "página menor que o limite". Pelo mesmo
   motivo: uma API que limita a página devolveria sempre menos que o pedido, e a
   varredura terminaria logo na primeira.
3. **Dedupe por `productOfferReference`.** Se a API ignorar o offset, as mesmas
   ofertas voltam para sempre. Uma página inteira sem nenhuma referência nova
   encerra a varredura com o aviso "sem-novidade".

Há ainda um teto de páginas configurável (padrão 500) como rede de segurança.

### Registros que a ZF não consegue entregar

O catálogo contém ofertas que o servidor da ZF não consegue serializar. Elas
respondem **HTTP 500 permanente**, sempre com a mesma mensagem:

```
Property "brand" of transfer `...MerchantProductOfferPayloadTransfer` is null.
```

Não adianta esperar — o registro está quebrado no banco deles. E abortar ali
perderia todo o catálogo depois do registro ruim. A varredura então **degrada e
segue**, em espírito de slow-start:

1. Página falhou de forma persistente → **corta o tamanho da página pela metade**
   e tenta de novo no mesmo offset. Repete até chegar a 1.
2. Falhou pedindo **um único registro**, duas vezes → é ele o corrompido. Fica
   registrado e é **pulado**, e a varredura continua.
3. A cada sucesso o tamanho **dobra de volta** até o valor original, então o
   crawler anda devagar só na vizinhança do registro ruim.

Custo medido: **~27 requisições e ~3 segundos por registro corrompido**,
independente do tamanho do catálogo. Um registro quebrado custa isso em vez de
custar todo o resto do download.

No fim, a interface lista as posições que falharam, o motivo real extraído do
corpo da resposta e o `x-correlation-id` de cada uma — com um botão para copiar
tudo e mandar ao suporte da ZF, que é quem pode corrigir o cadastro.

**Salvaguarda contra falso "completo".** Se 10 registros seguidos falharem, isso
não é corrupção pontual — é a API fora do ar. Nesse caso a varredura **aborta com
erro** em vez de continuar pulando, porque uma exportação incompleta apresentada
como completa é o pior resultado possível: silenciosamente errada.

## Notas sobre a API

- `quantity` e `netPrice` chegam como **string** (`"50"`, `"1000.00"`) — a
  aplicação converte para número na exportação para que o Excel consiga somar.
- `validFrom` / `validTo` vêm no formato `2020-03-15 00:00:00`, sem timezone.
- `GET /offers` devolve um **array puro**, sem envelope nem total de registros.
  Por isso a paginação é por offset/limit e o botão "próxima página" é desligado
  quando a página volta com menos itens que o `limit`.
- Part numbers têm espaços (`0 280 156 096`); a querystring usa `%20` em vez de
  `+` porque nem todo gateway trata `+` como espaço.
- O CSV usa `;` como separador e **vírgula decimal**, que é o que o Excel em
  pt-BR espera — com ponto, `1000.00` seria lido como texto ou como 100000. O
  XLSX mantém os valores numéricos de verdade.
- O payload enviado ao proxy vai hex-encodado. Isso **não é criptografia** — é só
  para o corpo não parecer "credencial em texto puro" para WAFs no caminho, que
  respondem HTML e quebram o parse do cliente. Mesma técnica do `amz-api-explorer`.


## Pedidos

### A listagem não traz os itens

`GET /orders` devolve uma versão enxuta do pedido: **sem `items`, sem
`billingAddress` e sem `settlementDate`**, e com os `shipments` sem endereço.
Ver os itens exige `GET /orders/:merchantOrderReference`, uma chamada por
pedido.

Por isso o detalhe é carregado sob demanda, ao abrir a linha, e fica em cache:
reabrir um pedido já visto não gera tráfego novo. O botão "Carregar itens de
todos" busca os detalhes que faltam em sequência (não em paralelo, para não
tomar 429), e a partir daí a aba "Itens" do XLSX e o "CSV itens" saem completos.

### Datas são UTC — e isso não é detalhe

A documentação diz que `createdAt`, `updatedAt` e `settlementDate` vêm em UTC,
no formato `2024-04-01 23:59:59`. Duas armadilhas:

**Ao exibir.** `new Date("2024-04-01T23:59:59")` interpreta a string como
horário **local**, não UTC — é o que a especificação manda para data-hora sem
offset. No Brasil isso mostraria todo pedido 3 horas adiantado, e um pedido do
fim do dia apareceria no dia seguinte. `parseUtcDate()` acrescenta o `Z`
explicitamente.

**Ao filtrar.** O `<input type="date">` devolve a data do calendário local do
usuário; a API espera limites em UTC. Filtrar "01/04 a 30/04" sem converter
perderia os pedidos feitos depois das 21h do dia 30, que em UTC já estão em
maio. `localDateToUtcParam()` converte `2024-04-30` (fim do dia, UTC-3) em
`2024-05-01 02:59:59`.

### filter[proPartsOrders.state] é multivalorado

É o único filtro repetível da API — vários estados se especificam repetindo a
chave. O proxy usa `append`, não `set`: um `set` sobrescreveria e só o último
estado seria enviado, filtrando errado **sem dar nenhum erro**.

A ZF não publica a lista fechada de estados. A tela oferece os documentados
(`new`, `canceled`, `waiting for documents`) e acrescenta os que aparecerem nos
pedidos carregados.

### Reaproveitamento

"Baixar todos do período" usa o mesmo crawler do catálogo de ofertas — que foi
generalizado para qualquer entidade (`crawlAll<T>`). Pedidos ganham de graça o
avanço de offset por itens recebidos, a deduplicação e a recuperação de
registros corrompidos descrita acima.