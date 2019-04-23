#!/bin/bash
# Current Pre Reqs: Install Azure CLI, then run AZ Login. (az account show) Must be run in WSL or on Linux.
set -x
version=1.0
echo "Nagbot Kube Deployment Version: $version"

#config values
export RgName=nagbotdev
export ClusterName=nagbotcluster
export NodeCount=1

#Provision AKS cluster.
az group create --location=westus2 --name=$RgName
az aks create --resource-group=$RgName --name=$ClusterName --node-count=$NodeCount --generate-ssh-keys
az aks install-cli #(TODO: Implement check to see if we need Kubectl)
az aks get-credentials --resource-group=$RgName --name=$ClusterName

# Set secrets
kubectl create secret generic envfile --from-env-file ./.env
