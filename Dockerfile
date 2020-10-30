FROM node:8

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./
COPY start.sh ./
RUN chmod a+rx start.sh
RUN npm install
RUN npm install -g nodemon
# If you are building your code for production
# RUN npm ci --only=production

# Bundle app source
COPY . .

EXPOSE 3000
ENTRYPOINT ["./start.sh"]
