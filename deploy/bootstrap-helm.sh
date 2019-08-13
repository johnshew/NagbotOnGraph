#!/bin/bash
# Still in dev, may be unreliable.
set -x
version=1.0
echo "Nagbot Telemetry Bootstrap: $version"

#config values
export RgName=myuniquerg3
export ClusterName=myuniquecluster3
export NodeCount=1
export MonitoringNamespace=monitoring
export SpinupWait=60

echo cluster-name

#Provision AKS cluster.
az group create --location=westus2 --name=$RgName
az aks create --resource-group=$RgName --name=$ClusterName --node-count=$NodeCount --generate-ssh-keys
az aks install-cli #(TODO: Implement check to see if we need Kubectl)
az aks get-credentials --resource-group=$RgName --name=$ClusterName

#Enable rights for the dashboard user (TODO: Reduce access level as far as possible from cluster admin for prod.)
kubectl create clusterrolebinding kubernetes-dashboard -n kube-system --clusterrole=cluster-admin --serviceaccount=kube-system:kubernetes-dashboard

#Install Helm (TODO: Implement check to see if we already have helm.)
curl -L https://git.io/get_helm.sh | bash # installs latest because we like to live on the edge.

#Create the service account for tiller on the cluster to allow rbac access.
#(This step MUST be done before helm is init on the cluster with current stable helm)
kubectl apply -f helm-rbac.yaml

#Init helm
helm init --history-max=200 --service-account=tiller

#Clone the helm charts repository
git clone https://github.com/helm/charts.git

#Switch to the chart folder for prometheus stable.
cd charts/stable/prometheus

#Install Prometheus
helm install --name=prometheus . --namespace $MonitoringNamespace --set rbac.create=true

#Switch to the chart folder for grafana stable.
cd ../grafana

#Install Grafana
helm install --name=grafana . --set persistence.enabled=true --set persistence.accessModes={ReadWriteOnce} --set persistence.size=8Gi --namespace monitoring

#return to execution root
cd ../../..
#cleanup charts directory cloned by script.
rm -rf charts
#apply ***DEV*** jaeger yml (TODO: Establish variance with published helm chart)
kubectl create -f ./kube-jaeger-dev.yml

echo "Waiting $SpinupWait seconds for all resources to be ready and running."
sleep $SpinupWait
#export name of the current prometheus pod to env var 'PROMETHEUS_POD_NAME'
#to proxy to local machine for access use: 
#kubectl --namespace monitoring port-forward $PROMETHEUS_POD_NAME 9090
export PROMETHEUS_POD_NAME=$(kubectl get pods --namespace $MonitoringNamespace -l "app=prometheus,component=server" -o jsonpath="{.items[0].metadata.name}")
#Export name of current grafana pod to env var 'GRAFANA_POD_NAME'
#to proxy to local machine for access use: 
#kubectl --namespace monitoring port-forward $GRAFANA_POD_NAME 3000
export GRAFANA_POD_NAME=$(kubectl get pods --namespace monitoring -l "app=grafana,release=grafana" -o jsonpath="{.items[0].metadata.name}")
#export jaeger query service IP to env var
export JAEGER_SERVICE_IP=$(kubectl get services --namespace tracing -l "app.kubernetes.io/component=query" -o jsonpath="{.items[0].spec.clusterIP}")