let _msgIdCounter = 0;
function nextMsgId() {
  return `msg-${Date.now()}-${++_msgIdCounter}`;
}
function getSessionTitle(session) {
  const firstUserMessage = session.messages.find((m) => m.role === "user");
  if (firstUserMessage?.content) {
    const content = firstUserMessage.content.trim();
    return content.length > 50 ? content.slice(0, 50) + "..." : content;
  }
  return session.title || "New Task";
}
export {
  getSessionTitle,
  nextMsgId
};
