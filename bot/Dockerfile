FROM node:22-alpine AS dependencies
WORKDIR /bot
COPY package*.json ./
RUN npm ci

FROM dependencies AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS production
ENV NODE_ENV=production
WORKDIR /bot
COPY --from=build --chown=node:node /bot/node_modules ./node_modules
COPY --from=build --chown=node:node /bot/dist ./dist
COPY --chown=node:node package.json ./
USER node
CMD ["node", "dist/main.js"]

FROM dependencies AS development
COPY . .
CMD ["npm", "run", "dev"]

FROM development AS test
ENV NODE_ENV=test
CMD ["npm", "test"]
