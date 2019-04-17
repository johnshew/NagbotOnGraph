#!/bin/bash
# Current Pre Reqs: Install Azure CLI, then run AZ Login. Must be run in WSL or on Linux.
set -x
version=1.0
echo "Nagbot Deployment Version: $version"

#config values
export RgName=nagbotdev
export ClusterName=nagbotcluster
export NodeCount=1

#Provision AKS cluster.
az group create --location=westus2 --name=$RgName
az aks create --resource-group=$RgName --name=$ClusterName --node-count=$NodeCount --generate-ssh-keys
az aks install-cli #(TODO: Implement check to see if we need Kubectl)
az aks get-credentials --resource-group=$RgName --name=$ClusterName

#Deploy flux via YML
kubectl apply -f fluxdeploy

#Install fluxCTL
curl -L https://github.com/weaveworks/flux/releases/download/1.12.0/fluxctl_linux_amd64 -o /usr/local/bin/fluxctl
chmod a+x /usr/local/bin/fluxctl

# The flux identiy key
sleep 30
fluxctl identity