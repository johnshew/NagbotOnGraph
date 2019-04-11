#!/bin/bash
set -x

#config values
export RgName=jtscript17
export ClusterName=jtcluster17
export NodeCount=1

echo cluster-name

#Provision AKS cluster.
az group create --location=westus2 --name=$RgName
az aks create --resource-group=$RgName --name=$ClusterName --node-count=$NodeCount --generate-ssh-keys
az aks install-cli #(TODO: Implement check to see if we need Kubectl)
az aks get-credentials --resource-group=$RgName --name=$ClusterName

#Install Helm (TODO: Implement check to see if we already have helm.)
curl https://raw.githubusercontent.com/helm/helm/master/scripts/get | bash # installs latest because we like to live on the edge.

#Create the service account for tiller on the cluster
kubectl apply -f helm-rbac.yaml

#Init helm
helm init --history-max=200 --service-account=tiller

#Add Weaveworks chart repo.
helm repo add weaveworks https://weaveworks.github.io/flux

#Deploy flux via Helm
helm install --name flux \
--set git.url=git@github.com:jatrott/flux-get-started \
--namespace flux \
weaveworks/flux

#Install fluxCTL
curl -L https://github.com/weaveworks/flux/releases/download/1.12.0/fluxctl_linux_amd64 -o /usr/local/bin/fluxctl
chmod a+x /usr/local/bin/fluxctl

#Inject correct key to flux