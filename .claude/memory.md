# GATEWAY NGROK - Memória do Projeto

<!-- CHAPTER: 0 Configurações da IDE -->

## 🔧 Configurações da IDE

> **⚠️ LEITURA OBRIGATÓRIA**: Este projeto utiliza a IDE Customizada.
>
> **Documentação essencial** (leia sempre ao carregar o projeto):
> - [RELACIONAMENTO_COM_IDE.md](.claude/RELACIONAMENTO_COM_IDE.md) - **Como este projeto se relaciona com a IDE**
> - [TEMPLATE_PROJETO.md](.claude/TEMPLATE_PROJETO.md) - Template de organização de projetos
> - [GUIA_SISTEMA_PROJETOS.md](.claude/GUIA_SISTEMA_PROJETOS.md) - Sistema de gerenciamento de projetos

### Comandos Slash Disponíveis

- `/iniciar` - Gerenciar projetos (listar, ativar, criar novo)
- `/subir` - Git commit + push automatizado
- `/subir_estavel` - Git commit + push + tag de versão estável
- `/tryGPT "prompt"` - Consultar ChatGPT manualmente
- `/implantacao_automatica` - Deploy com comparação Claude vs ChatGPT

### Funcionalidades da IDE

Este projeto utiliza:
- **Terminal virtual** integrado (xterm.js)
- **Explorador de arquivos** lateral com tree view
- **Sistema de planejamento** hierárquico (interface web)
- **Draft/Rascunho** automático por projeto
- **Memórias persistentes** com capítulos
- **Visualização de commits** git com tags
- **Integração ChatGPT** via Playwright


<!-- CHAPTER: 1 Objetivo -->

## Objetivo

Gateway padronizado e simples para rotear tráfego do ngrok para aplicações locais com validação opcional de IP.

---

<!-- CHAPTER: 2 Arquitetura Antiga (A SER REMOVIDA) -->

## Arquitetura Antiga (A SER REMOVIDA)

### Nginx na porta 9000
- **Arquivo**: `/etc/nginx/conf.d/sistemas-consolidado.conf`
- **Função**: Roteava tráfego para gateway na porta 8079 ou diretamente para aplicações
- **Cache**: `/var/cache/nginx/` (precisa ser limpo após mudanças)
- **Comando para limpar cache**: `sudo rm -rf /var/cache/nginx/* && sudo systemctl restart nginx`

### Gateway Node.js na porta 8079
- **Arquivo**: `/home/cazouvilela/airbyte-gateway/gateway_completo.js`
- **Serviço**: `airbyte-gateway.service`
- **Localização**: `/etc/systemd/system/airbyte-gateway.service`
- **IPs autorizados**: Hardcoded no arquivo + `/home/cazouvilela/airbyte-gateway/authorized_ips.txt`

### Serviços Systemd Existentes
1. **airbyte-gateway.service** - Gateway atual (porta 8079)
2. **ide-customizada.service** - IDE na porta 3780
3. **epica-frontend.service** - Épica frontend na porta 5000
4. **epica-backend.service** - Épica backend na porta 5001
5. **grafana-server.service** - Grafana na porta 3002
6. **ngrok-*.service** - Múltiplos serviços ngrok (descontinuados)

### Configurações Nginx Relacionadas
1. `/etc/nginx/conf.d/sistemas-consolidado.conf` - Config principal
2. `/etc/nginx/conf.d/airbyte-8443.conf` - Config Airbyte antiga
3. `/etc/nginx/conf.d/metabase.conf` - Config Metabase
4. `/etc/nginx/conf.d/advanced-optimizations.conf` - Otimizações

### Portas em Uso
- **3000**: Metabase
- **3002**: Grafana
- **3500**: API customizações Metabase
- **3780**: IDE
- **5000**: Épica Frontend
- **5001**: Épica Backend
- **6000**: RPO Hub API
- **8000**: Airbyte (Kubernetes/Helm)
- **8079**: Gateway atual (A SER SUBSTITUÍDO)
- **9000**: Nginx (A SER REMOVIDO/RECONFIGURADO)

---

<!-- CHAPTER: 3 Nova Arquitetura (A SER IMPLEMENTADA) -->

