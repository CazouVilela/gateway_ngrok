#!/usr/bin/env node

/**
 * Gateway Local - HOSTNAME-BASED (Cloudflare Tunnel)
 *
 * Roteamento por subdomínio:
 * - metabase.sistema.cloud → localhost:3000
 * - grafana.sistema.cloud → localhost:3003
 * - airbyte.sistema.cloud → localhost:8000
 * - etc
 *
 * Com validação de IP via Cloudflare (CF-Connecting-IP)
 */

const express = require('express');
const https = require('https');
const { createProxyMiddleware } = require('http-proxy-middleware');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

// ===== CERTIFICADOS SSL =====
const SSL_OPTIONS = {
  key: fs.readFileSync(path.join(__dirname, 'ssl', 'gateway.key')),
  cert: fs.readFileSync(path.join(__dirname, 'ssl', 'gateway.crt'))
};

// ===== CARREGAR CONFIGURAÇÕES =====
const authorizedIPs = JSON.parse(fs.readFileSync(path.join(__dirname, 'authorized_ips.json'), 'utf8'));

const app = express();
const PORT = 9000;

// ===== LOG DE SEGURANÇA (para Fail2Ban) =====
const SECURITY_LOG = '/var/log/gateway/metabase-auth.log';
const securityLogDir = path.dirname(SECURITY_LOG);
if (!fs.existsSync(securityLogDir)) {
  try { fs.mkdirSync(securityLogDir, { recursive: true }); } catch (e) {
    console.error(`⚠️ Não foi possível criar ${securityLogDir}: ${e.message}`);
  }
}

function logSecurity(ip, method, urlPath, status) {
  const now = new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dd = String(now.getDate()).padStart(2, '0');
  const mon = months[now.getMonth()];
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const tz = -now.getTimezoneOffset();
  const tzSign = tz >= 0 ? '+' : '-';
  const tzH = String(Math.floor(Math.abs(tz) / 60)).padStart(2, '0');
  const tzM = String(Math.abs(tz) % 60).padStart(2, '0');
  const timestamp = `${dd}/${mon}/${yyyy}:${hh}:${mm}:${ss} ${tzSign}${tzH}${tzM}`;
  const line = `${ip} [${timestamp}] "${method} ${urlPath} HTTP/1.1" ${status}\n`;
  fs.appendFile(SECURITY_LOG, line, (err) => {
    if (err) console.error(`⚠️ Erro escrevendo log de segurança: ${err.message}`);
  });
}

// ===== RATE-LIMIT: Login Metabase (5 tentativas/min por IP) =====
const metabaseLoginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers['cf-connecting-ip'] || req.ip,
  handler: (req, res) => {
    const ip = req.headers['cf-connecting-ip'] || req.ip;
    console.log(`  🚫 Rate-limit: ${ip} excedeu 5 tentativas/min no login Metabase`);
    logSecurity(ip, req.method, req.path, 429);
    res.status(429).json({ message: 'Muitas tentativas de login. Aguarde 1 minuto.' });
  }
});

// ===== MAPEAMENTO DE HOSTNAMES → SERVIÇOS =====
const HOSTNAME_MAP = {
  'metabase.sistema.cloud': {
    name: 'Metabase',
    target: 'http://localhost:3000',
    ipProtection: false,
    websocket: true
  },
  'airbyte.sistema.cloud': {
    name: 'Airbyte',
    target: 'http://localhost:8000',
    ipProtection: true,
    websocket: true
  },
  'grafana.sistema.cloud': {
    name: 'Grafana',
    target: 'http://localhost:3003',
    ipProtection: true,
    websocket: true
  },
  'epica.sistema.cloud': {
    name: 'Épica Frontend',
    target: 'http://localhost:5000',
    ipProtection: true,
    websocket: true
  },
  'epica-api.sistema.cloud': {
    name: 'Épica Backend',
    target: 'http://localhost:5001',
    ipProtection: true,
    websocket: false
  },
  'ide.sistema.cloud': {
    name: 'IDE Customizada',
    target: 'http://localhost:3780',
    ipProtection: true,
    websocket: true
  },
  'oraculo.sistema.cloud': {
    name: 'Oraculo Invest',
    target: 'http://localhost:8050',
    ipProtection: true,
    websocket: false
  }
};

