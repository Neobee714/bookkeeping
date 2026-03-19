FROM node:20-slim
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build
RUN ls -la dist/
RUN npm install -g serve
CMD sh -c "serve -s dist -p $PORT"