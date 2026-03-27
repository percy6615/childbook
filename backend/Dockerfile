FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

RUN npm install prisma --save-dev

COPY prisma ./prisma
COPY src ./src

RUN npx prisma generate

RUN mkdir -p /app/uploads

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node src/app.js"]