// ===== CRIAR PROXIES UMA VEZ (REUTILIZÁVEIS) =====
const HTTP_PROXIES = {};
const WS_PROXIES = {};

Object.entries(HOSTNAME_MAP).forEach(([hostname, service]) => {
  // Proxy HTTP (SEM websocket)
  HTTP_PROXIES[hostname] = createProxyMiddleware({
    target: service.target,
    changeOrigin: true,
    ws: false, // DESABILITADO - WebSocket tratado separadamente

    // Preservar cookies e credenciais (não reescrever domain/path)
    cookieDomainRewrite: false,
    cookiePathRewrite: false,

    // Preservar headers importantes do Cloudflare
    headers: {
      'X-Forwarded-For': '',
      'X-Forwarded-Host': '',
      'X-Forwarded-Proto': '',
      'X-Real-IP': ''
    },

    onProxyReq: (proxyReq, req, res) => {
      console.log(`  → Proxy: ${service.name} | ${req.method} ${req.path} → ${service.target}${req.path}`);

      // Garantir que headers do Cloudflare sejam passados
      const cfHeaders = {
        'X-Forwarded-For': req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip'],
        'X-Forwarded-Host': req.headers['x-forwarded-host'] || req.headers['host'],
        'X-Forwarded-Proto': req.headers['x-forwarded-proto'] || 'https',
        'X-Real-IP': req.headers['cf-connecting-ip'] || req.connection.remoteAddress
      };

      Object.entries(cfHeaders).forEach(([key, value]) => {
        if (value) proxyReq.setHeader(key, value);
      });

      // Para Grafana: reescrever Origin e Referer para localhost para evitar bloqueio de CSRF
      if (service.name === 'Grafana') {
        if (req.headers.origin) {
          proxyReq.setHeader('Origin', service.target);
          console.log(`  🔧 Reescrevendo Origin: ${req.headers.origin} → ${service.target}`);
        }
        if (req.headers.referer) {
          const refererUrl = new URL(req.headers.referer);
          const newReferer = `${service.target}${refererUrl.pathname}${refererUrl.search}`;
          proxyReq.setHeader('Referer', newReferer);
          console.log(`  🔧 Reescrevendo Referer: ${req.headers.referer} → ${newReferer}`);
        }
      }
    },

    onProxyRes: (proxyRes, req, res) => {
      console.log(`  ← Response: ${service.name} | ${proxyRes.statusCode} ${proxyRes.statusMessage}`);

      // Log de segurança: login falho no Metabase (401)
      if (service.name === 'Metabase' &&
          req.method === 'POST' &&
          req.path === '/api/session' &&
          proxyRes.statusCode === 401) {
        const ip = req.headers['cf-connecting-ip'] || req.connection.remoteAddress;
        console.log(`  🔐 Login falho Metabase de ${ip}`);
        logSecurity(ip, req.method, req.path, 401);
      }
    },

    onError: (err, req, res) => {
      console.error(`  ❌ Erro no proxy para ${service.name}: ${err.message}`);
      if (!res.headersSent) {
        res.status(502).send(`
          <!DOCTYPE html>
          <html>
          <head><title>Erro - ${service.name}</title></head>
          <body>
            <h1>⚠️ Erro de Gateway</h1>
            <p>Não foi possível conectar ao <strong>${service.name}</strong></p>
            <p><small>${err.message}</small></p>
          </body>
          </html>
        `);
      }
    }
  });

  // Proxy WebSocket (se habilitado)
  if (service.websocket) {
    WS_PROXIES[hostname] = require('http-proxy').createProxyServer({
      target: service.target,
      ws: true
    });
  }
});

console.log('==========================================');
console.log('🚀 Gateway Hostname-Based - Cloudflare');
console.log('==========================================');
console.log(`Porta: ${PORT}`);
console.log(`Modo: Roteamento por Hostname`);
console.log(`IPs Autorizados: ${authorizedIPs.ips.length}`);
authorizedIPs.ips.forEach(ip => console.log(`  ✓ ${ip}`));
console.log('\nServiços configurados:');
Object.entries(HOSTNAME_MAP).forEach(([hostname, service]) => {
  const protection = service.ipProtection ? '🔒' : '🌐';
  console.log(`  ${protection} ${hostname} → ${service.target}`);
});
console.log('==========================================\n');

