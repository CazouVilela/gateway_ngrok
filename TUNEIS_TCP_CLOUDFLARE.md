# Túneis TCP - Migração Ngrok → Cloudflare Tunnel

## Diferenças Importantes

### Ngrok TCP (Como era antes)

**Acesso direto** - Ngrok fornece uma porta TCP pública que você conecta diretamente:

```bash
# Exemplo SSH via ngrok
ssh -p 21579 usuario@1.tcp.sa.ngrok.io

# Exemplo PostgreSQL via ngrok
psql -h 1.tcp.sa.ngrok.io -p 20983 -U usuario
```

**Vantagens**:
- ✅ Acesso direto (não precisa instalar nada no cliente)
- ✅ Funciona com qualquer aplicação TCP

**Desvantagens**:
- ❌ URL muda frequentemente (porta aleatória)
- ❌ Domínio genérico ngrok.io (sem personalização)

---

### Cloudflare Tunnel TCP (Como é agora)

**Acesso via proxy** - Requer cliente `cloudflared` instalado para criar um túnel local:

```bash
# Exemplo SSH via Cloudflare
cloudflared access tcp --hostname ssh.sistema.cloud --url localhost:2222
# Em outro terminal:
ssh -p 2222 usuario@localhost

# Exemplo PostgreSQL via Cloudflare
cloudflared access tcp --hostname postgres.sistema.cloud --url localhost:5432
psql -h localhost -p 5432 -U usuario
```

**Vantagens**:
- ✅ URLs permanentes (ssh.sistema.cloud)
- ✅ Subdomínios personalizados
- ✅ 100% gratuito (sem limites)
- ✅ Criptografia automática
- ✅ Suporte a políticas de acesso (Zero Trust)

**Desvantagens**:
- ❌ Requer `cloudflared` instalado no cliente
- ❌ Mais complexo (2 passos ao invés de 1)

---

## Túneis TCP Configurados

| Serviço | Subdomínio | Porta Local | Ngrok Antigo |
|---------|-----------|-------------|--------------|
| **SSH** | ssh.sistema.cloud | 2222 | tcp://1.tcp.sa.ngrok.io:21579 |
| **PostgreSQL** | postgres.sistema.cloud | 5432 | tcp://1.tcp.sa.ngrok.io:20983 |
| **NoMachine** | nomachine.sistema.cloud | 4000 | tcp://1.tcp.sa.ngrok.io:20997 |

---

## Como Usar (Cliente)

### Instalação do cloudflared (Uma vez)

**Linux**:
```bash
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
```

**macOS**:
```bash
brew install cloudflared
```

**Windows**:
```powershell
winget install Cloudflare.cloudflared
```

---

### Método 1: Comando Manual (Simples)

#### SSH
```bash
# Terminal 1: Criar túnel local
cloudflared access tcp --hostname ssh.sistema.cloud --url localhost:2222

# Terminal 2: Conectar via SSH
ssh -p 2222 usuario@localhost
```

#### PostgreSQL
```bash
# Terminal 1: Criar túnel local
cloudflared access tcp --hostname postgres.sistema.cloud --url localhost:5432

# Terminal 2: Conectar ao banco
psql -h localhost -p 5432 -U postgres -d nome_banco
```

#### NoMachine
```bash
# Terminal 1: Criar túnel local
cloudflared access tcp --hostname nomachine.sistema.cloud --url localhost:4000

# Aplicativo NoMachine: Conectar em localhost:4000
```

---

### Método 2: SSH Config (Recomendado - Automático)

Adicione no arquivo `~/.ssh/config`:

```ssh-config
# SSH via Cloudflare Tunnel (automático)
Host ssh.sistema.cloud
  ProxyCommand cloudflared access tcp --hostname %h
  User seu_usuario
  Port 2222

# Pode criar alias também
Host meu-servidor
  HostName ssh.sistema.cloud
  ProxyCommand cloudflared access tcp --hostname %h
  User seu_usuario
  Port 2222
```

Depois, conecte simplesmente:
```bash
ssh ssh.sistema.cloud
# ou
ssh meu-servidor
```

O `cloudflared` será chamado automaticamente!

---

### Método 3: Túnel Persistente (Background)

Para manter o túnel sempre aberto:

```bash
# SSH
cloudflared access tcp --hostname ssh.sistema.cloud --url localhost:2222 &

# PostgreSQL
cloudflared access tcp --hostname postgres.sistema.cloud --url localhost:5432 &

# Agora pode usar localhost:2222 e localhost:5432 normalmente
```

Para desconectar:
```bash
pkill -f cloudflared
```

---

## Configuração do Servidor (Já feito)

### Arquivo: `~/.cloudflared/config.yml`

```yaml
ingress:
  # SSH (porta customizada 2222)
  - hostname: ssh.sistema.cloud
    service: tcp://localhost:2222

  # PostgreSQL Database
  - hostname: postgres.sistema.cloud
    service: tcp://localhost:5432

  # NoMachine Remote Desktop
  - hostname: nomachine.sistema.cloud
    service: tcp://localhost:4000
```

### Registros DNS Criados

```bash
cloudflared tunnel route dns a986fd02-432d-42e7-832c-b20f483417ff ssh.sistema.cloud
cloudflared tunnel route dns a986fd02-432d-42e7-832c-b20f483417ff postgres.sistema.cloud
cloudflared tunnel route dns a986fd02-432d-42e7-832c-b20f583417ff nomachine.sistema.cloud
```

---

## Comparação: Antes vs Depois

### Antes (Ngrok)
```bash
# SSH
ssh -p 21579 usuario@1.tcp.sa.ngrok.io

# PostgreSQL
psql -h 1.tcp.sa.ngrok.io -p 20983 -U postgres
```

**Problema**: URL e porta mudam toda vez que reinicia ngrok

---

### Depois (Cloudflare)
```bash
# SSH (método manual)
cloudflared access tcp --hostname ssh.sistema.cloud --url localhost:2222
ssh -p 2222 usuario@localhost

# SSH (método automático com ~/.ssh/config)
ssh ssh.sistema.cloud
```

**Vantagem**: URL permanente (ssh.sistema.cloud)

---

## Segurança Adicional (Opcional)

### Cloudflare Access - Autenticação Zero Trust

Você pode adicionar autenticação obrigatória (email, Google, etc) antes de permitir acesso ao túnel:

```bash
# Configurar acesso protegido
cloudflared tunnel access add ssh.sistema.cloud \
  --email seu-email@gmail.com
```

Assim, qualquer tentativa de conexão pede login no navegador primeiro.

---

## Troubleshooting

### Erro: "cloudflared: command not found"
**Solução**: Instale o cloudflared (ver seção Instalação)

### Erro: "tunnel connection refused"
**Solução**: Verifique se o serviço está rodando no servidor:
```bash
systemctl status cloudflared
```

### SSH funciona mas PostgreSQL não
**Solução**: Verifique se PostgreSQL aceita conexões locais:
```bash
# No servidor
ss -tlnp | grep :5432
```

---

## Rollback para Ngrok (Se Necessário)

Se precisar voltar para ngrok temporariamente:

```bash
# Iniciar ngrok com config antiga
sudo systemctl start ngrok-consolidado

# Ver URLs geradas
curl http://localhost:4040/api/tunnels | jq '.tunnels[] | {name, public_url}'
```

---

## Links Úteis

- **Cloudflared Docs**: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/
- **SSH via Cloudflare**: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/use-cases/ssh/
- **Cloudflare Zero Trust**: https://one.dash.cloudflare.com/

---

**Data**: 2025-11-09
**Status**: ✅ Configurado (aguardando testes)
