# GATEWAY LOCAL - Memória do Projeto

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

---

<!-- CHAPTER: 1 Visão Geral -->

## Visão Geral

**Projeto descontinuado** em favor da **Arquitetura Híbrida** (Cloudflare + Ngrok).

Este projeto era um gateway Node.js para rotear tráfego ngrok, mas foi **substituído pela combinação de Cloudflare Tunnel (HTTP/HTTPS) + Ngrok TCP** em 2025-11-09.

**Status atual**: 📦 Arquivado (mantido para referência histórica)

**Migração**: Ver [MIGRACAO_CLOUDFLARE.md](../MIGRACAO_CLOUDFLARE.md)

---

<!-- CHAPTER: 2 Arquitetura Atual (Híbrida - Cloudflare + Ngrok) -->

## Arquitetura Atual (Híbrida)

### Melhor dos Dois Mundos

Combinamos **Cloudflare Tunnel** (HTTP/HTTPS) com **Ngrok TCP** para obter:
- ✅ Performance máxima em aplicações web (67% mais rápido)
- ✅ Acesso TCP direto sem instalar nada no cliente
- ✅ URLs permanentes para ambos
- ✅ **100% gratuito**

---

### Cloudflare Tunnel (HTTP/HTTPS) - 7 Aplicações Web

```
Internet → Cloudflare Tunnel → Aplicações Web (localhost)
```

| Aplicação | URL | Porta | Performance |
|-----------|-----|-------|-------------|
| RPO Hub API | https://rpo-api.sistema.cloud | 6000 | ~115ms ⚡ |
| Metabase | https://metabase.sistema.cloud | 3000 | Rápido ⚡ |
| Airbyte | https://airbyte.sistema.cloud | 8000 | Rápido ⚡ |
| Grafana | https://grafana.sistema.cloud | 3002 | Rápido ⚡ |
| Épica Frontend | https://epica.sistema.cloud | 5000 | Rápido ⚡ |
| Épica Backend | https://epica-api.sistema.cloud | 5001 | Rápido ⚡ |
| IDE Customizada | https://ide.sistema.cloud | 3780 | Rápido ⚡ |

**Vantagens**:
- 🚀 67% mais rápido que ngrok (~115ms vs ~350ms)
- 🔒 SSL automático
- ♾️ Gratuito ilimitado
- 🌐 URLs permanentes

**Serviço**: `cloudflared.service` (systemd)

---

### Ngrok TCP - 3 Túneis de Acesso Direto

```
Cliente (qualquer máquina) → Ngrok TCP → Serviço (localhost)
```

| Serviço | URL Pública | Porta Local | Uso |
|---------|-------------|-------------|-----|
| PostgreSQL | tcp://1.tcp.sa.ngrok.io:20983 | 5432 | pgAdmin, DBeaver, psql |
| SSH | tcp://1.tcp.sa.ngrok.io:21579 | 2222 | Terminal SSH |
| NoMachine | tcp://1.tcp.sa.ngrok.io:20997 | 4000 | Remote Desktop |

**Vantagens**:
- ✅ Acesso direto (sem instalar nada no cliente)
- ✅ Funciona de qualquer máquina
- ✅ Configuração simples (IP:porta)
- ✅ Gratuito para 3 túneis TCP

**Serviço**: `ngrok-consolidado.service` (systemd)

**Como usar**:
```bash
# PostgreSQL (de qualquer máquina)
pgAdmin: Host = 1.tcp.sa.ngrok.io, Port = 20983

# SSH (de qualquer máquina)
ssh -p 21579 usuario@1.tcp.sa.ngrok.io

# NoMachine (de qualquer máquina)
Host = 1.tcp.sa.ngrok.io, Port = 20997
```

---

<!-- CHAPTER: 3 Por Que Arquitetura Híbrida? -->

## Por Que Arquitetura Híbrida?

### Cloudflare TCP Foi Descartado

**Problema identificado** (2025-11-09 15:35):

Cloudflare Tunnel TCP **requer cloudflared instalado no cliente**:

```bash
# Cliente PRECISA rodar:
cloudflared access tcp --hostname postgres.sistema.cloud --url localhost:15432

# Depois conectar em localhost
pgAdmin: localhost:15432
```

**Limitações**:
- ❌ Precisa instalar cloudflared em cada máquina cliente
- ❌ Precisa rodar comando antes de conectar
- ❌ Não funciona de qualquer lugar
- ❌ Complexo para usuários finais

