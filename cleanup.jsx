app.scriptPreferences.userInteractionLevel = 1699311169;
try { 
  var alerts = app.alerts;
  for (var i = alerts.length - 1; i >= 0; i--) {
    alerts[i].close();
  }
} catch(e) {}
try {
  if (app.documents.length > 0) {
    app.documents[0].close(SaveOptions.NO);
  }
} catch(e) {}
"cleaned up"