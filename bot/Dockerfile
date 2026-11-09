FROM node:22-alpine AS dependencies
WORKDIR /bot
RUN apk add --no-cache ffmpeg
COPY bot/package*.json ./
COPY packages/api-client /packages/api-client
RUN npm ci

FROM dependencies AS build
COPY bot/tsconfig.json ./
COPY bot/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS production
ENV NODE_ENV=production
WORKDIR /bot
RUN apk add --no-cache ffmpeg
COPY --from=build --chown=node:node /bot/node_modules ./node_modules
COPY --from=build --chown=node:node /bot/dist ./dist
COPY --from=build --chown=node:node /bot/package.json ./
COPY --from=build --chown=node:node /packages/api-client /packages/api-client
USER node
CMD ["node", "dist/main.js"]

FROM dependencies AS development
COPY . .
CMD ["npm", "run", "dev"]

FROM development AS test
ENV NODE_ENV=test
CMD ["npm", "test"]
