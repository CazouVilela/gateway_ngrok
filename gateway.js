#!/usr/bin/env node

/**
 * Gateway Padronizado para Ngrok
 *
 * Arquitetura simples:
 * - Configuração centralizada em config.json
 * - Validação opcional de IP por aplicação
 * - Suporte a WebSocket
 * - Path rewriting opcional
 */

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const fs = require('fs');
const path = require('path');

// ===== CARREGAR CONFIGURAÇÕES =====
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const authorizedIPs = JSON.parse(fs.readFileSync(path.join(__dirname, 'authorized_ips.json'), 'utf8'));

const app = express();
const PORT = config.gateway.port;

console.log('==========================================');
console.log('🚀 Gateway Padronizado - Ngrok');
console.log('==========================================');
console.log(`Porta: ${PORT}`);
console.log(`Domínio: ${config.gateway.ngrokDomain}`);
console.log(`IPs Autorizados: ${authorizedIPs.ips.length}`);
authorizedIPs.ips.forEach(ip => console.log(`  ✓ ${ip}`));
console.log('==========================================\n');

// ===== MIDDLEWARE DE LOGGING =====
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ===== MIDDLEWARE DE VALIDAÇÃO DE IP =====
function createIPValidationMiddleware(appName) {
  return (req, res, next) => {
    const host = req.get('host') || '';

    // Acesso local: sempre permitir
    if (!host.includes(config.gateway.ngrokDomain)) {
      console.log(`  ✓ Local access to ${appName}`);
      return next();
    }

    // Via ngrok: validar IP
    const forwardedFor = req.get('x-forwarded-for') || '';
    const clientIP = forwardedFor.split(',')[0].trim();

    console.log(`  🔍 Ngrok access to ${appName} from IP: ${clientIP}`);

    if (authorizedIPs.ips.includes(clientIP)) {
      console.log(`  ✅ IP authorized`);
      return next();
    }

    // Bloquear
    console.log(`  ❌ IP BLOCKED`);

    // Log do bloqueio
    const logEntry = `[${new Date().toISOString()}] BLOCKED: ${clientIP} -> ${host}${req.path} (${appName})\n`;
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
  };
}