**Ngrok TCP é superior para acesso direto**:
- ✅ Acesso direto: `1.tcp.sa.ngrok.io:20983`
- ✅ Zero instalação no cliente
- ✅ Funciona de qualquer máquina
- ✅ Simples de usar

### Decisão Final

| Tipo | Solução | Motivo |
|------|---------|--------|
| **HTTP/HTTPS** | Cloudflare | 67% mais rápido, URLs permanentes |
| **TCP** | Ngrok | Acesso direto sem cliente |

---

<!-- CHAPTER: 4 Problemas Resolvidos -->

## Problemas Resolvidos na Migração

### 1. Airbyte - Pods em Restart Loop (2025-11-09 15:00)

**Sintoma**: Erro `connection reset by peer` nos logs do Cloudflare

**Causa**: Pods do Kubernetes estavam se recuperando após reboot do sistema

**Solução**: **Nenhuma intervenção necessária** - recuperação automática em ~10 minutos

**Status**: ✅ Resolvido automaticamente

**Lição**: Airbyte leva alguns minutos para estabilizar após reboot (comportamento normal do Kubernetes)

### 2. Metabase - Connection Refused PostgreSQL (2025-11-09 15:10)

**Sintoma**: `Connection to host.docker.internal:5432 refused`

**Causa**: PostgreSQL escutando apenas em `127.0.0.1`, mas Metabase em container Docker

**Solução**: Script `/tmp/corrigir_metabase_postgres.sh`
- Configurou `listen_addresses = 'localhost,172.17.0.1'`
- Adicionou regra `pg_hba.conf` para rede Docker (172.17.0.0/16)
- Reiniciou PostgreSQL e container Metabase

**Status**: ✅ Resolvido em 2025-11-09 15:11

**Script de correção**: `/tmp/corrigir_metabase_postgres.sh` (executado com sucesso)

### 3. Cloudflare TCP Limitação (2025-11-09 15:35)

**Sintoma**: PostgreSQL via Cloudflare requer cloudflared no cliente

**Causa**: Arquitetura do Cloudflare Tunnel TCP (não é acesso direto)

**Solução**: **Manter Ngrok para TCP** (arquitetura híbrida)

**Status**: ✅ Resolvido com arquitetura híbrida

**Lição**: Cloudflare excelente para HTTP/HTTPS, mas Ngrok superior para TCP direto

---

<!-- CHAPTER: 5 Serviços Ativos -->

## Serviços Ativos

### Serviços Systemd

```bash
# Túnel Cloudflare (HTTP/HTTPS)
systemctl status cloudflared

# Túnel Ngrok (TCP)
systemctl status ngrok-consolidado

# Aplicações
systemctl status ide-customizada       # IDE (porta 3780)
systemctl status epica-frontend        # Épica frontend (porta 5000)
systemctl status epica-backend         # Épica backend (porta 5001)
systemctl status grafana-server        # Grafana (porta 3002)
systemctl status rpo-api               # RPO API (porta 6000)
systemctl status postgresql-17         # PostgreSQL (porta 5432)
```

### Containers Docker

```bash
docker ps | grep metabase              # Metabase (porta 3000)
```

### Kubernetes/Kind (Airbyte)

```bash
kubectl get pods -n airbyte            # Pods do Airbyte
kubectl get svc -n airbyte             # Serviços (NodePort 30000→8000)
```

**Airbyte**: Rodando via Kind (Kubernetes local)
- NodePort `30000` mapeado para porta `8000` do host
- Container `airbyte-control-plane` faz o mapeamento: `0.0.0.0:8000->30000/tcp`

---

<!-- CHAPTER: 6 Portas em Uso -->

## Portas em Uso

| Porta | Serviço | Tipo | Status |
|-------|---------|------|--------|
| 3000 | Metabase | Container Docker | ✅ Ativo |
| 3002 | Grafana | Systemd | ✅ Ativo |
| 3780 | IDE Customizada | Systemd | ✅ Ativo |
| 5000 | Épica Frontend | Systemd | ✅ Ativo |
| 5001 | Épica Backend | Systemd | ✅ Ativo |
| 5432 | PostgreSQL 17 | Systemd | ✅ Ativo |
| 6000 | RPO Hub API | Systemd | ✅ Ativo |
| 8000 | Airbyte | Kubernetes (NodePort 30000) | ✅ Ativo |