## Nova Arquitetura (A SER IMPLEMENTADA)

### Fluxo Simplificado
```
Internet
   ↓
ngrok (sistemas.ngrok.io)
   ↓
Gateway Node.js (porta única - TBD)
   ↓
Middleware de IP (opcional por aplicação)
   ↓
Aplicação Local (localhost:porta)
```

### Gateway Padronizado
- **Localização**: `/home/cazouvilela/projetos/gateway_ngrok/`
- **Arquivo principal**: `gateway.js`
- **Configuração**: `config.json`
- **IPs autorizados**: `authorized_ips.json`

### Aplicações Configuradas

#### Sem Proteção de IP
1. **Metabase**
   - Path: `/metabase`
   - Porta: `3000`
   - Local: Instalação sistema

2. **RPO Hub API**
   - Path: `/rpo-api`
   - Porta: `6000`
   - Local: `/home/cazouvilela/projetos/RPO_V4`
   - Obs: Já tem proteção por token

#### Com Proteção de IP
1. **Airbyte**
   - Path: `/` (raiz)
   - Porta: `8000`
   - Local: Kubernetes/Helm
   - IPs: 185.253.70.62, 2804:16d8:dc8b:100:8e37:74ed:a929:6d19

2. **Grafana**
   - Path: `/grafana`
   - Porta: `3002`
   - Local: Sistema (grafana-server)
   - IPs: 185.253.70.62, 2804:16d8:dc8b:100:8e37:74ed:a929:6d19

3. **Épica**
   - Path Frontend: `/epica`
   - Path Backend: `/epica-api`
   - Porta: `5001` (Backend)
   - Local: `/home/cazouvilela/projetos/epica`
   - IPs: 185.253.70.62, 2804:16d8:dc8b:100:8e37:74ed:a929:6d19
   - Tipo: **Static + Proxy** (frontend buildado + backend API)
   - Obs: Frontend servido como build estático, backend proxied para porta 5001

4. **IDE**
   - Path: `/IDE`
   - Porta: `3780`
   - Local: `/home/cazouvilela/projetos/IDE_customizada`
   - IPs: 185.253.70.62, 2804:16d8:dc8b:100:8e37:74ed:a929:6d19

### IPs Autorizados Iniciais
1. **IPv4**: `185.253.70.62`
2. **IPv6**: `2804:16d8:dc8b:100:8e37:74ed:a929:6d19`

---

<!-- CHAPTER: 4 Tarefas de Limpeza -->

## Tarefas de Limpeza

### 1. Parar Serviços Antigos
```bash
sudo systemctl stop airbyte-gateway
sudo systemctl disable airbyte-gateway
sudo systemctl stop nginx
```

### 2. Limpar Cache Nginx
```bash
sudo rm -rf /var/cache/nginx/*
```

### 3. Backup Configurações Antigas
```bash
sudo cp /etc/nginx/conf.d/sistemas-consolidado.conf /etc/nginx/conf.d/sistemas-consolidado.conf.old
```

### 4. Remover/Renomear Serviços Antigos
- Desabilitar ngrok-*.service
- Renomear airbyte-gateway.service

---

<!-- CHAPTER: 5 Princípios do Novo Gateway -->

## Princípios do Novo Gateway

1. **Simplicidade**: Configuração centralizada em JSON
2. **Padronização**: Todas as apps seguem o mesmo padrão
3. **Extensibilidade**: Fácil adicionar novas aplicações
4. **Clareza**: Código limpo e bem documentado
5. **Manutenibilidade**: Uma única fonte de verdade

---

<!-- CHAPTER: 6 Notas Importantes -->

## Notas Importantes

### Cache do Nginx
- O Nginx tem cache ativo em `/var/cache/nginx/`
- Sempre limpar cache após mudanças: `sudo rm -rf /var/cache/nginx/* && sudo systemctl restart nginx`
- O cache pode causar comportamento inconsistente se não limpo

### Acesso Local vs Ngrok
- **Local**: Sem validação de IP (localhost)
- **Ngrok**: Com validação de IP baseada em `x-forwarded-for`

### WebSocket Support
- Todas as apps precisam de suporte a WebSocket
- Headers necessários: `Upgrade`, `Connection: upgrade`

