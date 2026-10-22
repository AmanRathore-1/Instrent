import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import {
  Send,
  CheckCheck,
  Building,
  ExternalLink,
  ChevronLeft,
} from 'lucide-react';
import { Conversation, Message, MessageContext, User } from '../../types/client.ts';
import { api } from '../../lib/api.ts';
import { useApp } from '../../context/AppContext.tsx';

const mergeMessage = (messages: Message[], incoming: Message): Message[] => {
  const withoutPending = incoming.idempotencyKey
    ? messages.filter((message) => message.idempotencyKey !== incoming.idempotencyKey)
    : messages;
  const existingIndex = withoutPending.findIndex((message) => message.id === incoming.id);
  if (existingIndex >= 0) {
    return withoutPending.map((message, index) => index === existingIndex ? incoming : message);
  }
  return [...withoutPending, incoming].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
  );
};

export const MessagesView: React.FC<{
  initialConversationId?: string;
  initialContext?: MessageContext;
}> = ({
  initialConversationId,
  initialContext,
}) => {
  const { currentUser, showToast, openPropertyProfile, openScheduleVisit, realtimeSocket, refreshUnreadMessages, setActiveView, setViewParams } = useApp();
  const currentUserId = currentUser?.id;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(initialConversationId || null);
  const [activeOtherUser, setActiveOtherUser] = useState<User | null>(null);
  const [activeContext, setActiveContext] = useState<MessageContext | undefined>(initialContext);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageCursor, setMessageCursor] = useState<string | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const previousScrollHeight = useRef<number | null>(null);
  const skipAutoScroll = useRef(false);
  const pendingMessage = useRef<{
    text: string;
    conversationId: string;
    receiverId: string;
    idempotencyKey: string;
  } | null>(null);
  const typingTimer = useRef<number | null>(null);
  const typingHeartbeatTimer = useRef<number | null>(null);
  const activeConversationRef = useRef(activeConvId);
  const typingActive = useRef(false);
  const shouldScrollToBottom = useRef(true);
  const isOtherOnline = Boolean(activeOtherUser && onlineUserIds.includes(activeOtherUser.id));

  const stopTyping = useCallback((conversationId = activeConversationRef.current) => {
    if (typingTimer.current !== null) {
      window.clearTimeout(typingTimer.current);
      typingTimer.current = null;
    }
    if (typingHeartbeatTimer.current !== null) {
      window.clearTimeout(typingHeartbeatTimer.current);
      typingHeartbeatTimer.current = null;
    }
    if (typingActive.current && conversationId) {
      realtimeSocket?.emit('conversation:typing', { conversationId, isTyping: false });
    }
    typingActive.current = false;
  }, [realtimeSocket]);

  const loadConversations = useCallback(async () => {
    try {
      const data = await api.getConversations();
      setConversations(data.conversations);
      if (data.conversations.length > 0) {
        setActiveConvId((currentId) => currentId || data.conversations[0].id);
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
      showToast(error instanceof Error ? error.message : 'Could not load conversations.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (initialConversationId) {
      setActiveConvId(initialConversationId);
      setActiveContext(initialContext);
    }
    void loadConversations();
  }, [initialConversationId, initialContext, loadConversations]);

  const loadActiveMessages = useCallback(async (convId: string): Promise<void> => {
    try {
      const data = await api.getMessages(convId);
      if (activeConversationRef.current !== convId) return;
      setMessages((previous) => data.messages.reduce(mergeMessage, previous));
      setConversations((previous) => previous.map((conversation) =>
        conversation.id === convId ? { ...conversation, unreadCount: 0 } : conversation,
      ));
      setMessageCursor(data.nextCursor);
      setHasMoreMessages(data.hasMore);
      setActiveOtherUser(data.otherUser);
      if (data.conversation.activeContext) {
        setActiveContext(data.conversation.activeContext);
      }
      await refreshUnreadMessages();
    } catch (error) {
      if (activeConversationRef.current === convId) {
        console.error('Failed to load messages:', error);
        showToast(error instanceof Error ? error.message : 'Could not load messages.', 'error');
      }
    }
  }, [refreshUnreadMessages, showToast]);

  const loadOlderMessages = async () => {
    if (!activeConvId || !messageCursor || loadingOlderMessages) return;
    const conversationId = activeConvId;
    previousScrollHeight.current = messagesContainerRef.current?.scrollHeight ?? null;
    skipAutoScroll.current = true;
    setLoadingOlderMessages(true);
    try {
      const data = await api.getMessages(conversationId, messageCursor);
      if (activeConversationRef.current !== conversationId) return;
      setMessages((previous) => {
        const existingIds = new Set(previous.map((message) => message.id));
        return [...data.messages.filter((message) => !existingIds.has(message.id)), ...previous];
      });
      setMessageCursor(data.nextCursor);
      setHasMoreMessages(data.hasMore);
    } catch (error) {
      if (activeConversationRef.current !== conversationId) return;
      skipAutoScroll.current = false;
      previousScrollHeight.current = null;
      showToast(error instanceof Error ? error.message : 'Could not load older messages.', 'error');
    } finally {
      setLoadingOlderMessages(false);
    }
  };

  useEffect(() => {
    activeConversationRef.current = activeConvId;
    skipAutoScroll.current = false;
    previousScrollHeight.current = null;
    shouldScrollToBottom.current = true;
    if (activeConvId) {
      setMessages([]);
      setMessageCursor(null);
      setHasMoreMessages(false);
      void loadActiveMessages(activeConvId);
    }
  }, [activeConvId, loadActiveMessages]);

  useLayoutEffect(() => {
    activeConversationRef.current = activeConvId;
  }, [activeConvId]);

  useEffect(() => {
    if (!activeConvId || !currentUserId || !realtimeSocket) return;
    let hasJoinedConversation = false;
    const joinConversation = () => {
      realtimeSocket.emit('conversation:join', { conversationId: activeConvId }, (result: { success: boolean }) => {
        if (!result.success) showToast('You are not a member of this conversation.', 'error');
      });
      if (hasJoinedConversation) {
        void loadActiveMessages(activeConvId);
      }
      hasJoinedConversation = true;
    };
    const handleNewMessage = (message: Message) => {
      if (message.conversationId !== activeConvId) return;
      if (message.receiverId === currentUserId) {
        realtimeSocket.emit('message:read', { messageId: message.id });
      }
      setMessages((previous) => mergeMessage(previous, message));
      void refreshUnreadMessages().catch((error: unknown) => {
        console.error('Could not refresh unread messages:', error);
      });
    };
    const handleMessageDelivered = (receipt: { messageId: string; deliveredAt: string }) => {
      setMessages((previous) => previous.map((message) => message.id === receipt.messageId
        ? { ...message, deliveredAt: receipt.deliveredAt }
        : message));
    };
    const handleMessagesRead = (receipt: { messageIds?: string[]; messageId?: string }) => {
      const ids = new Set(receipt.messageIds || (receipt.messageId ? [receipt.messageId] : []));
      setMessages((previous) => previous.map((message) => ids.has(message.id) ? { ...message, isRead: true } : message));
    };
    const handleTyping = (event: { conversationId: string; userId: string; isTyping: boolean }) => {
      if (event.conversationId === activeConvId && event.userId !== currentUserId) {
        setIsOtherTyping(event.isTyping);
      }
    };
    const handlePresenceSnapshot = (presence: { userIds: string[] }) => {
      setOnlineUserIds(presence.userIds);
    };
    const handlePresence = (presence: { userId: string }) => {
      setOnlineUserIds((userIds) => userIds.includes(presence.userId)
        ? userIds
        : [...userIds, presence.userId]);
    };
    const handleOffline = (presence: { userId: string }) => {
      setOnlineUserIds((userIds) => userIds.filter((userId) => userId !== presence.userId));
    };
    const handleConversationChanged = () => {
      void loadConversations();
    };
    const handleConversationRead = (event: { conversationId: string }) => {
      setConversations((previous) => previous.map((conversation) =>
        conversation.id === event.conversationId ? { ...conversation, unreadCount: 0 } : conversation,
      ));
    };
    const handleSocketDisconnect = () => {
      if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
      typingTimer.current = null;
      if (typingHeartbeatTimer.current !== null) window.clearTimeout(typingHeartbeatTimer.current);
      typingHeartbeatTimer.current = null;
      typingActive.current = false;
      setIsOtherTyping(false);
      setOnlineUserIds([]);
    };
    realtimeSocket.on('connect', joinConversation);
    realtimeSocket.on('disconnect', handleSocketDisconnect);
    realtimeSocket.on('message:new', handleNewMessage);
    realtimeSocket.on('message:delivered', handleMessageDelivered);
    realtimeSocket.on('message:read', handleMessagesRead);
    realtimeSocket.on('conversation:typing', handleTyping);
    realtimeSocket.on('presence:snapshot', handlePresenceSnapshot);
    realtimeSocket.on('presence:online', handlePresence);
    realtimeSocket.on('presence:offline', handleOffline);
    realtimeSocket.on('conversation:changed', handleConversationChanged);
    realtimeSocket.on('conversation:read', handleConversationRead);
    if (realtimeSocket.connected) joinConversation();
    return () => {
      realtimeSocket.off('connect', joinConversation);
      realtimeSocket.off('disconnect', handleSocketDisconnect);
      realtimeSocket.off('message:new', handleNewMessage);
      realtimeSocket.off('message:delivered', handleMessageDelivered);
      realtimeSocket.off('message:read', handleMessagesRead);
      realtimeSocket.off('conversation:typing', handleTyping);
      realtimeSocket.off('presence:snapshot', handlePresenceSnapshot);
      realtimeSocket.off('presence:online', handlePresence);
      realtimeSocket.off('presence:offline', handleOffline);
      realtimeSocket.off('conversation:changed', handleConversationChanged);
      realtimeSocket.off('conversation:read', handleConversationRead);
      stopTyping(activeConvId);
      realtimeSocket.emit('conversation:leave', { conversationId: activeConvId });
    };
  }, [
    activeConvId,
    currentUserId,
    loadActiveMessages,
    loadConversations,
    realtimeSocket,
    refreshUnreadMessages,
    stopTyping,
    showToast,
  ]);

  useLayoutEffect(() => {
    if (skipAutoScroll.current) {
      const container = messagesContainerRef.current;
      if (container && previousScrollHeight.current !== null) {
        container.scrollTop += container.scrollHeight - previousScrollHeight.current;
      }
      skipAutoScroll.current = false;
      previousScrollHeight.current = null;
      return;
    }
    if (shouldScrollToBottom.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSendMessage = async () => {
    const textToSend = inputText;
    if (isSending || !textToSend.trim() || !activeConvId || !activeOtherUser || !currentUser) return;

    if (
      pendingMessage.current?.text !== textToSend.trim() ||
      pendingMessage.current.conversationId !== activeConvId ||
      pendingMessage.current.receiverId !== activeOtherUser.id
    ) {
      pendingMessage.current = {
        text: textToSend.trim(),
        conversationId: activeConvId,
        receiverId: activeOtherUser.id,
        idempotencyKey: crypto.randomUUID(),
      };
    }
    const pending = pendingMessage.current;
    const optimisticMessage: Message = {
      id: `pending:${pending.idempotencyKey}`,
      conversationId: activeConvId,
      senderId: currentUser.id,
      receiverId: activeOtherUser.id,
      text: textToSend.trim(),
      idempotencyKey: pending.idempotencyKey,
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    setMessages((previous) => mergeMessage(previous, optimisticMessage));
    setIsSending(true);
    stopTyping(activeConvId);
    try {
      const result = await api.sendMessage({
        conversationId: activeConvId,
        receiverId: activeOtherUser.id,
        text: textToSend.trim(),
        idempotencyKey: pending.idempotencyKey,
        context: activeContext,
      });
      if (activeConversationRef.current === activeConvId) {
        setMessages((previous) => mergeMessage(previous, result.message));
        setInputText((currentText) => currentText === textToSend ? '' : currentText);
      }
      if (pendingMessage.current?.idempotencyKey === pending.idempotencyKey) {
        pendingMessage.current = null;
      }
    } catch (error) {
      setMessages((previous) => previous.filter((message) => message.id !== optimisticMessage.id));
      showToast(error instanceof Error ? error.message : 'Could not send message.', 'error');
    } finally {
      setIsSending(false);
    }
  };

  const handleInputChange = (text: string) => {
    setInputText(text);
    if (!activeConvId || !realtimeSocket?.connected) return;
    if (!text.trim()) {
      stopTyping(activeConvId);
      return;
    }
    if (!typingActive.current) {
      typingActive.current = true;
      realtimeSocket.emit('conversation:typing', { conversationId: activeConvId, isTyping: true });
      const sendTypingHeartbeat = () => {
        if (!typingActive.current || !realtimeSocket.connected) return;
        realtimeSocket.emit('conversation:typing', { conversationId: activeConvId, isTyping: true });
        typingHeartbeatTimer.current = window.setTimeout(sendTypingHeartbeat, 2000);
      };
      typingHeartbeatTimer.current = window.setTimeout(sendTypingHeartbeat, 2000);
    }
    if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => {
      stopTyping(activeConvId);
    }, 1000);
  };

  return (
    <div className="h-[calc(100vh-4.5rem)] max-w-6xl mx-auto px-2 md:px-4 py-2 flex gap-4">
      {/* Conversation list */}
      <div
        className={`w-full md:w-80 lg:w-96 bg-zinc-900/90 border border-zinc-800 rounded-3xl flex flex-col overflow-hidden shadow-2xl backdrop-blur-md ${
          activeConvId ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-white flex items-center gap-2">
            <span>Direct Messages</span>
            <span className="text-xs text-rose-400 font-bold">
              ({conversations.length})
            </span>
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/60">
          {loading && (
            <p className="p-4 text-center text-xs text-zinc-500">Loading conversations...</p>
          )}
          {!loading && conversations.length === 0 && (
            <p className="p-4 text-center text-xs text-zinc-500">No conversations yet.</p>
          )}
          {conversations.map((c) => {
            const isSelected = activeConvId === c.id;
            const other = c.otherUser;
            return (
              <button
                key={c.id}
                onClick={() => {
                  setActiveConvId(c.id);
                  setActiveOtherUser(other || null);
                  setActiveContext(c.activeContext);
                  setIsOtherTyping(false);
                  setOnlineUserIds([]);
                }}
                className={`w-full p-4 flex items-center gap-3.5 text-left transition-colors ${
                  isSelected ? 'bg-zinc-800/90' : 'hover:bg-zinc-850'
                }`}
              >
                <div className="relative flex-shrink-0">
                  {other?.avatar ? (
                    <img src={other.avatar} alt={other.name} className="h-12 w-12 rounded-full border border-zinc-700 object-cover" />
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-xs font-bold text-white">
                      {other?.name.slice(0, 1).toUpperCase() || '?'}
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-white truncate">{other?.name}</p>
                    <span className="text-[10px] text-zinc-500">
                      {new Date(c.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 truncate mt-0.5 font-medium">
                    {c.lastMessage}
                  </p>
                  {c.activeContext && (
                    <span className="text-[10px] text-rose-400 font-semibold truncate block mt-0.5">
                      📍 {c.activeContext.title}
                    </span>
                  )}
                </div>

                {c.unreadCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0"></span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Active Chat Thread */}
      <div
        className={`flex-1 bg-zinc-900/90 border border-zinc-800 rounded-3xl flex flex-col overflow-hidden shadow-2xl backdrop-blur-md ${
          !activeConvId ? 'hidden md:flex' : 'flex'
        }`}
      >
        {activeConvId && activeOtherUser ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setIsOtherTyping(false);
                    setActiveConvId(null);
                  }}
                  className="md:hidden p-1.5 rounded-xl text-zinc-400 hover:text-white"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <div className="relative">
                  {activeOtherUser.avatar ? (
                    <img src={activeOtherUser.avatar} alt={activeOtherUser.name} className="h-10 w-10 rounded-full border border-zinc-700 object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-xs font-bold text-white">
                      {activeOtherUser.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
                    {activeOtherUser.name}
                  </h3>
                  <p className="text-[11px] text-zinc-400 font-medium">
                    {isOtherTyping ? `${activeOtherUser.name} is typing…` : isOtherOnline ? 'Online' : activeOtherUser.activeRole}
                  </p>
                </div>
              </div>

              {/* Header Action Tools */}
              <div className="flex items-center gap-2">
                {activeContext && (
                  <button
                    onClick={() => {
                      if (activeContext.type === 'ROOM') {
                        setViewParams({ roomId: activeContext.id });
                        setActiveView('rooms');
                      } else {
                        openPropertyProfile(activeContext.id);
                      }
                    }}
                    className="hidden sm:flex items-center gap-1 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-zinc-200"
                  >
                    <span>{activeContext.type === 'ROOM' ? 'View Room' : 'View Property'}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* ATTACHED PROPERTY CONTEXT BANNER (RULE 10) */}
            {activeContext && (
              <div className="bg-zinc-950/90 border-b border-zinc-800 p-3 flex items-center justify-between gap-3 animate-in fade-in">
                <div className="flex items-center gap-3 truncate">
                  {activeContext.imageUrl && (
                    <img
                      src={activeContext.imageUrl}
                      alt={activeContext.title}
                      className="w-12 h-12 rounded-xl object-cover flex-shrink-0"
                    />
                  )}
                  <div className="truncate">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">
                      Inquiring About {activeContext.type}
                    </span>
                    <h4 className="text-xs font-bold text-white truncate">{activeContext.title}</h4>
                    {activeContext.price && (
                      <p className="text-xs font-extrabold text-emerald-400">
                        ₹{activeContext.price.toLocaleString('en-IN')}/mo
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {activeContext.type !== 'ROOM' && <button
                    onClick={() => openScheduleVisit(activeContext.id, activeContext.title, activeOtherUser.id)}
                    className="px-3 py-1.5 bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 rounded-xl text-xs font-bold transition-colors"
                  >
                    Schedule Visit
                  </button>}
                </div>
              </div>
            )}

            {/* Messages Scroll Area */}
            <div
              ref={messagesContainerRef}
              onScroll={(event) => {
                const container = event.currentTarget;
                shouldScrollToBottom.current =
                  container.scrollHeight - container.scrollTop - container.clientHeight < 120;
              }}
              className="flex-1 overflow-y-auto p-4 space-y-4"
            >
              {hasMoreMessages && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => void loadOlderMessages()}
                    disabled={loadingOlderMessages}
                    className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {loadingOlderMessages ? 'Loading...' : 'Load older messages'}
                  </button>
                </div>
              )}
              {messages.map((m) => {
                const isMine = m.senderId === currentUser?.id;
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-md rounded-2xl px-4 py-2.5 text-xs font-medium shadow-md ${
                        isMine
                          ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white rounded-br-none'
                          : 'bg-zinc-800 text-zinc-100 rounded-bl-none'
                      }`}
                    >
                      <p className="leading-relaxed">{m.text}</p>
                    </div>
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-zinc-500 px-1">
                      <span>
                        {new Date(m.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {isMine && (m.id.startsWith('pending:')
                        ? <span className="text-[9px] text-zinc-400">Sending…</span>
                        : <CheckCheck className={`w-3 h-3 ${m.isRead ? 'text-sky-400' : m.deliveredAt ? 'text-zinc-300' : 'text-zinc-500'}`} />)}
                    </div>
                  </div>
                );
              })}

              <div ref={messagesEndRef} />
            </div>

            {/* Message Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSendMessage();
              }}
              className="p-3 border-t border-zinc-800 flex items-center gap-2 bg-zinc-950/80"
            >
              <input
                type="text"
                placeholder={`Message ${activeOtherUser.name}...`}
                value={inputText}
                onChange={(e) => handleInputChange(e.target.value)}
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
              />
              <button
                type="submit"
                disabled={isSending || !inputText.trim()}
                className="rounded-2xl bg-rose-500 p-2.5 text-white shadow-md transition-colors hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-zinc-500 space-y-2">
            <Building className="w-12 h-12 text-zinc-700" />
            <p className="font-bold text-zinc-400">Select a conversation</p>
            <p className="text-xs text-zinc-600">
              Open a roommate profile and select Message to start a conversation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
