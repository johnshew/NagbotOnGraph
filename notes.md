 # MVP

* The notification contains a URL that leads to the web app - where we assume the user is logged in - that shows the task. (P0)
  * What to do about channels: Teams doesn't support markdown, right?  But it does support cards with links. SMS doesn't support anything.  Mail supports markdown
* The user mark can mark the task as complete.  This should immediately save and you can also click again to mark it not complete (P0)
* Do work in branch and PR into main.
* Add a test suite.

# Consider
* For the URL - consider having a TTL buffer and use shorter URLs.   Make it easier for sms channel.  
* Do we want an SMS channel - probably better to nag directly using MMS.
* Do we want to put the conversations into Monngo - see ConversationManager2 in conversations.ts

# MVP completed

* User sets a category (not needed initially on test account) (done)
* Then login to at least one bot and signin. (done)
* Then for "nag marked" incomplete tasks send notifications to associated bot channels. (done)
* Need a simple policy and last nag time.
* To get it running while doing coding that means you probably want a stable conversation store.  (done)
* Maybe put this data on a user Open Extension.  How big can a user extension be? (done)


# Work Items

* P1 - Send a Nag with a url to nagbot.shew.net/xxx/oid/taskid where id is the Outlook Task id and show UX on that task.
* P2 - Mark complete.
* P2 - Host in the cloud.
* P2 - Reattach LUIS
* P3 - Multiple Nag Policies.
  * Maybe use a "versioned json object".  
  * Start with NagPreference: { nagType: "simple"; timeZoneRelative?: true /* assumes false */ } 
  * This would  nag once a week until one week then daily in the morning at 10 am (initially then using preference) then on the day of hourly starting at 10 am (initially)
* P3 - Bug: if a channel doesn't work - then remove it - longer term wait for a period of time.
* P3 - Use nagbot to mark a conversation as persisted for notifications
* P3 - Basic task edit.

# Work items recently completed

* P0 - for a given user, store their channels in an open extension. (done)
* P0 - Load persisted conversations at start (done)
* P1 - For "nag marked" incomplete tasks send notifications to associated bot channels according to policy with a simple policy and last nag time.  (done)
* P1 - api/v1.0/tasks/id - returns json for task - (done)
* P2 - Store userKey to oid map more persistently. (done)
* P3 - Factored interfaces for User. (done)
* P3 - Have a way show all tasks to mark requests as Naggable - for now use Category. (done)

# Useful

* ssh -R 80:localhost:3978 serveo.net
* <https://stackoverflow.com/questions/39753969/unable-to-filter-messages-by-recipient-in-microsoft-graph-api-one-or-more-inval>
* <https://docs.microsoft.com/en-us/previous-versions/office/office-365-api/api/version-2.0/complex-types-for-mail-contacts-calendar#MessageResource>

# Futures 

* UX.  Need one.  Wonder about resurrecting the React Office work.
* UX and data model.  Would be nice to have auto-updating local data - Graph delta queries?  Simplest in the short term is just to get JSON data structures every time.
* Easy signin. With the new URL approach pretty easy to create a URL with a short temp user key along with a shortened URL to signin and connect it.  Later could also send a QR code so no typing required on a mobile phone.  The mobile device is likely logged in or has password stored.
* Consider having links that count as a login on that task and expiring them after say a day.  But if you are logged in - which you would be on your phone - then no big deal. 


# Extensions

* String {d0ac6527-76d0-4eac-af0b-b0155e8ad503} Name NagLast
* String {b07fd8b0-91cb-474d-8b9d-77f435fa4f03} Name NagPreferences
* net.shew.nagbot preferences { currentTimeZone: 'PST'; startOfDay: "10:00", endOfDay: "22:00"  } 

# Important requests

* <https://graph.microsoft.com/beta/me/outlook/tasks?$filter=singleValueExtendedProperties/any(ep: ep/id eq 'String {66f5a359-4659-4830-9070-00047ec6ac6f} Name Name'  and ep/value ne null)>

* <https://graph.microsoft.com/beta/me/outlook/tasks/AQMkADVlODY3OTU0LWVmM2ItNDk0Ny1iMmE5LWM4NjU2ODkxZDRlZABGAAADOck53Xrdekip5VmJ-UgvkQcA8UNYI919NUiSijv182fGeQAAAgESAAAA8UNYI919NUiSijv182fGeQACPjiePgAAAA==?$expand=singleValueExtendedProperties($filter=id eq 'String {66f5a359-4659-4830-9070-00047ec6ac6f} Name Name')>

* <https://graph.microsoft.com/beta/me/outlook/tasks?$filter=singleValueExtendedProperties/any(ep: ep/id eq 'String {66f5a359-4659-4830-9070-00047ec6ac6f} Name Name'  and ep/value ne null)&$expand=singleValueExtendedProperties($filter=id eq 'String {66f5a359-4659-4830-9070-00047ec6ac6f} Name Name')>


* curl -v -H "Content-Type: application/json" --data "{ \"singleValueExtendedProperties\": [ { \"id\": \"String {b07fd8b0-91cb-474d-8b9d-77f435fa4f03} Name NagPreferences\", \"value\":\"{}\" } ] }" -X PATCH http://127.0.0.1:8080/api/v1.0/tasks/AQMkADVlODY3OTU0LWVmM2ItNDk0Ny1iMmE5LWM4NjU2ODkxZDRlZABGAAADOck53Xrdekip5VmJ-UgvkQcA8UNYI919NUiSijv182fGeQAAAgESAAAA8UNYI919NUiSijv182fGeQACPjiePgAAAA== --cookie "userId=9af3afc2170fb95ff519b121df5011c2"
