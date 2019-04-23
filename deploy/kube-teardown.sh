#!/bin/bash
# Current Pre Reqs: Install Azure CLI, then run AZ Login. Must be run in WSL or on Linux.
set -x
version=1.0
echo "Nagbot Kube Teardown Version: $version"

#config values
export RgName=nagbotdev
export ClusterName=nagbotcluster
export NodeCount=1

#Provision AKS cluster.
kubectl delete deployment nagbot-deployment
kubectl delete service nagbot-service

#Provision AKS cluster.
az group delete --name=$RgName