---

---

<!-- CHAPTER: 7 Customizações Necessárias por Aplicação -->

## Customizações Necessárias por Aplicação

### Princípio Geral
O gateway é padronizado, mas **algumas aplicações precisam saber em qual path estão rodando** para:
- Gerar redirects corretos
- Criar links internos corretos
- Funcionar em subpaths

**Divisão de Responsabilidades:**
- **Gateway** (`config.json`): Define ONDE rotear (`/grafana` → porta 3002)
- **Aplicação** (config próprio): Define SEU endereço base para redirects internos

---

### 1. Metabase (SEM customizações)

**Gateway** (`config.json`):
```json
{
  "name": "Metabase",
  "path": "/metabase",
  "target": "http://localhost:3000",
  "pathRewrite": true,        ← Remove /metabase antes de enviar
  "ipProtection": false,
  "websocket": true
}
```

**Metabase**: Nenhuma configuração necessária
- pathRewrite=true faz Metabase receber `/` ao invés de `/metabase/`
- Metabase não precisa saber que está em subpath

---

### 2. Grafana (PRECISA root_url + serve_from_sub_path)

**Gateway** (`config.json`):
```json
{
  "name": "Grafana",
  "path": "/grafana",
  "target": "http://localhost:3002",
  "pathRewrite": false,       ← Mantém /grafana
  "ipProtection": true,
  "websocket": true
}
```

**Grafana** (`/etc/grafana/grafana.ini`):
```ini
[server]
root_url = /grafana           ← NECESSÁRIO para gerar redirects corretos
serve_from_sub_path = true    ← NECESSÁRIO para aceitar /grafana no path
```

**Por quê ambos são necessários?**
- `pathRewrite=false`: Gateway envia `/grafana/...` completo para Grafana
- `root_url = /grafana`: Grafana sabe seu endereço e **gera** redirects como `/grafana/login`
- `serve_from_sub_path = true`: Grafana **aceita** requisições com `/grafana` no path
- **SEM root_url**: Grafana gera redirect `/login` (sem prefixo) → cai no Airbyte (raiz)
- **SEM serve_from_sub_path**: Grafana recebe `/grafana/login` mas retorna 404 (`handler=notfound`) → loop

**Configuração:**
```bash
# Script automático (recomendado)
sudo /tmp/ativar_serve_from_sub_path.sh

# Ou manual:
sudo nano /etc/grafana/grafana.ini
# Adicionar/modificar na seção [server]:
# root_url = /grafana
# serve_from_sub_path = true
sudo systemctl restart grafana-server
```

**Backups:**
- Backup criado automaticamente antes de cada mudança
- Localização: `/etc/grafana/grafana.ini.backup-TIMESTAMP`

**Referência:**
- Documentação Oficial: https://grafana.com/docs/grafana/latest/setup-grafana/configure-grafana/#serve_from_sub_path
- Script de configuração: `/tmp/ativar_serve_from_sub_path.sh`

---

### 3. Airbyte (LIMITAÇÃO TÉCNICA - Deve estar na raiz)

**Gateway** (`config.json`):
```json
{
  "name": "Airbyte",
  "path": "/",                ← OBRIGATÓRIO: Raiz (limitação do Airbyte)
  "target": "http://localhost:8000",
  "pathRewrite": false,
  "ipProtection": true,
  "websocket": true
}
```

**Airbyte**: Nenhuma configuração de subpath disponível
- **DEVE** rodar na raiz `/` por limitação técnica
- **NÃO possui** configuração equivalente ao `root_url` do Grafana
- Assets hardcoded desde raiz (`/assets/`, `/logo.png`)
- Kubernetes/Helm gerencia configurações (NodePort 8000 → 30000)

