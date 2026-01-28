# ETAPA 1: Dependențe
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ETAPA 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# --- INJECTARE VARIABILE LA BUILD ---
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WEBSOCKETS_URL
ARG NEXT_PUBLIC_FILE_API
ARG NEXT_PUBLIC_FILE_API_KEY

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WEBSOCKETS_URL=$NEXT_PUBLIC_WEBSOCKETS_URL
ENV NEXT_PUBLIC_FILE_API=$NEXT_PUBLIC_FILE_API
ENV NEXT_PUBLIC_FILE_API_KEY=$NEXT_PUBLIC_FILE_API_KEY
# ------------------------------------

# Creăm build-ul de producție
RUN npm run build

# ETAPA 3: Runner (Producție)
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

CMD ["npm", "start"]