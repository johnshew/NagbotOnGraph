#!/bin/bash
# Current Pre Reqs: Install Azure CLI, then run AZ Login. Must be run in WSL or on Linux.
set -x
version=1.0
echo "Nagbot-Gitops Deployment Version: $version"


#Deploy flux via YML
kubectl apply -f ./deploy/fluxDeploy

#Install fluxCTL
curl -L https://github.com/weaveworks/flux/releases/download/1.12.0/fluxctl_linux_amd64 -o /usr/local/bin/fluxctl
chmod a+x /usr/local/bin/fluxctl

# The flux identiy key
sleep 30
fluxctl identity