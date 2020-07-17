FROM node:12.17.0-alpine

# set working directory
WORKDIR /app

# install app dependencies
COPY package*.json ./

RUN npm install 

# add app source
COPY . ./

EXPOSE 3000

# start app
CMD ["npm", "start"]