// ===== MIDDLEWARE DE VALIDAÇÃO DE IP =====
function validateIP(req, res, service) {
  // Não precisa validar se não tem proteção
  if (!service.ipProtection) {
    console.log(`  🌐 ${service.name}: Sem proteção de IP`);
    return true;
  }

  // Cloudflare envia o IP real no header CF-Connecting-IP
  const cfIP = req.get('cf-connecting-ip');
  const xForwardedFor = req.get('x-forwarded-for') || '';
  const clientIP = cfIP || xForwardedFor.split(',')[0].trim();

  // Acesso local (sem cloudflare)
  if (!cfIP && !xForwardedFor) {
    console.log(`  ✓ ${service.name}: Acesso local (sem validação)`);
    return true;
  }

  console.log(`  🔍 ${service.name}: Validando IP ${clientIP}`);

  if (authorizedIPs.ips.includes(clientIP)) {
    console.log(`  ✅ ${service.name}: IP autorizado`);
    return true;
  }

  // IP não autorizado
  console.log(`  ❌ ${service.name}: IP BLOQUEADO: ${clientIP}`);

  // Log do bloqueio
  const host = req.get('host') || '';
  const logEntry = `[${new Date().toISOString()}] BLOCKED: ${clientIP} -> ${host}${req.path} (${service.name})\n`;
  fs.appendFileSync(path.join(__dirname, 'blocked_access.log'), logEntry);

  res.status(403).send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Acesso Negado</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
          background: #f5f5f5;
        }
        h1 {
          color: #d32f2f;
          font-size: 2em;
        }
      </style>
    </head>
    <body>
      <h1>🔒 Acesso Negado</h1>
    </body>
    </html>
  `);

  return false;
}

// ===== MIDDLEWARE PRINCIPAL =====
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const host = req.get('host') || '';
  const hostname = host.split(':')[0]; // Remove porta se houver

  console.log(`[${timestamp}] ${req.method} ${hostname}${req.path}`);

  // Rotas especiais (sem validação)
  if (req.path === '/health') {
    console.log('  ✓ Health check');
    return res.status(200).send('OK');
  }

  // Servir assets patchados do Airbyte (fix Chrome useSuspenseQuery)
  if (req.path.startsWith('/assets/') && req.path.endsWith('.js')) {
    const filename = path.basename(req.path);
    const patchedFile = path.join(__dirname, 'assets', filename);
    if (fs.existsSync(patchedFile)) {
      console.log(`  🔧 Servindo ${filename} PATCHADO (fix Chrome)`);
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Cache-Control', 'no-cache');
      return res.sendFile(patchedFile);
    }
  }

  // Página de diagnóstico Airbyte (acessar em Chrome para debug)
  if (req.path === '/diag') {
    console.log('  🔍 Diagnóstico Airbyte');
    return res.send(`<!DOCTYPE html>
