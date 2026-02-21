FROM node:18-bullseye-slim

# Instalar dependências vitais do sistema operacional para rodar o Puppeteer/Chromium
RUN apt-get update && apt-get install -y \
    gconf-service libgbm-dev libasound2 libatk1.0-0 libc6 libcairo2 libcups2 \
    libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 \
    libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 \
    libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 \
    libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates \
    fonts-liberation libappindicator1 libnss3 lsb-release xdg-utils wget \
    chromium \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Obrigar o Puppeteer a usar o Chromium do sistema Linux ao invés de baixar um próprio
ENV CHROME_BIN=/usr/bin/chromium

# Configurar o diretório de trabalho do App
WORKDIR /usr/src/app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar Node modules
RUN npm install

# Copiar o resto do código da pasta
COPY . .

# Expor a porta 3001
EXPOSE 3001

# Comando para rodar a aplicação
CMD ["npm", "start"]