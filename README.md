# NagbotOnGraph

A conversational agent to drive task follow up.

This is indended to operate demonstrate what would be involved in connecting an app to the Microsoft graph.

In terms of approach, we minimized the use of frameworks and middleware that obscure the execution and operations of the solutions.  

Key technologies used include:
* Node and Typescript - main app logic
* Restify - lightweight node web and web API server
* Jest - unit testing
* Mongo client - to Azure CosmosDB for persistent store for user records
* Azure AD -  user login and access to Microsoft Graph
* Microsoft Graph Tasks API -  user tasks
* Microsoft Graph Extensions - user and task appliation specific data
* Azure Bot Framework - messaging integration Microsoft teams, email, and other channels
* Microsoft LUIS - natural language understanding
* Kubernetes - reliable operations 
* Prometheus - app and execution metrics

The core application solution should run well on any modern cloud provider with Kubernetes and it will integrate with the above cloud services.

Currently the app is hosted on Azure and is available at http://nagbot.vivitap.com. 

We also leverage Azure Montioring for cluster health monitoring and alerting.

## Getting started

To get started you will need to have:
* A bot configured on Azure
* A LUIS app and model for NLP
* A Mongo database

With this in place:
* Create a .env file containing important keys the application will use
* Start the application and run it locally

These steps are covered here a bit more detail.

### Configure the Bot and LUIS services

Instructions on creating a bot and luis applications are here:  `!!! TODO`

You will need to config your Bot enpoints to support the API and login directs.

For the login redirects you will neet to add http://localhost:8080 to test locally.

For the bot API you will need to configure it to http://localhost:3978 to test locally.

### Instantiate a Mongo database

For testing locally it is very easy to configure a mongodb container and run it on docker.  No special setup needs to be done and the app will create the database on starup.

Various options exist for hosted Mongo DB solutions - we are currently using Azure CosmosDB.

### Create the .env file

Create an .evn file with the following keys:

```Shell
mongoConnection=mongodb://{your mongo connection}
appId={Azure AD app id}
appPassword={Azure app password}
luisId={ LUIS app id }
luisKey={ LUIS }
```

### Run the app

With the preliminaries about out of the way you should be able to run the app

```Shell
npm start
```

The app will listen on http://localhost:8080.


# Deploying and running the application on Kubernetes 

For deployment to Kubernetes you can use the `deploy/kubeDeploy` directory.  

Also in the `deploy/` directory you will find a `fluxDeploy/` to enable git ops and various optional scripts to config the Kubernetes environment.

To use the gitops approach you will need to add a flux deployment key to your github repository.  See teh `deploy-gitops.sh` script for the details.

# Contributions

We welcome contributions but response time will be very slow.

See the [Contributor Guide](./.github/contibuting.md)

# Code of Conduct

See the [Code of Conduct Guide](./.github/CODE_OF_CONDUCT.md)

# Additional notes

[Notes](./notes.md)