<html><head><title>Airbyte Diagnostico v2</title></head>
<body>
<h2>Diagnostico Airbyte v2 - Chrome</h2>
<pre id="r">Executando...</pre>
<script>
(async function(){
  const el = document.getElementById('r');
  let out = '';
  function log(s){ out += s + '\\n'; el.textContent = out; }

  log('User-Agent: ' + navigator.userAgent);
  log('Origin: ' + window.location.origin);
  log('Protocol: ' + window.location.protocol);
  log('isSecureContext: ' + window.isSecureContext);
  log('');

  // Test 1: web_backend/config - o que main-itdw1a9f.js chama (Mt/xun)
  log('=== Test 1: /api/v1/web_backend/config (Entry Point - xun/Mt) ===');
  try {
    const h1 = new Headers();
    h1.set('X-Airbyte-Analytic-Source', 'webapp');
    const r1 = await fetch('/api/v1/web_backend/config', {method: 'GET', headers: h1});
    log('Status: ' + r1.status + ' ' + r1.statusText);
    log('ok: ' + r1.ok);
    const ct1 = r1.headers.get('content-type');
    log('content-type header: ' + JSON.stringify(ct1));
    log('ct !== "application/json": ' + (ct1 !== 'application/json'));
    log('ALL headers:');
    r1.headers.forEach(function(v,k){ log('  ' + k + ': ' + v); });
    if (ct1 !== 'application/json') {
      log('*** BLOB PATH - isto causa o bug! ***');
      const blob = await r1.blob();
      log('Blob type: ' + blob.type + ', size: ' + blob.size);
      log('Blob text: ' + (await blob.text()).substring(0,300));
    } else {
      const json = await r1.json();
      log('JSON result type: ' + typeof json);
      log('JSON result: ' + JSON.stringify(json).substring(0,400));
      log('edition: ' + (json ? json.edition : 'N/A'));
    }
  } catch(e) { log('FALHOU: ' + e.message); }

  log('');

  // Test 2: instance_configuration - o que o hook lF/D chama
  log('=== Test 2: /api/v1/instance_configuration (React Hook - lF/D) ===');
  try {
    const h2 = new Headers();
    h2.set('X-Airbyte-Analytic-Source', 'webapp');
    const r2 = await fetch('/api/v1/instance_configuration', {method: 'GET', headers: h2});
    log('Status: ' + r2.status);
    const ct2 = r2.headers.get('content-type');
    log('content-type: ' + JSON.stringify(ct2));
    log('ct !== "application/json": ' + (ct2 !== 'application/json'));
    if (ct2 !== 'application/json') {
      log('*** BLOB PATH - isto causa o bug! ***');
    } else {
      const json2 = await r2.json();
      log('JSON: ' + JSON.stringify(json2).substring(0,400));
    }
  } catch(e) { log('FALHOU: ' + e.message); }

  log('');

  // Test 3: Simular EXATAMENTE a funcao fyt do Airbyte
  log('=== Test 3: Simulacao EXATA da funcao fyt ===');
  async function fyt_sim(n, responseType) {
    if (n.status === 204) return {};
    if (n.ok) {
      var isBlob = responseType === 'blob' || n.headers.get('content-type') !== 'application/json';
      log('  fyt: ok=' + n.ok + ', responseType=' + responseType + ', ct=' + JSON.stringify(n.headers.get('content-type')) + ', isBlob=' + isBlob);
      return isBlob ? n.blob() : n.json();
    }
    log('  fyt: NOT OK, status=' + n.status);
    throw new Error('Response not ok: ' + n.status);
  }

  // 3a: web_backend/config (como xun chama - sem responseType)
  log('--- 3a: web_backend/config via fyt ---');
  try {
    const h3 = new Headers();
    h3.set('X-Airbyte-Analytic-Source', 'webapp');
    const r3 = await fetch('/api/v1/web_backend/config', {method: 'GET', headers: h3});
    const result3 = await fyt_sim(r3, undefined);
    log('  Result type: ' + typeof result3);
    log('  Is Blob: ' + (result3 instanceof Blob));
    log('  Result: ' + (result3 instanceof Blob ? 'BLOB size=' + result3.size : JSON.stringify(result3).substring(0,300)));
    if (result3 && typeof result3 === 'object' && !(result3 instanceof Blob)) {
      log('  edition: ' + result3.edition);
      log('  edition.toLowerCase(): ' + (result3.edition ? result3.edition.toLowerCase() : 'CRASH'));
    }
  } catch(e) { log('  FALHOU: ' + e.message); }

  // 3b: instance_configuration via fyt
  log('--- 3b: instance_configuration via fyt ---');
  try {
    const h4 = new Headers();
    h4.set('X-Airbyte-Analytic-Source', 'webapp');
    const r4 = await fetch('/api/v1/instance_configuration', {method: 'GET', headers: h4});
    const result4 = await fyt_sim(r4, undefined);
    log('  Result type: ' + typeof result4);
    log('  Is Blob: ' + (result4 instanceof Blob));
    log('  Result: ' + (result4 instanceof Blob ? 'BLOB size=' + result4.size : JSON.stringify(result4).substring(0,300)));
  } catch(e) { log('  FALHOU: ' + e.message); }

  log('');

  // Test 4: Service Worker check
  log('=== Test 4: Service Worker ===');
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    log('Service Workers registrados: ' + regs.length);
    regs.forEach(function(r,i){ log('  SW ' + i + ': ' + r.scope); });
  } else {
    log('Service Worker NAO suportado (isSecureContext=' + window.isSecureContext + ')');
  }

  log('');

  // Test 5: Testar se Chrome bloqueia algo especifico
  log('=== Test 5: window.crossOriginIsolated & Permissions ===');
  log('crossOriginIsolated: ' + window.crossOriginIsolated);
  log('cookieEnabled: ' + navigator.cookieEnabled);
  log('document.cookie: ' + JSON.stringify(document.cookie));

  log('');
  log('=== FIM DO DIAGNOSTICO v2 ===');
})();
</script>
</body></html>`);
  }

  if (req.path === '/dashboard') {
    console.log('  ✓ Dashboard');
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Gateway Dashboard</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 1000px;
      margin: 50px auto;
      padding: 20px;
      background: #f9f9f9;
    }
    h1 { color: #333; text-align: center; }
    .service {
      background: white;
      padding: 20px;
      margin: 15px 0;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .service h3 { margin: 0; color: #0066cc; }
    .service p { margin: 5px 0; color: #666; }
    .badge {
      padding: 5px 10px;
      border-radius: 5px;
      font-size: 12px;
      font-weight: bold;
    }
    .protected { background: #ffeb3b; color: #333; }
    .public { background: #4caf50; color: white; }
    .info {
      background: #e3f2fd;
      padding: 15px;
      border-radius: 5px;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <h1>🚀 Gateway Dashboard - Hostname-Based</h1>
  <div class="info">
    <strong>Modo:</strong> Roteamento por Hostname (Cloudflare)<br>
    <strong>Porta:</strong> ${PORT}<br>
    <strong>IPs Autorizados:</strong> ${authorizedIPs.ips.length}
  </div>
  ${Object.entries(HOSTNAME_MAP).map(([hostname, service]) => `
    <div class="service">
      <div>
        <h3>${service.name}</h3>
        <p><strong>${hostname}</strong> → ${service.target}</p>
      </div>
      <span class="badge ${service.ipProtection ? 'protected' : 'public'}">
        ${service.ipProtection ? '🔒 Protegido' : '🌐 Público'}
      </span>
    </div>
  `).join('')}
</body>
</html>
    `;
    return res.send(html);
  }

  // Identificar serviço pelo hostname
  const service = HOSTNAME_MAP[hostname];

  // ===== FIX CHROME: navigator.onLine=false em IPs de LAN =====
  // Chrome reporta navigator.onLine=false para IPs que nao sao localhost,
  // fazendo React Query pausar queries e retornar data=undefined.
  // Injetamos um fix no HTML do Airbyte para forcar onLine=true.
  const isAirbyte = hostname === 'airbyte.sistema.cloud' || !service;
  if (isAirbyte && req.method === 'GET' && (req.path === '/' || req.path === '/index.html')) {
    console.log('  🔧 Injetando fix navigator.onLine no HTML do Airbyte');
    const http = require('http');
    // Repassar cookies do browser para o Airbyte backend
    const proxyHeaders = {};
    if (req.headers.cookie) proxyHeaders.cookie = req.headers.cookie;
    if (req.headers.authorization) proxyHeaders.authorization = req.headers.authorization;
    http.get('http://localhost:8000' + req.path, { headers: proxyHeaders }, (proxyRes) => {
      let body = '';
      proxyRes.on('data', chunk => body += chunk);
      proxyRes.on('end', () => {
        const fix = '<script>Object.defineProperty(navigator,"onLine",{get:()=>true,configurable:true})</script>';
        const modified = body.replace('<head>', '<head>' + fix);
        const headers = {};
        // Preservar TODOS os headers da response, incluindo Set-Cookie
        Object.keys(proxyRes.headers).forEach(k => { headers[k] = proxyRes.headers[k]; });
        headers['content-length'] = Buffer.byteLength(modified);
        res.writeHead(proxyRes.statusCode, headers);
        res.end(modified);
      });
    }).on('error', (err) => {
      console.error(`  ❌ Erro fetch HTML Airbyte: ${err.message}`);
      res.status(502).send('Erro ao conectar ao Airbyte');
    });
    return;
  }

  if (!service) {
    // Fallback: acesso direto via IP → Airbyte
    console.log(`  🔄 Fallback para Airbyte (acesso direto via IP: ${hostname})`);
    const airbyteProxy = HTTP_PROXIES['airbyte.sistema.cloud'];
    if (airbyteProxy) {
      try {
        return airbyteProxy(req, res, next);
      } catch (err) {
        console.error(`  ❌ Erro no fallback proxy: ${err.message}`);
      }
    }
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head><title>404 - Serviço Não Encontrado</title></head>
      <body>
        <h1>404 - Serviço Não Encontrado</h1>
        <p>Hostname: <strong>${hostname}</strong></p>
        <p><a href="https://localhost:9000/dashboard">Ver Dashboard</a></p>
      </body>
      </html>
    `);
  }

  console.log(`  → Serviço identificado: ${service.name}`);

  // Validar IP se necessário
  if (!validateIP(req, res, service)) {
    return; // Resposta já foi enviada (403)
  }

  // Usar proxy HTTP pré-criado (REUTILIZÁVEL)
  const proxy = HTTP_PROXIES[hostname];

  if (!proxy) {
    console.error(`  ❌ Proxy não encontrado para: ${hostname}`);
    return res.status(500).send('Internal Server Error');
  }

  // Rate-limit: login Metabase via internet (CF-Connecting-IP presente)
  if (hostname === 'metabase.sistema.cloud' &&
      req.method === 'POST' &&
      req.path === '/api/session' &&
      req.headers['cf-connecting-ip']) {
    console.log(`  🔒 Rate-limit check: login Metabase de ${req.headers['cf-connecting-ip']}`);
    return metabaseLoginLimiter(req, res, () => {
      proxy(req, res, next);
    });
  }

  console.log(`  🔄 Executando proxy para: ${service.name}`);

  try {
    proxy(req, res, next);
  } catch (err) {
    console.error(`  ❌ Erro ao executar proxy: ${err.message}`);
    if (!res.headersSent) {
      res.status(500).send('Proxy Error');
    }
  }
});

// ===== INICIAR SERVIDOR HTTPS =====
const server = https.createServer(SSL_OPTIONS, app).listen(PORT, () => {
  console.log(`\n✅ Gateway HTTPS rodando na porta ${PORT}`);
  console.log(`📊 Dashboard: https://localhost:${PORT}/dashboard`);
  console.log(`❤️  Health check: https://localhost:${PORT}/health\n`);
});

