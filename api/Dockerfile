FROM node:20.17.0-alpine AS base

WORKDIR /api

RUN apk add --no-cache ffmpeg

COPY package*.json ./

FROM base AS dependencies
RUN npm ci

FROM dependencies AS build
COPY tsconfig*.json ./
COPY src ./src
COPY scripts/copy-openapi.cjs ./scripts/copy-openapi.cjs
RUN npm run build && npm prune --omit=dev

FROM base AS production
ENV NODE_ENV=production
COPY --from=build /api/node_modules ./node_modules
COPY --from=build /api/dist ./dist
CMD ["npm", "start"]

FROM dependencies AS development
COPY . .
CMD ["npm", "run", "dev"]

FROM dependencies AS test
COPY . .
ENV NODE_ENV=test
CMD ["npm", "run", "test"]
