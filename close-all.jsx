app.scriptPreferences.userInteractionLevel = 1699311169;
try {
  while (app.documents.length > 0) {
    app.documents[0].close(SaveOptions.NO);
  }
} catch(e) {}
"closed all docs"