initUI();

onClick("#reply", async function() {
    location.href = await storage.get("_composeUrl");
});

onClick("#replyAll", async function() {
    location.href = await storage.get("_composeUrlReplyAll");
});