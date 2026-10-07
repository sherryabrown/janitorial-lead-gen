FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit
COPY scripts ./scripts
COPY supabase/functions/_shared ./supabase/functions/_shared
RUN node scripts/create-sql-validation-template.mjs
ENV NODE_ENV=production
ENV PORT=8080
USER pwuser
EXPOSE 8080
CMD ["node", "scripts/workflow-server.mjs"]
