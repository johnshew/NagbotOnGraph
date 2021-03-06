# MVP 2 - Brainstorming
* Easy signin. With the new URL approach pretty easy to create a URL with a short temp user key along with a shortened URL to signin and connect it.  Later could also send a QR code so no typing required on a mobile phone.  The mobile device is likely logged in or has password stored.
* For the URL - consider having a TTL buffer and use shorter URLs.   Make it easier for sms channel.  
* Do we want an SMS channel - probably better to nag directly using MMS.
* P3 - Bug: if a channel doesn't work - then remove it - longer term wait for a period of time.
* Consider having links that count as a login on that task and expiring them after say a day.  But if you are logged in - which you would be on your phone - then no big deal. 
* Not doing a big office query office every time.  Maybe remember a highwater mark?

# Useful commands
Using serveo.net for testing (needs ssh key)
```
ssh -o ServerAliveInterval=60 -R nagbotlocal-bot.shew.net:80:localhost:3978 -R nagbotlocal.shew.net:80:localhost:8080 serveo.net
```
Docker
```
docker build -t nagbot .
docker run -p 8080:8080 -p 3978:3978 nagbot
```
Kubernetes
```
alias kube=kubectl
echo nag=$(kubectl get pods | grep "nag" | cut -d " " -f1)
kube get logs -l app=nagbot
Kube get logs -l name=flux
```

# Graph

## General programming issues
* [Graph filtering](https://stackoverflow.com/questions/39753969/unable-to-filter-messages-by-recipient-in-microsoft-graph-api-one-or-more-inval)
* [Mail and calendar complex types](https://docs.microsoft.com/en-us/previous-versions/office/office-365-api/api/version-2.0/complex-types-for-mail-contacts-calendar#MessageResource)


## Extension GUIDs
* String {d0ac6527-76d0-4eac-af0b-b0155e8ad503} Name NagLast
* String {b07fd8b0-91cb-474d-8b9d-77f435fa4f03} Name NagPreferences
* net.shew.nagbot preferences { currentTimeZone: 'PST'; startOfDay: "10:00", endOfDay: "22:00"  } 

## Requests for singleValueExtendedProperties

Find all tasks with the Name singleValueExtendedProperty 
```
https://graph.microsoft.com/beta/me/outlook/tasks?$filter=singleValueExtendedProperties/any(ep: ep/id eq 'String {66f5a359-4659-4830-9070-00047ec6ac6f} Name Name'  and ep/value ne null))  
```
Find a task and expand it's Name singleValueExtendedProperty
```
https://graph.microsoft.com/beta/me/outlook/tasks/AQMkADVlODY3OTU0LWVmM2ItNDk0Ny1iMmE5LWM4NjU2ODkxZDRlZABGAAADOck53Xrdekip5VmJ-UgvkQcA8UNYI919NUiSijv182fGeQAAAgESAAAA8UNYI919NUiSijv182fGeQACPjiePgAAAA==?$expand=singleValueExtendedProperties($filter=id eq 'String {66f5a359-4659-4830-9070-00047ec6ac6f} Name Name')>
```

Find and expand all tasks with a non-null signleValueExtendedProperty
```
https://graph.microsoft.com/beta/me/outlook/tasks?$filter=singleValueExtendedProperties/any(ep: ep/id eq 'String {66f5a359-4659-4830-9070-00047ec6ac6f} Name Name'  and ep/value ne null)&$expand=singleValueExtendedProperties($filter=id eq 'String {66f5a359-4659-4830-9070-00047ec6ac6f} Name Name')
```

Test a web request
```
curl -v -H "Content-Type: application/json" --data "{ \"singleValueExtendedProperties\": [ { \"id\": \"String {b07fd8b0-91cb-474d-8b9d-77f435fa4f03} Name NagPreferences\", \"value\":\"{}\" } ] }" -X PATCH http://127.0.0.1:8080/api/v1.0/tasks/AQMkADVlODY3OTU0LWVmM2ItNDk0Ny1iMmE5LWM4NjU2ODkxZDRlZABGAAADOck53Xrdekip5VmJ-UgvkQcA8UNYI919NUiSijv182fGeQAAAgESAAAA8UNYI919NUiSijv182fGeQACPjiePgAAAA== --cookie "userId=9af3afc2170fb95ff519b121df5011c2"
```