// ===== HANDLER DE WEBSOCKET UPGRADE =====
server.on('upgrade', (req, socket, head) => {
  const host = req.headers.host || '';
  const hostname = host.split(':')[0];

  console.log(`[WS UPGRADE] ${hostname}${req.url}`);

  const service = HOSTNAME_MAP[hostname];

  if (!service || !service.websocket) {
    console.log(`  ❌ WebSocket não suportado para: ${hostname}`);
    socket.destroy();
    return;
  }

  console.log(`  → Serviço: ${service.name}`);

  // Validar IP para WebSocket
  if (service.ipProtection) {
    const cfIP = req.headers['cf-connecting-ip'];
    const xForwardedFor = req.headers['x-forwarded-for'] || '';
    const clientIP = cfIP || xForwardedFor.split(',')[0].trim();

    if (clientIP && !authorizedIPs.ips.includes(clientIP)) {
      console.log(`  ❌ WS IP BLOQUEADO: ${clientIP}`);
      socket.destroy();
      return;
    }

    console.log(`  ✅ WS IP autorizado: ${clientIP}`);
  }

  // Usar proxy WebSocket pré-criado (REUTILIZÁVEL)
  const proxy = WS_PROXIES[hostname];

  if (!proxy) {
    console.error(`  ❌ Proxy WS não encontrado para: ${hostname}`);
    socket.destroy();
    return;
  }

  console.log(`  ⚡ Upgrading WebSocket: ${service.name} → ${service.target}`);

  proxy.ws(req, socket, head, (err) => {
    if (err) {
      console.error(`  ❌ WS upgrade error:`, err.message);
      socket.destroy();
    }
  });
});

// ===== SHUTDOWN GRACIOSO =====
process.on('SIGTERM', () => {
  console.log('\n🛑 Encerrando gateway...');
  server.close(() => {
    console.log('✅ Gateway encerrado');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n🛑 Encerrando gateway...');
  server.close(() => {
    console.log('✅ Gateway encerrado');
    process.exit(0);
  });
});
