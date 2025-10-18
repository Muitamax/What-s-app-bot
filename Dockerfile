# Use the official Node.js 18 image as the base image
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

# Install app dependencies
RUN npm install --only=production

# Bundle app source
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Define the command to run the app
CMD [ "node", "src/index.js" ]
