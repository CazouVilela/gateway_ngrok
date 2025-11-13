# Migração do Gateway Ngrok para Cloudflare Tunnel

## Data da Migração: 2025-11-09 a 2025-11-12

## Motivo
- **Performance**: Cloudflare Tunnel é 67% mais rápido que ngrok (~115ms vs ~350ms)
- **Custo**: 100% gratuito e ilimitado
- **Estabilidade**: URLs permanentes, sem limite de tempo de conexão
- **Segurança**: Validação de IP usando headers do Cloudflare

## Evolução da Arquitetura

### 1. Arquitetura Original (Gateway + Ngrok)

```
Browser → ngrok (sistemas.ngrok.io) → Gateway PATH-BASED (porta 9000) → Serviços locais
```

**Características:**
- Roteamento por path (`/metabase`, `/grafana`, etc)
- Validação de IP usando `x-forwarded-for`
- Latência alta (~350ms)
- URLs instáveis do ngrok

### 2. Tentativa: Cloudflare Tunnel Direto

```
Browser → Cloudflare Tunnel → Serviços locais (DIRETO)
```

**Problema identificado:**
- ❌ Sem validação de IP (serviços ficaram expostos após reboot)
- ❌ Sem controle centralizado de acesso

### 3. Arquitetura Final (Gateway HOSTNAME-BASED + Cloudflare)

```
Browser → Cloudflare Tunnel → Gateway HOSTNAME-BASED (porta 9000) → Serviços locais
```

**Vantagens:**
- ✅ Validação de IP usando `cf-connecting-ip` (Cloudflare)
- ✅ Roteamento por hostname/subdomínio
- ✅ Controle centralizado em um único ponto
- ✅ Latência baixa (~115ms)
- ✅ URLs permanentes
- ✅ Fix automático de CSRF para Grafana

## Mudanças Técnicas

### Gateway: PATH-BASED → HOSTNAME-BASED

**Antes (gateway-ngrok.js):**
```javascript
// Roteamento por path
app.use('/metabase', createProxyMiddleware({...}));
app.use('/grafana', createProxyMiddleware({...}));
```

**Depois (gateway.js):**
```javascript
// Roteamento por hostname
const HOSTNAME_MAP = {
  'metabase.sistema.cloud': { target: 'http://localhost:3000', ... },
  'grafana.sistema.cloud': { target: 'http://localhost:3003', ... }
};

app.use((req, res, next) => {
  const hostname = req.get('host').split(':')[0];
  const service = HOSTNAME_MAP[hostname];
  // Roteia baseado no hostname
});
```

### Validação de IP: X-Forwarded-For → CF-Connecting-IP

**Antes:**
```javascript
const clientIP = req.get('x-forwarded-for')?.split(',')[0].trim();
```

**Depois:**
```javascript
const cfIP = req.get('cf-connecting-ip');
const xForwardedFor = req.get('x-forwarded-for') || '';
const clientIP = cfIP || xForwardedFor.split(',')[0].trim();
```

### Fix de CSRF para Grafana

**Problema:** Grafana retornava 403 para `POST /api/ds/query` devido à validação de CSRF

**Solução:** Reescrita automática de headers Origin e Referer:
```javascript
if (service.name === 'Grafana') {
  if (req.headers.origin) {
    proxyReq.setHeader('Origin', service.target);
  }
  if (req.headers.referer) {
    const refererUrl = new URL(req.headers.referer);
    const newReferer = `${service.target}${refererUrl.pathname}${refererUrl.search}`;
    proxyReq.setHeader('Referer', newReferer);
  }
}
```

## Subdomínios Configurados

| Serviço | Subdomínio | Porta Local | IP Protection | Status |
|---------|-----------|-------------|---------------|--------|
| Metabase | https://metabase.sistema.cloud | 3000 | ❌ Não | ✅ Funcionando |
| Airbyte | https://airbyte.sistema.cloud | 8000 | ✅ Sim | ✅ Funcionando |
| Grafana | https://grafana.sistema.cloud | 3003 | ✅ Sim | ✅ Funcionando |
| Épica Frontend | https://epica.sistema.cloud | 5000 | ✅ Sim | ✅ Funcionando |
| Épica Backend | https://epica-api.sistema.cloud | 5001 | ✅ Sim | ✅ Funcionando |
| IDE Customizada | https://ide.sistema.cloud | 3780 | ✅ Sim | ✅ Funcionando |
| RPO Hub API | https://rpo-api.sistema.cloud | 6000 | ❌ Não | ✅ Funcionando (direto) |

**Nota:** RPO Hub API continua com acesso direto (sem gateway) pois não requer validação de IP.

## Configuração do Cloudflare Tunnel

### Arquivo: `~/.cloudflared/config.yml`
```yaml
tunnel: a986fd02-432d-42e7-832c-b20f483417ff
credentials-file: /home/cazouvilela/.cloudflared/a986fd02-432d-42e7-832c-b20f483417ff.json

ingress:
  # Serviços via gateway (com validação de IP)
  - hostname: metabase.sistema.cloud
    service: http://localhost:9000
  - hostname: airbyte.sistema.cloud
    service: http://localhost:9000
  - hostname: grafana.sistema.cloud
    service: http://localhost:9000
  - hostname: epica.sistema.cloud
    service: http://localhost:9000
  - hostname: epica-api.sistema.cloud
    service: http://localhost:9000
  - hostname: ide.sistema.cloud
    service: http://localhost:9000

  # Serviço direto (sem validação de IP)
  - hostname: rpo-api.sistema.cloud
    service: http://localhost:6000

  - service: http_status:404
```

