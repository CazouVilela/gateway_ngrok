# Gateway Padronizado Ngrok

Gateway simples e moderno para roteamento de tráfego do ngrok para aplicações locais.

## 🎯 Características

- ✅ Configuração centralizada em JSON
- ✅ Validação opcional de IP por aplicação
- ✅ Suporte a WebSocket
- ✅ Path rewriting automático
- ✅ Redirect automático de trailing slash (301)
- ✅ Suporte a build estático + proxy (static-proxy)
- ✅ Fácil adicionar novas aplicações
- ✅ Dashboard web de monitoramento
- ✅ Logs detalhados

## 📁 Estrutura

```
gateway_ngrok/
├── gateway.js              # Gateway principal
├── config.json             # Configuração de aplicações
├── authorized_ips.json     # IPs autorizados
├── package.json            # Dependências NPM
├── memory.md               # Documentação técnica
└── README.md               # Este arquivo
```

## 🚀 Uso

### Iniciar gateway:
```bash
npm start
```

### Modo desenvolvimento (com auto-reload):
```bash
npm run dev
```

### Como serviço systemd:
```bash
sudo systemctl start gateway-ngrok
sudo systemctl status gateway-ngrok
sudo journalctl -u gateway-ngrok -f
```

## ⚙️ Configuração

### Adicionar nova aplicação em `config.json`:

**Proxy reverso simples:**
```json
{
  "name": "Nome da App",
  "path": "/caminho",
  "target": "http://localhost:PORTA",
  "pathRewrite": true,
  "ipProtection": false,
  "websocket": true
}
```

**Static + Proxy (para React apps com API):**
```json
{
  "name": "App React",
  "path": "/app",
  "type": "static-proxy",
  "staticPath": "/caminho/para/build",
  "target": "http://localhost:PORTA_API",
  "apiPath": "/app-api",
  "ipProtection": true
}
```

**Campos:**
- `name`: Nome da aplicação (para logs)
- `path`: Caminho da URL (ex: `/metabase`)
- `type`: Tipo de proxy (`proxy` ou `static-proxy`)
- `target`: URL da aplicação local (backend)
- `staticPath`: Caminho para build estático (apenas para `static-proxy`)
- `apiPath`: Path da API (apenas para `static-proxy`)
- `pathRewrite`: Remover prefixo antes de enviar para app? (true/false)
- `ipProtection`: Validar IP quando via ngrok? (true/false)
- `websocket`: Suportar WebSocket? (true/false)

### Adicionar IP autorizado em `authorized_ips.json`:

```json
{
  "ips": [
    "185.253.70.62",
    "2804:16d8:dc8b:100:8e37:74ed:a929:6d19",
    "NOVO_IP_AQUI"
  ]
}
```

Após alterar configurações, reinicie o gateway:
```bash
sudo systemctl restart gateway-ngrok
```

## 📊 Endpoints Especiais

- **Dashboard**: `http://localhost:9000/dashboard`
- **Health Check**: `http://localhost:9000/health`

## 🔍 Monitoramento

### Ver logs em tempo real:
```bash
sudo journalctl -u gateway-ngrok -f
```

### Ver logs filtrados:
```bash
# Logs de uma aplicação específica
sudo journalctl -u gateway-ngrok -f | grep Metabase

# Logs de bloqueios
cat blocked_access.log
```

## 🔒 Segurança

### Acesso Local:
- **Sem validação de IP** (tráfego de localhost)
- Todas as aplicações acessíveis

### Acesso via Ngrok:
- **Com validação de IP** (se `ipProtection: true`)
- IPs não autorizados veem: "Acesso Negado"
- Bloqueios registrados em `blocked_access.log`

## 🧪 Testes

### Testar localmente:
```bash
curl http://localhost:9000/health
curl http://localhost:9000/metabase
```

### Testar via navegador:
```
http://localhost:9000/dashboard
http://localhost:9000/metabase
```

### Testar via ngrok:
```
https://sistemas.ngrok.io/metabase
```

## 📦 Aplicações Configuradas

| Aplicação | Path | Porta | Tipo | IP Protection |
|-----------|------|-------|------|---------------|
| Metabase | `/metabase` | 3000 | Proxy | ❌ Não |
| Airbyte | `/` | 8000 | Proxy | ✅ Sim |
| Grafana | `/grafana` | 3002 | Proxy | ✅ Sim |
| **Épica** | `/epica` + `/epica-api` | 5001 (API) | **Static + Proxy** | ✅ Sim |
| IDE | `/IDE` | 3780 | Proxy | ✅ Sim |
| RPO API | `/rpo-api` | 6000 | Proxy | ❌ Não |

**Nota sobre Épica**:
- Frontend servido como build estático em `/epica`
- Backend proxied em `/epica-api` (porta 5001)
- Redirect automático de `/epica` para `/epica/` (trailing slash)

## 🛠️ Desenvolvimento

### Dependências:
- Node.js 18+
- Express.js
- http-proxy-middleware

### Instalar dependências:
```bash
npm install
```

### Estrutura do código:
- Middleware de logging
- Middleware de validação de IP
- Criação de proxies por aplicação
- Ordenação de rotas (específicas primeiro)
- Health check e dashboard

## 📝 Logs

### Formato dos logs:
```
[2025-11-02T13:00:00.000Z] GET /metabase
  ✓ Local access to Metabase
  → Proxy: Metabase | GET /metabase → http://localhost:3000
```

### Com bloqueio de IP:
```
[2025-11-02T13:00:00.000Z] GET /IDE
  🔍 Ngrok access to IDE from IP: 1.2.3.4
  ❌ IP BLOCKED
```

## 🔄 Migração

Para migrar do gateway antigo para este:
```bash
/tmp/migrar_para_novo_gateway.sh
```

## 📚 Documentação Completa

Ver `memory.md` para documentação técnica detalhada e histórico.

---

**Porta**: 9000
**Versão**: 1.0.0
**Data**: 2025-11-02
