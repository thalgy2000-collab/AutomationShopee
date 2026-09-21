FROM mcr.microsoft.com/playwright:v1.49.1-noble

WORKDIR /app

# Instala dependências de sistema adicionais
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copia arquivos de dependências para aproveitar o cache do Docker
COPY package.json ./
COPY agent1-scraper/package*.json ./agent1-scraper/
COPY agent2-enricher/package*.json ./agent2-enricher/
COPY agent3-rpa-magis5/package*.json ./agent3-rpa-magis5/

# Instala todas as dependências dos submódulos
RUN cd agent1-scraper && (npm ci || npm install)
RUN cd agent2-enricher && (npm ci || npm install)
RUN cd agent3-rpa-magis5 && (npm ci || npm install)

# Copia todo o código do projeto
COPY . .

# Garante a existência das pastas essenciais para leitura e escrita
RUN mkdir -p uploads agent1-scraper/downloads agent2-enricher/produtos agent3-rpa-magis5/screenshots

# Variáveis padrão
ENV PORT=3000
ENV NODE_ENV=production
ENV HEADLESS=true

EXPOSE 3000

CMD ["node", "agent2-enricher/server.mjs"]