**Por quê na raiz?**
- Airbyte webapp **assume que está sempre na raiz `/`**
- Assets e rotas internas usam paths absolutos desde a raiz
- **Limitação conhecida** há 4 anos (Issues GitHub #8167, #48595)
- Workarounds com nginx rewrite são complexos e não confiáveis

**Tentativa de usar subpath:**
- ❌ Assets quebram: `/airbyte/` tenta buscar `/assets/` (sem prefixo)
- ❌ Rotas internas falham: API calls usam paths absolutos
- ❌ Frontend React não tem suporte a base path configurável

**Versão instalada:**
- Helm Chart: 1.9.1
- Airbyte: 2.0.1 (novembro 2024)

**Referências:**
- Issue #8167 (2021): "Could you please provide configurable base url?" - Fechada como low priority
- Issue #48595 (2024): Mesmo problema, **ainda aberta** em 2025
- Discussão: https://discuss.airbyte.io/t/setting-subpath-for-airbyte-url/9142

**Conclusão:** Não é escolha de arquitetura, é **limitação técnica do próprio Airbyte**. A aplicação não foi projetada para rodar em subpath.

---

### 4. IDE (FUNCIONA PERFEITAMENTE)

**Gateway** (`config.json`):
```json
{
  "name": "IDE",
  "path": "/IDE",
  "target": "http://localhost:3780",
  "pathRewrite": true,        ← Remove /IDE antes de enviar
  "ipProtection": true,
  "websocket": true
}
```

**IDE** (configurado corretamente):
- ✅ Proteção de IP removida do código (já no gateway)
- ✅ BASE_PATH detection implementado em `public/app.js`
  - Detecta via `window.location.pathname`
  - Se path começa com `/IDE/`, adiciona prefixo em todas as requisições
- ✅ WebSocket configurado corretamente com BASE_PATH
- ✅ Referências ao gateway antigo atualizadas
- ✅ Documentação README.md atualizada

**Funcionamento:**
- Frontend detecta `/IDE/` do browser
- Gateway recebe `/IDE/...` e envia `/...` para backend
- Express serve arquivos static da raiz
- WebSocket funciona corretamente
- Tanto localhost quanto ngrok funcionando

**Status**: ✅ Funcionando perfeitamente (localhost e ngrok)

---

### 5. Épica (TIPO ESPECIAL: Static + Proxy)

**Gateway** (`config.json`):
```json
{
  "name": "Épica",
  "path": "/epica",
  "type": "static-proxy",           ← Tipo especial
  "staticPath": "/home/cazouvilela/projetos/epica/frontend/build",
  "target": "http://localhost:5001",
  "apiPath": "/epica-api",
  "pathRewrite": true,
  "ipProtection": true,
  "websocket": false
}
```

**Como Funciona o Static + Proxy:**

1. **Frontend (Static)**:
   - Build React servido como arquivos estáticos em `/epica`
   - Buildado com `homepage: "/epica"` no package.json
   - Gateway serve diretamente do disco (não há servidor na porta 5000)
   - Path rewriting: `/epica/static/js/main.js` → serve arquivo do build

2. **Backend (Proxy)**:
   - API Node.js na porta 5001
   - Acessível via `/epica-api`
   - Roteamento normal de proxy reverso

3. **Trailing Slash Redirect**:
   - Gateway implementa redirect automático 301
   - `/epica` → `/epica/` (necessário para React Router)
   - React Router com `basename="/epica"` requer trailing slash

**Detecção Dinâmica de API URL** (`frontend/src/config/api.js`):
```javascript
const getApiUrl = () => {
  const hostname = window.location.hostname;
  const port = window.location.port;

  // Se está acessando via gateway (porta 9000)
  if (port === '9000') {
    return window.location.origin + '/epica-api';
  }

  // Se é ngrok
  if (hostname.includes('ngrok.io')) {
    return window.location.origin + '/epica-api';
  }

  return window.location.origin + '/api';
};
```

**OAuth Universal** (funciona em localhost e ngrok):
- Detecção automática de origem via HTTP headers
- Callback fixo no Google (ngrok)
- Redirect dinâmico ao usuário (localhost ou ngrok)
- Ver documentação completa em `/home/cazouvilela/projetos/epica/memory.md`

**Épica** (configurações):
- ✅ Frontend `.env`: Sem `REACT_APP_API_URL` (detecção automática)
- ✅ Backend `.env`: Callback ngrok fixo, frontend URL detectada dinamicamente
- ✅ React `package.json`: `"homepage": "/epica"`
- ✅ Build servido pelo gateway (sem servidor dedicado)

**Status**: ✅ Funcionando perfeitamente (localhost e ngrok)

---

### 6. RPO Hub API (SEM customizações)

**Gateway** (`config.json`):
```json
{
  "name": "RPO Hub API",
  "path": "/rpo-api",
  "target": "http://localhost:6000",
  "pathRewrite": true,
  "ipProtection": false,      ← Já tem proteção por token
  "websocket": false
}
```

**RPO API**: Nenhuma configuração necessária
- Já tem autenticação por token própria
- pathRewrite=true remove `/rpo-api` antes de enviar

---

<!-- CHAPTER: 8 Tabela Resumo de Customizações -->

## Tabela Resumo de Customizações

| Aplicação | Path | Tipo | pathRewrite | ipProtection | Customização App | Status |
|-----------|------|------|-------------|--------------|------------------|--------|
| **Metabase** | /metabase | Proxy | true | false | Nenhuma | ✅ Funciona |
| **Grafana** | /grafana | Proxy | false | true | root_url + serve_from_sub_path | ✅ Funciona |
| **Airbyte** | / (raiz) | Proxy | false | true | Nenhuma (limitação técnica) | ✅ Funciona |
| **Épica** | /epica + /epica-api | Static+Proxy | true | true | OAuth Universal + API detection | ✅ Funciona |
| **IDE** | /IDE | Proxy | true | true | BASE_PATH detection + WebSocket | ✅ Funciona |
| **RPO API** | /rpo-api | Proxy | true | false | Nenhuma | ⏳ Testar |

**Legenda:**
- ✅ Funciona: Testado e funcionando corretamente
- ⏳ Testar: Configurado mas pendente teste
- ⏳ Revisar: Precisa revisão de código legado

---

<!-- CHAPTER: 9 Histórico -->

## Histórico

- **2025-11-03 22:10**: Corrigido suporte a WebSocket via ngrok
  - Adicionado handler de 'upgrade' event no servidor HTTP
  - WebSocket agora funciona corretamente via ngrok com validação de IP
  - IDE testada e funcionando perfeitamente em localhost e ngrok
- **2025-11-03 21:50**: IDE migrada para novo gateway com sucesso
  - Proteção de IP removida do código e delegada ao gateway
  - BASE_PATH detection já estava implementado
  - WebSocket funcionando corretamente via gateway
  - Documentação README.md atualizada
  - Funciona perfeitamente em localhost e ngrok
- **2025-11-03 20:00**: Épica OAuth Universal implementado e funcionando perfeitamente
  - Detecção automática de origem (localhost ou ngrok)
  - Callback fixo Google + redirect dinâmico ao usuário
  - Solução para TokenError: Bad Request
  - Frontend .env sem REACT_APP_API_URL (detecção automática)
- **2025-11-03 18:00**: Implementado tipo "static-proxy" para aplicações React
  - Frontend servido como build estático
  - Backend proxied separadamente
  - Épica migrado para static-proxy (eliminou servidor porta 5000)
- **2025-11-03 17:30**: Implementado redirect automático de trailing slash (301)
  - Necessário para React Router com basename
  - `/epica` → `/epica/` automático
- **2025-11-02 17:40**: Airbyte confirmado funcionando (limitação técnica documentada - deve estar na raiz)
- **2025-11-02 17:35**: Grafana corrigido com root_url + serve_from_sub_path = true
- **2025-11-02 14:00**: Descoberta limitação do Grafana: serve_from_sub_path necessário
- **2025-11-02 14:00**: Metabase funcionando sem customizações
- **2025-11-02 13:57**: Gateway migrado e ativo na porta 9000
- **2025-11-02 13:00**: Criação do projeto gateway_ngrok para reimplementação limpa
- **Anterior**: Gateway complexo com nginx + node.js em múltiplas portas

---

<!-- CHAPTER: 10 Organização de Documentação -->

## Organização de Documentação

**IMPORTANTE**: Toda a documentação deste projeto deve ser armazenada na pasta `/documentacao`.

- **README.md** (raiz do projeto): Contém apenas informações gerais e orientação para `/documentacao`
- **memory.md** (`.claude/`): Este arquivo - para carregamento rápido de contexto do Claude
- **Demais documentos**: Devem estar em `/documentacao` (arquitetura, guias, especificações, etc.)

