# WebPlayer Xtream API - Dockerfile
FROM node:20-alpine

# Instalar dependências necessárias para better-sqlite3 e TypeScript
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

# Criar banco de dados
RUN touch xtream.db

# Porta 80 (padrão EasyPanel)
EXPOSE 80

# Variáveis de ambiente
ENV NODE_ENV=production
ENV PORT=80
ENV ADMIN_PASSWORD=admin

# Iniciar servidor com tsx
CMD ["npx", "tsx", "server.ts"]
