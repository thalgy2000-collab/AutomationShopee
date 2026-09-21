#!/usr/bin/env bash
set -e

echo "============================================================="
echo "🚀 Implantando Central de Automação Shopee na VPS"
echo "============================================================="

# 1. Verifica e instala Docker se não estiver instalado
if ! command -v docker &> /dev/null; then
    echo "📦 Instalando Docker e Docker Compose..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
fi

# 2. Configura arquivo .env se não existir
if [ ! -f .env ]; then
    echo "⚠️  Arquivo .env não encontrado. Criando a partir de .env.example..."
    cp .env.example .env
    echo "👉 Edite o arquivo .env com suas credenciais do Magis5 e chaves Gemini:"
    echo "   nano .env"
    exit 1
fi

# 3. Garante permissões das pastas de persistência
mkdir -p uploads agent1-scraper/downloads agent2-enricher/produtos agent3-rpa-magis5/screenshots

# 4. Build e Start dos containers
echo "🔨 Construindo imagens e iniciando contêineres Docker..."
docker compose down || true
docker compose up -d --build

# 5. Obtém IP público da VPS
PUBLIC_IP=$(curl -s ifconfig.me || hostname -I | awk '{print $1}')

echo ""
echo "============================================================="
echo "✅ Sistema iniciado com sucesso!"
echo "🌐 Acesse o painel em: http://${PUBLIC_IP}:3000"
echo "📊 Logs em tempo real:  docker compose logs -f"
echo "============================================================="
