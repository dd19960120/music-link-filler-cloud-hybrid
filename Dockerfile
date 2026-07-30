FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5280

COPY package.json ./
COPY preview-server.js ./
COPY shared ./shared
COPY web ./web

EXPOSE 5280

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 5280) + '/api/health').then((r) => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1));"

CMD ["node", "preview-server.js"]
