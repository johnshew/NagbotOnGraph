# Extensions

* String {d0ac6527-76d0-4eac-af0b-b0155e8ad503} Name NagLast
* String {b07fd8b0-91cb-474d-8b9d-77f435fa4f03} Name NagPreferences
* net.shew.nagbot preferences { currentTimeZone: 'PST'; startOfDay: "10:00", endOfDay: "22:00"  } 


# Work Items
* P0 - Send a Nag with a url like nagbot.shew.net/nag?randomcode or nagbot.shew.net/nag/id where id is the Outlook Task id.
* P0 - Consider expiring these after say a day.  But if you are logged in - which you would be on your phone - then no big deal.  Need to decide.  Maybe id is simplist.
* P1 - Have a way to mark requests as Naggable - for now use Category.
* P1 - Nag Policy - use a "versioned json object".  Start with NagPreference: { nagType: "simple"; timeZoneRelative?: true /* assumes false */ } which is a nag once a week until one week then daily in the morning at 10 am (initially then using preference) then on the day of hourly starting at 10 am (initially)

# Thinking

What is MVP?  
* For MVP set a category.  
* Then login to a bot at least once
* Then send notifications to associated bot channels according to policy.
* To make this more general we need to host the node app so it can work with teams, email, and SMS.
* To get it running while doing coding that means you probably want a stable conversation store.  Could potentially put on a user Open Extension.  How big can a user extension be?





# Interesting

* https://stackoverflow.com/questions/39753969/unable-to-filter-messages-by-recipient-in-microsoft-graph-api-one-or-more-inval
* https://docs.microsoft.com/en-us/previous-versions/office/office-365-api/api/version-2.0/complex-types-for-mail-contacts-calendar#MessageResource

# Important requests

* https://graph.microsoft.com/beta/me/outlook/tasks?$filter=singleValueExtendedProperties/any(ep: ep/id eq 'String {66f5a359-4659-4830-9070-00047ec6ac6f} Name Name'  and ep/value ne null)
* https://graph.microsoft.com/beta/me/outlook/tasks/AQMkADVlODY3OTU0LWVmM2ItNDk0Ny1iMmE5LWM4NjU2ODkxZDRlZABGAAADOck53Xrdekip5VmJ-UgvkQcA8UNYI919NUiSijv182fGeQAAAgESAAAA8UNYI919NUiSijv182fGeQACPjiePgAAAA==?$expand=singleValueExtendedProperties($filter=id eq 'String {66f5a359-4659-4830-9070-00047ec6ac6f} Name Name')
* https://graph.microsoft.com/beta/me/outlook/tasks?$filter=singleValueExtendedProperties/any(ep: ep/id eq 'String {66f5a359-4659-4830-9070-00047ec6ac6f} Name Name'  and ep/value ne null)&$expand=singleValueExtendedProperties($filter=id eq 'String {66f5a359-4659-4830-9070-00047ec6ac6f} Name Name')