**Portas descontinuadas**:
- ~~8079~~ - Gateway Node.js antigo (descontinuado)
- ~~9000~~ - Nginx antigo (descontinuado)

---

<!-- CHAPTER: 7 Configurações -->

## Configurações

### Cloudflare Tunnel

**Arquivo**: `~/.cloudflared/config.yml`

```yaml
tunnel: a986fd02-432d-42e7-832c-b20f483417ff
credentials-file: /home/cazouvilela/.cloudflared/a986fd02-432d-42e7-832c-b20f483417ff.json

ingress:
  - hostname: rpo-api.sistema.cloud
    service: http://localhost:6000
  - hostname: metabase.sistema.cloud
    service: http://localhost:3000
  - hostname: airbyte.sistema.cloud
    service: http://localhost:8000
  - hostname: grafana.sistema.cloud
    service: http://localhost:3002
  - hostname: epica.sistema.cloud
    service: http://localhost:5000
  - hostname: epica-api.sistema.cloud
    service: http://localhost:5001
  - hostname: ide.sistema.cloud
    service: http://localhost:3780
  - service: http_status:404
```

**Comandos úteis**:
```bash
systemctl status cloudflared
journalctl -u cloudflared -f
sudo systemctl restart cloudflared
```

---

### Ngrok TCP

**Arquivo**: `~/.config/ngrok/ngrok.yml`

```yaml
version: 2
authtoken: 2vHAVcubxxPAxlrX4aFvaiARSbe_6bH6CqGS1cdtF27Bj2MYK
region: us

tunnels:
  postgresql:
    proto: tcp
    addr: 5432
    remote_addr: 1.tcp.sa.ngrok.io:20983

  ssh:
    proto: tcp
    addr: 2222
    remote_addr: 1.tcp.sa.ngrok.io:21579

  nomachine:
    proto: tcp
    addr: 4000
    remote_addr: 1.tcp.sa.ngrok.io:20997
```

**Comandos úteis**:
```bash
systemctl status ngrok-consolidado
journalctl -u ngrok-consolidado -f
curl http://localhost:4040/api/tunnels | jq  # Ver URLs ativas
```

---

<!-- CHAPTER: 8 Performance -->

## Performance - Cloudflare vs Ngrok

### Teste HTTP POST (RPO Hub API)

**Cloudflare Tunnel**:
- Latência média: ~115ms
- Mínima: 104ms
- Máxima: 132ms
- Execução API (Valkey): 0-10ms

**Ngrok HTTP (anterior)**:
- Latência média: ~350ms

**Melhoria**: 🚀 **67% mais rápido** (de 350ms para 115ms)

### Características Técnicas

**Cloudflare**:
- Protocolo: QUIC (mais eficiente que HTTP/2)
- SSL: Automático via Cloudflare (modo Flexible)
- Conexões: 4 redundantes (gig02, gig09, gig10, gig11)
- DNS: Propagação instantânea
- Custo: $0.00 (100% gratuito ilimitado)

**Ngrok TCP**:
- Protocolo: TCP direto
- Conexões: Acesso direto sem proxy
- URLs: tcp://1.tcp.sa.ngrok.io:porta
- Custo: $0.00 (até 3 túneis TCP)

---

<!-- CHAPTER: 9 Migração Apps Script -->

## Migração Apps Script (RPO-V4)

### Arquivos Alterados

1. `SETUP/setup_StatusAPI.gs`:
   - **Antes**: `https://sistemas.ngrok.io/rpo-api`
   - **Depois**: `https://rpo-api.sistema.cloud`

2. `EFEITOS/EFEITO_atualiza_campos_candidatos_historico_API.gs`:
   - **Antes**: `https://sistemas.ngrok.io/rpo-api`
   - **Depois**: `https://rpo-api.sistema.cloud`

3. `EFEITOS/HELPERS_GERAIS_GATILHOS_EFEITOS.gs`:
   - **Antes**: `https://sistemas.ngrok.io/rpo-api`
   - **Depois**: `https://rpo-api.sistema.cloud`

**Status**: ✅ Migrado e em produção desde 2025-11-09

---

<!-- CHAPTER: 10 Arquitetura Antiga (Histórico) -->

## Arquitetura Antiga (Histórico)

**⚠️ Esta seção é apenas para referência histórica. A arquitetura abaixo foi descontinuada.**

