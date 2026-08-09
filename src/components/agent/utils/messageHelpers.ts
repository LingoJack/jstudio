import type { AgentSession } from '../../../types/agent';

let _msgIdCounter = 0;
export function nextMsgId(): string {
  return `msg-${Date.now()}-${++_msgIdCounter}`;
}

export function getSessionTitle(session: AgentSession): string {
  const firstUserMessage = session.messages.find((m) => m.role === 'user');
  if (firstUserMessage?.content) {
    const content = firstUserMessage.content.trim();
    return content.length > 50 ? content.slice(0, 50) + '...' : content;
  }
  return session.title || 'New Task';
}
