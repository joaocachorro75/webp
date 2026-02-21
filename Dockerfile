# WebPlayer Xtream API - Dockerfile
FROM node:20-alpine

# Instalar dependências necessárias
RUN apk add --no-cache python3 make g++ sqlite sqlite-dev

WORKDIR /app

# Copiar package.json
COPY package*.json ./
COPY package-lock.json ./

# Instalar dependências (incluindo devDependencies para tsx)
RUN npm ci

# Copiar código fonte
COPY . .

# Build do frontend
RUN npm run build

# Criar diretório de dados persistente
RUN mkdir -p /data

# Volume para dados persistentes (servidores e sessões)
VOLUME /data

# Porta 80 (padrão EasyPanel)
EXPOSE 80

# Variáveis de ambiente
ENV NODE_ENV=production
ENV PORT=80
ENV ADMIN_PASSWORD=admin
ENV DATA_DIR=/data

# Iniciar servidor com tsx
CMD ["npx", "tsx", "server.ts"]