### Fluxo Antigo (Descontinuado)
```
Internet
   ↓
ngrok (sistemas.ngrok.io) [Latência: ~200ms]
   ↓
Gateway Node.js (porta 9000) [Latência: +150ms]
   ↓
Aplicação Local (localhost:porta)
```

**Total de latência**: ~350ms

**Problemas**:
- ❌ Alta latência (2 camadas)
- ❌ URL ngrok mudava frequentemente
- ❌ Complexidade (gateway + nginx + ngrok)
- ❌ Configuração manual de paths (`/metabase`, `/grafana`, etc)
- ❌ Necessidade de pathRewrite e customizações por app

### Gateway Node.js (Descontinuado)

**Localização**: `/home/cazouvilela/projetos/gateway_local/gateway.js`
**Configuração**: `config.json`
**Status**: 📦 Arquivado

**Funcionalidades que tinha**:
- Roteamento por path (`/metabase` → porta 3000)
- Validação de IP opcional
- Suporte WebSocket
- Path rewriting
- Tipo "static-proxy" para apps React

**Por que foi descontinuado**:
- Cloudflare Tunnel faz tudo isso melhor e mais rápido
- Subdomínios são mais simples que paths
- Nenhuma configuração necessária nas aplicações
- Performance superior

---

<!-- CHAPTER: 11 Documentação Adicional -->

## Documentação Adicional

**Arquivos importantes**:
- [MIGRACAO_CLOUDFLARE.md](../MIGRACAO_CLOUDFLARE.md) - Documentação completa da migração
- [TUNEIS_TCP_CLOUDFLARE.md](../TUNEIS_TCP_CLOUDFLARE.md) - Tentativa de TCP no Cloudflare (descartada)
- `/tmp/CLOUDFLARE_VS_NGROK_TCP.md` - Comparação detalhada
- `/tmp/corrigir_metabase_postgres.sh` - Script de correção do PostgreSQL
- `~/.cloudflared/config.yml` - Configuração do túnel Cloudflare
- `~/.config/ngrok/ngrok.yml` - Configuração do túnel Ngrok

**Cloudflare Dashboard**: https://dash.cloudflare.com
**Domínio**: `sistema.cloud`
**Tunnel ID**: `a986fd02-432d-42e7-832c-b20f483417ff`

**Ngrok Dashboard**: https://dashboard.ngrok.com
**Túneis TCP**: PostgreSQL, SSH, NoMachine

---

<!-- CHAPTER: 12 Histórico de Mudanças -->

## Histórico de Mudanças

### 2025-11-09 15:40 - Arquitetura Híbrida Implementada
- ✅ Removidos túneis TCP do Cloudflare (limitação de acesso direto)
- ✅ Mantido Ngrok apenas para TCP (PostgreSQL, SSH, NoMachine)
- ✅ Removido túnel HTTP do Ngrok (migrado para Cloudflare)
- ✅ Arquitetura híbrida: Cloudflare (HTTP) + Ngrok (TCP)
- ✅ 100% funcional e gratuito

### 2025-11-09 15:11 - Metabase Corrigido
- ✅ Corrigido acesso PostgreSQL para container Docker
- ✅ Script `/tmp/corrigir_metabase_postgres.sh` executado com sucesso
- ✅ Metabase funcionando via https://metabase.sistema.cloud

### 2025-11-09 15:05 - Airbyte Estabilizado
- ✅ Pods Kubernetes recuperados automaticamente após reboot
- ✅ Airbyte funcionando via https://airbyte.sistema.cloud
- ℹ️ Nenhuma intervenção manual necessária

### 2025-11-09 14:56 - Cloudflare Tunnel Ativado
- ✅ Cloudflare Tunnel configurado como serviço systemd
- ✅ 7 subdomínios criados e testados
- ✅ Túnel rodando com 4 conexões redundantes

### 2025-11-09 13:00 - Início da Migração
- 📝 Documentação criada: MIGRACAO_CLOUDFLARE.md
- 🧪 Testes de performance realizados
- 🚀 Performance: 67% mais rápido que ngrok

### 2025-11-03 - Gateway Node.js (Última Versão)
- Versão final do gateway antes da migração
- Todas as apps funcionando (Airbyte, Grafana, Metabase, Épica, IDE, RPO)
- Arquitetura complexa: ngrok → nginx → gateway → apps

---

**Última Atualização**: 2025-11-09 15:40
**Versão**: Arquitetura Híbrida 1.0
**Status**: ✅ Em produção (7 apps HTTP + 3 túneis TCP funcionando)
