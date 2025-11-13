# Gateway Local - Cloudflare Tunnel

Gateway de roteamento hostname-based com validação de IP para serviços locais via Cloudflare Tunnel.

## 🎯 Características

- ✅ Roteamento por hostname (subdomínio)
- ✅ Validação de IP usando headers do Cloudflare
- ✅ Suporte completo a WebSocket
- ✅ Fix automático de CSRF para Grafana
- ✅ Proteção de IP configurável por serviço
- ✅ Dashboard web de monitoramento
- ✅ Logs detalhados com rastreamento completo

## 🏗️ Arquitetura

```
Browser → Cloudflare Tunnel → Gateway (porta 9000) → Serviços locais
```

O gateway atua como middleware entre o Cloudflare Tunnel e os serviços locais, fornecendo:
- **Validação de IP**: Usando header `cf-connecting-ip` do Cloudflare
- **Roteamento**: Por hostname/subdomínio para cada serviço
- **CSRF handling**: Reescrita automática de headers Origin/Referer para Grafana

## 📁 Estrutura

```
gateway_local/
├── gateway.js              # Gateway hostname-based
├── config.json             # Configuração de serviços
├── authorized_ips.json     # IPs autorizados
├── package.json            # Dependências NPM
├── blocked_access.log      # Log de acessos bloqueados
└── README.md               # Este arquivo
```

## 🚀 Uso

### Como serviço systemd:
```bash
sudo systemctl start gateway-cloudflare
sudo systemctl status gateway-cloudflare
sudo journalctl -u gateway-cloudflare -f
```

### Reiniciar após alterações:
```bash
sudo systemctl restart gateway-cloudflare
```

## ⚙️ Configuração

### Estrutura do `HOSTNAME_MAP` (gateway.js):

```javascript
const HOSTNAME_MAP = {
  'servico.sistema.cloud': {
    name: 'Nome do Serviço',
    target: 'http://localhost:PORTA',
    ipProtection: true,  // Validar IP?
    websocket: true      // Suportar WebSocket?
  }
};
```

### Serviços Configurados:

| Serviço | Hostname | Porta | IP Protection | WebSocket |
|---------|----------|-------|---------------|-----------|
| Metabase | `metabase.sistema.cloud` | 3000 | ❌ Não | ✅ Sim |
| Airbyte | `airbyte.sistema.cloud` | 8000 | ✅ Sim | ✅ Sim |
| Grafana | `grafana.sistema.cloud` | 3003 | ✅ Sim | ✅ Sim |
| Épica Frontend | `epica.sistema.cloud` | 5000 | ✅ Sim | ✅ Sim |
| Épica Backend | `epica-api.sistema.cloud` | 5001 | ✅ Sim | ❌ Não |
| IDE Customizada | `ide.sistema.cloud` | 3780 | ✅ Sim | ✅ Sim |

### IPs Autorizados (`authorized_ips.json`):

```json
{
  "ips": [
    "185.253.70.62",
    "2804:16d8:dc8b:100:8e37:74ed:a929:6d19"
  ]
}
```

## 🔧 Fix de CSRF do Grafana

O gateway reescreve automaticamente os headers `Origin` e `Referer` para requisições ao Grafana:

```
Origin: https://grafana.sistema.cloud → http://localhost:3003
Referer: https://grafana.sistema.cloud/d/... → http://localhost:3003/d/...
```

Isso permite que o Grafana aceite requisições POST através do proxy sem bloqueios de CSRF.

## 📊 Endpoints Especiais

- **Dashboard**: `http://localhost:9000/dashboard`
- **Health Check**: `http://localhost:9000/health`

## 🔍 Monitoramento

### Ver logs em tempo real:
```bash
sudo journalctl -u gateway-cloudflare -f
```