// ===== CRIAR PROXY PARA CADA APLICAÇÃO =====
function createApplicationProxy(app, filterFn = null) {
  const proxyOptions = {
    target: app.target,
    changeOrigin: true,
    ws: false, // WebSocket upgrades are handled manually in server.on('upgrade')
    pathRewrite: app.pathRewrite ? { [`^${app.path}`]: '' } : undefined,

    // Adicionar filtro se fornecido
    ...(filterFn && {
      filter: (pathname, req) => filterFn(pathname, req)
    }),

    onProxyReq: (proxyReq, req, res) => {
      // Preservar hostname original (sem porta)
      const originalHost = req.headers.host || '';
      const hostname = originalHost.split(':')[0];
      if (hostname) {
        proxyReq.setHeader('Host', hostname);
      }

      const targetPath = app.pathRewrite ? req.path.replace(app.path, '') : req.path;
      console.log(`  → Proxy: ${app.name} | ${req.method} ${req.path} → ${app.target}${targetPath}`);
    },

    onProxyReqWs: (proxyReq, req, socket) => {
      console.log(`  ⚡ WebSocket: ${app.name} | ${req.url} → ${app.target}`);
    },

    onProxyRes: (proxyRes, req, res) => {
      // Reescrever redirects se necessário
      if (app.pathRewrite && proxyRes.headers.location) {
        const location = proxyRes.headers.location;
        if (location.startsWith('/') && !location.startsWith(app.path)) {
          proxyRes.headers.location = app.path + location;
          console.log(`  ↪ Redirect reescrito: ${location} → ${proxyRes.headers.location}`);
        }
      }
    },

    onError: (err, req, res) => {
      console.error(`  ❌ Error proxying to ${app.name}: ${err.message}`);
      res.status(502).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Erro - ${app.name}</title></head>
        <body>
          <h1>⚠️ Erro de Gateway</h1>
          <p>Não foi possível conectar ao ${app.name}</p>
          <p><small>${err.message}</small></p>
        </body>
        </html>
      `);
    }
  };

  return createProxyMiddleware(proxyOptions);
}

// ===== MIDDLEWARE DE REDIRECIONAMENTO PARA BARRA FINAL =====
// Redireciona /epica para /epica/ automaticamente
app.use((req, res, next) => {
  const needsTrailingSlash = config.applications.some(app => {
    // Se o path exato corresponde (sem barra final)
    if (req.path === app.path && app.path !== '/') {
      return true;
    }
    return false;
  });

  if (needsTrailingSlash && !req.path.endsWith('/')) {
    const redirectUrl = req.path + '/';
    console.log(`  ↪ Redirecionando: ${req.path} → ${redirectUrl}`);
    return res.redirect(301, redirectUrl);
  }

  next();
});

// ===== ROTA DE HEALTH CHECK (antes de tudo) =====
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// ===== DASHBOARD DE SERVIÇOS (antes de tudo) =====
app.get('/dashboard', (req, res) => {
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
    a { color: #0066cc; text-decoration: none; font-weight: bold; }
    a:hover { text-decoration: underline; }
    .info {
      background: #e3f2fd;
      padding: 15px;
      border-radius: 5px;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <h1>🚀 Gateway Dashboard</h1>

  <div class="info">
    <strong>Endpoint:</strong> ${config.gateway.ngrokDomain}<br>
    <strong>Porta:</strong> ${PORT}<br>
    <strong>Aplicações:</strong> ${config.applications.length}<br>
    <strong>IPs Autorizados:</strong> ${authorizedIPs.ips.length}
  </div>

  ${config.applications.map(app => `
    <div class="service">
      <div>
        <h3>${app.name}</h3>
        <p><a href="${app.path}" target="_blank">${app.path}</a> → ${app.target}</p>
      </div>
      <span class="badge ${app.ipProtection ? 'protected' : 'public'}">
        ${app.ipProtection ? '🔒 Protegido' : '🌐 Público'}
      </span>
    </div>
  `).join('')}

</body>
</html>
  `;

  res.send(html);
});

// ===== REGISTRAR ROTAS PARA CADA APLICAÇÃO =====
// Ordenar aplicações: paths mais específicos primeiro, raiz por último
const sortedApps = [...config.applications].sort((a, b) => {
  if (a.path === '/') return 1;
  if (b.path === '/') return -1;
  return b.path.length - a.path.length;
});

sortedApps.forEach(appConfig => {
  console.log(`Registering: ${appConfig.path} → ${appConfig.target} (IP Protection: ${appConfig.ipProtection ? 'ON' : 'OFF'})`);

  // Para path raiz (/), criar filtro para evitar capturar paths de outras apps
  if (appConfig.path === '/') {
    const otherPaths = config.applications
      .filter(app => app.path !== '/')
      .map(app => app.path);

    // Função de filtro: retorna false se o path pertence a outra app
    const filterFn = (pathname, req) => {
      const matchesOtherApp = otherPaths.some(path => pathname.startsWith(path));
      return !matchesOtherApp; // Só processa se NÃO for de outra app
    };

    // Adicionar middleware de IP se necessário
    if (appConfig.ipProtection) {
      app.use('/', createIPValidationMiddleware(appConfig.name));
    }

    // Adicionar proxy com filtro
    app.use('/', createApplicationProxy(appConfig, filterFn));
  } else {
    // Para outras apps, registrar normalmente
    if (appConfig.ipProtection) {
      app.use(appConfig.path, createIPValidationMiddleware(appConfig.name));
    }

    app.use(appConfig.path, createApplicationProxy(appConfig));
  }
});

// ===== INICIAR SERVIDOR =====
const server = app.listen(PORT, () => {
  console.log(`\n✅ Gateway rodando na porta ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`❤️  Health check: http://localhost:${PORT}/health\n`);
});

// ===== HANDLER DE WEBSOCKET UPGRADE =====
// Custom upgrade handler to prevent multiple proxies from upgrading the same connection
const proxyServers = new Map(); // Store proxy servers for manual upgrade handling

server.on('upgrade', (req, socket, head) => {
  console.log(`[WS UPGRADE] ${req.url}`);

  // Find the matching application - use sorted apps to match most specific first
  const matchingApp = sortedApps.find(app => req.url.startsWith(app.path));

  if (!matchingApp || !matchingApp.websocket) {
    console.log(`  ❌ No WebSocket-enabled app for: ${req.url}`);
    socket.destroy();
    return;
  }

  console.log(`  → Matched app: ${matchingApp.name}`);

  // IP validation for protected apps via ngrok
  if (matchingApp.ipProtection) {
    const host = req.headers.host || '';

    if (host.includes(config.gateway.ngrokDomain)) {
      const forwardedFor = req.headers['x-forwarded-for'] || '';
      const clientIP = forwardedFor.split(',')[0].trim();

      console.log(`  🔍 WS IP check: ${clientIP}`);

      if (!authorizedIPs.ips.includes(clientIP)) {
        console.log(`  ❌ WS IP BLOCKED: ${clientIP}`);
        socket.destroy();
        return;
      }

      console.log(`  ✅ WS IP authorized`);
    }
  }

  // Get or create proxy server for this app
  const key = `${matchingApp.name}-${matchingApp.target}`;
  if (!proxyServers.has(key)) {
    const proxy = require('http-proxy').createProxyServer({
      target: matchingApp.target,
      ws: true
    });
    proxyServers.set(key, proxy);
  }

  const proxy = proxyServers.get(key);
  console.log(`  ⚡ Upgrading WebSocket: ${matchingApp.name} ${req.url} → ${matchingApp.target}`);

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
