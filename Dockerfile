# CLIENT BUILD
FROM node:22-alpine AS client-build

WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./

RUN npm run build

# SERVER
FROM node:22-alpine

WORKDIR /app/server

COPY server/package*.json ./

RUN npm ci

COPY server/ ./

# APP
WORKDIR /app

COPY --from=client-build /app/client/dist ./client/dist

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "start", "--prefix", "server"]