### Exemplo de logs:
```
[2025-11-13T00:21:56.242Z] POST grafana.sistema.cloud/api/ds/query
  → Serviço identificado: Grafana
  🔍 Grafana: Validando IP 185.253.70.62
  ✅ Grafana: IP autorizado
  🔄 Executando proxy para: Grafana
  🔧 Reescrevendo Origin: https://grafana.sistema.cloud → http://localhost:3003
  → Proxy: Grafana | POST /api/ds/query → http://localhost:3003/api/ds/query
  ← Response: Grafana | 200 OK
```

### Ver bloqueios de IP:
```bash
cat blocked_access.log
```

## 🔒 Segurança

### Validação de IP

**Acesso Local** (sem Cloudflare):
- Sem validação de IP
- Todas as aplicações acessíveis

**Acesso via Cloudflare Tunnel**:
- IP extraído do header `cf-connecting-ip`
- Se `ipProtection: true`, valida contra `authorized_ips.json`
- IPs não autorizados recebem: "🔒 Acesso Negado"
- Bloqueios registrados em `blocked_access.log`

### Logs de Bloqueio

Formato: `[timestamp] BLOCKED: IP -> hostname/path (Service Name)`

Exemplo:
```
[2025-11-12T20:15:30.123Z] BLOCKED: 1.2.3.4 -> grafana.sistema.cloud/dashboard (Grafana)
```

## 🧪 Testes

### Testar localmente:
```bash
curl http://localhost:9000/health
curl -H "Host: metabase.sistema.cloud" http://localhost:9000/
```

### Testar via Cloudflare Tunnel:
```
https://grafana.sistema.cloud/
https://metabase.sistema.cloud/
```

## 🔄 WebSocket

WebSocket é tratado separadamente via evento `upgrade`:

- Validação de IP também aplicada
- Proxies WebSocket criados com `http-proxy`
- Suporte para Grafana Live, IDE, Airbyte

## 🛠️ Desenvolvimento

### Dependências:
- Node.js 18+
- Express.js
- http-proxy-middleware
- http-proxy

### Instalar dependências:
```bash
npm install
```

### Estrutura do código:
1. Criação de proxies HTTP e WebSocket (reusáveis)
2. Middleware de logging
3. Middleware de validação de IP
4. Roteamento por hostname
5. Handler de WebSocket upgrade
6. Health check e dashboard

## 📝 Cloudflare Tunnel

### Configuração (~/.cloudflared/config.yml):
```yaml
tunnel: <tunnel-id>
credentials-file: /home/cazouvilela/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: metabase.sistema.cloud
    service: http://localhost:9000
  - hostname: grafana.sistema.cloud
    service: http://localhost:9000
  - hostname: airbyte.sistema.cloud
    service: http://localhost:9000
  - hostname: epica.sistema.cloud
    service: http://localhost:9000
  - hostname: epica-api.sistema.cloud
    service: http://localhost:9000
  - hostname: ide.sistema.cloud
    service: http://localhost:9000
  - service: http_status:404
```

Todos os hostnames apontam para o gateway na porta 9000, que então roteia para o serviço correto.

## 🚨 Troubleshooting

### Grafana retorna 403 em dashboards:
- Verificar se fix de CSRF está ativo nos logs: `🔧 Reescrevendo Origin`
- Reiniciar gateway: `sudo systemctl restart gateway-cloudflare`

### WebSocket não conecta:
- Verificar se `websocket: true` no HOSTNAME_MAP
- Verificar logs: `[WS UPGRADE] hostname/path`

### IP bloqueado indevidamente:
- Adicionar IP em `authorized_ips.json`
- Reiniciar gateway

### Serviço retorna 502:
- Verificar se serviço local está rodando na porta correta
- Testar com curl: `curl http://localhost:PORTA`

## 📚 Documentação Adicional

- `MIGRACAO_CLOUDFLARE.md`: Histórico de migração do ngrok
- `TUNEIS_TCP_CLOUDFLARE.md`: Configuração de túneis TCP
- `.claude/memory.md`: Memória técnica completa

---

**Porta**: 9000
**Modo**: Hostname-based routing
**Túnel**: Cloudflare Tunnel
**Última atualização**: 2025-11-12
