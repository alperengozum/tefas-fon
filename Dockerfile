FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
# HOST="::" (IPv4+IPv6): alpine'de "localhost" önce ::1'e çözülüyor; 0.0.0.0 sadece IPv4 dinlediği için Coolify
# healthcheck'i (wget localhost:4321/healthz) "Connection refused" alıp deploy'u geri alıyordu
ENV NODE_ENV=production HOST=:: PORT=4321
# fon OG görseli (/og/fon/KOD.png): sharp/librsvg SVG metnini sistem fontuyla çizer, alpine'de font yok
RUN apk add --no-cache font-dejavu
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY db ./db
COPY scripts ./scripts
# stopaj bekçisi (scripts/stopaj-watch.mjs, stopaj-sources.mjs) taban tabloyu ve bilinen kararları buradan okur
COPY src/lib/stopaj-rules.mjs ./src/lib/stopaj-rules.mjs
COPY start.sh ./
USER node
EXPOSE 4321
CMD ["sh", "start.sh"]
