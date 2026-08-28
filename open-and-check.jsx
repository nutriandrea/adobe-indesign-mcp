app.scriptPreferences.userInteractionLevel = 1699311169;
var file = new File("C:/Users/skype/indesign_mcp/mcp-manual-fix.idml");
var doc = app.open(file);
var pageCount = doc.pages.length;
var stories = doc.stories.length;
var result = "doc=" + doc.name + "|pages=" + pageCount + "|stories=" + stories;
for (var i = 0; i < Math.min(pageCount, 5); i++) {
    var page = doc.pages[i];
    var frames = page.textFrames;
    var tfCount = frames.length;
    result += "|page" + i + "frames=" + tfCount;
    for (var j = 0; j < tfCount; j++) {
        var tf = frames[j];
        result += "|p" + i + "tf" + j + "chars=" + tf.contents.length + "|bounds=" + tf.geometricBounds.join(",");
    }
}
result;