### Serviço Systemd: gateway-cloudflare.service

**Arquivo:** `/etc/systemd/system/gateway-cloudflare.service`

```ini
[Unit]
Description=Gateway Local com Proteção de IP (Cloudflare Tunnel)
After=network.target

[Service]
Type=simple
User=cazouvilela
WorkingDirectory=/home/cazouvilela/projetos/gateway_local
ExecStart=/usr/bin/node gateway.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=gateway-cloudflare

[Install]
WantedBy=multi-user.target
```

**Comandos:**
```bash
# Iniciar
sudo systemctl start gateway-cloudflare

# Status
sudo systemctl status gateway-cloudflare

# Logs
sudo journalctl -u gateway-cloudflare -f

# Reiniciar
sudo systemctl restart gateway-cloudflare
```

## Problemas Resolvidos

### 1. Serviços expostos após reboot ✅
**Causa:** Cloudflared conectava direto aos serviços, sem validação de IP
**Solução:** Rotear via gateway (porta 9000) com validação de IP

### 2. WebSocket ERR_STREAM_WRITE_AFTER_END ✅
**Causa:** Múltiplos proxies criados por requisição
**Solução:** Criar proxies uma única vez no startup e reutilizar

### 3. Grafana 403 em dashboards ✅
**Causa:** CSRF blocking em requisições POST através do proxy
**Solução:** Reescrever headers Origin/Referer para localhost:3003

### 4. Metabase PostgreSQL connection refused ✅
**Causa:** PostgreSQL escutando apenas em 127.0.0.1, Metabase Docker não conseguia conectar
**Solução:** Configurar PostgreSQL para escutar no Docker bridge (172.17.0.1)

## Fluxo de Validação de IP

```
1. Requisição chega via Cloudflare Tunnel
2. Cloudflare adiciona header: cf-connecting-ip: 185.253.70.62
3. Gateway recebe requisição e extrai hostname
4. Gateway identifica serviço pelo hostname
5. Se ipProtection: true
   ├─ Extrai IP do cf-connecting-ip
   ├─ Valida contra authorized_ips.json
   ├─ Se autorizado: proxy para serviço local
   └─ Se negado: retorna 403 + log em blocked_access.log
6. Se ipProtection: false
   └─ Proxy direto para serviço local
```

## Monitoramento

### Logs do Gateway
```bash
sudo journalctl -u gateway-cloudflare -f
```

**Exemplo de log (requisição autorizada):**
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

**Exemplo de log (requisição bloqueada):**
```
[2025-11-12T20:15:30.123Z] GET grafana.sistema.cloud/dashboard
  → Serviço identificado: Grafana
  🔍 Grafana: Validando IP 1.2.3.4
  ❌ Grafana: IP BLOQUEADO: 1.2.3.4
```

### Logs de Bloqueio
```bash
cat /home/cazouvilela/projetos/gateway_local/blocked_access.log
```

## Testes de Performance

### Latência (POST request)
- **Ngrok**: ~350ms
- **Cloudflare Tunnel (direto)**: ~115ms
- **Cloudflare Tunnel (via gateway)**: ~120-130ms

**Melhoria:** 63% mais rápido que ngrok 🚀

### WebSocket
- **Grafana Live**: ✅ Funcionando
- **IDE**: ✅ Funcionando
- **Airbyte**: ✅ Funcionando

## Status da Migração

### ✅ Concluído
1. ✅ Gateway refatorado: PATH-BASED → HOSTNAME-BASED
2. ✅ Validação de IP via cf-connecting-ip
3. ✅ WebSocket funcionando (proxies reusáveis)
4. ✅ Fix de CSRF para Grafana
5. ✅ Metabase PostgreSQL configurado
6. ✅ Todos os serviços funcionando
7. ✅ Documentação atualizada

### 📋 Serviços Operacionais
- ✅ Metabase (sem IP protection)
- ✅ Grafana (com IP protection + CSRF fix)
- ✅ Airbyte (com IP protection + WebSocket)
- ✅ IDE (com IP protection + WebSocket)
- ✅ Épica Frontend/Backend (com IP protection)
- ✅ RPO Hub API (acesso direto)

## Rollback (se necessário)

Para reverter para ngrok:
1. Parar serviço do gateway: `sudo systemctl stop gateway-cloudflare`
2. Renomear `gateway.js` para `gateway-hostname.js`
3. Renomear `gateway.js.path-based-backup` para `gateway.js`
4. Renomear serviço: `gateway-cloudflare` → `gateway-ngrok`
5. Iniciar ngrok
6. Reiniciar gateway: `sudo systemctl start gateway-ngrok`

## Observações Finais

- SSL configurado automaticamente pelo Cloudflare (modo Flexible)
- DNS propagado instantaneamente
- Túnel possui 4 conexões redundantes
- Protocolo QUIC (mais eficiente que HTTP/2)
- Gateway fornece controle centralizado de segurança
- IPs autorizados: 185.253.70.62, 2804:16d8:dc8b:100:8e37:74ed:a929:6d19

## Contatos e Suporte

- Cloudflare Dashboard: https://dash.cloudflare.com
- Tunnel ID: `a986fd02-432d-42e7-832c-b20f483417ff`
- Domínio: `sistema.cloud`

---

**Migração concluída com sucesso em 2025-11-12** ✅
**Arquitetura final:** Cloudflare Tunnel + Gateway Hostname-Based + Validação de IP
