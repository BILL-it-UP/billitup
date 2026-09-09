FROM node:22-alpine

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=4000
ENV BILLITUP_DB_PATH=/app/data/billitup.sqlite
VOLUME ["/app/data"]

EXPOSE 4000
CMD ["node", "src/index.js"]
