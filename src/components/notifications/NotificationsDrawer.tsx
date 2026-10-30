import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Bell,
  MessageSquare,
  Heart,
  UserPlus,
} from 'lucide-react';
import { Notification } from '../../types/client.ts';
import { api } from '../../lib/api.ts';
import { useApp } from '../../context/AppContext.tsx';

interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({ isOpen, onClose }) => {
  const { showToast, refreshNotifications, realtimeSocket } = useApp();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const fetchNotifs = useCallback(async (cursor?: string) => {
    if (!cursor) {
      setLoading(true);
      setError('');
    }
    try {
      const data = await api.getNotifications(cursor);
      setNotifications((items) => cursor ? [...items, ...data.notifications] : data.notifications);
      setNextCursor(data.nextCursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void fetchNotifs();
    const handleNewNotification = () => void fetchNotifs();
    realtimeSocket?.on('notification:new', handleNewNotification);
    return () => {
      realtimeSocket?.off('notification:new', handleNewNotification);
    };
  }, [fetchNotifs, isOpen, realtimeSocket]);

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      await refreshNotifications();
      showToast('All notifications marked as read', 'info');
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not mark notifications as read.', 'error');
    }
  };

  const markRead = async (notificationId: string) => {
    try {
      await api.markNotificationRead(notificationId);
      setNotifications((items) => items.map((item) => item.id === notificationId ? { ...item, isRead: true } : item));
      await refreshNotifications();
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not mark notification as read.', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md h-full bg-zinc-900 border-l border-zinc-800 shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div>
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-rose-500" />
              <h2 className="text-base font-extrabold text-white">Notifications</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleMarkAllRead}
                className="text-[11px] font-bold text-zinc-400 hover:text-white"
              >
                Mark all read
              </button>
              <button
                onClick={onClose}
                className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[calc(100vh-80px)] overflow-y-auto divide-y divide-zinc-800/60 p-2">
            {notifications.map((notif) => {
              return (
                <div
                  key={notif.id}
                  className={`p-3.5 rounded-2xl transition-colors mb-1 ${
                    notif.isRead ? 'bg-zinc-900/60' : 'bg-zinc-800/80 border border-zinc-700/60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-rose-400 flex-shrink-0 mt-0.5">
                      {notif.type === 'NEW_MESSAGE' ? (
                        <MessageSquare className="w-4 h-4 text-sky-400" />
                      ) : notif.type === 'NEW_FOLLOWER' ? (
                        <UserPlus className="w-4 h-4 text-violet-400" />
                      ) : (
                        <Heart className="w-4 h-4 text-rose-500" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-white">{notif.title}</h4>
                        <span className="text-[10px] text-zinc-500">
                          {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300 mt-0.5 leading-relaxed">
                        {notif.message}
                      </p>

                      {!notif.isRead && <button onClick={() => void markRead(notif.id)} className="mt-2 text-[10px] font-semibold text-rose-300 hover:text-rose-200">Mark as read</button>}
                    </div>
                  </div>
                </div>
              );
            })}

            {notifications.length === 0 && !loading && (
              <div className="py-24 text-center text-zinc-500 text-xs">
                No notifications right now.
              </div>
            )}
            {error && <p role="alert" className="p-4 text-xs text-rose-300">{error}</p>}
            {nextCursor && <button disabled={loading} onClick={() => void fetchNotifs(nextCursor)} className="w-full py-3 text-xs font-semibold text-zinc-300 disabled:opacity-50">{loading ? 'Loading…' : 'Load older notifications'}</button>}
          </div>
        </div>
      </div>
    </div>
  );
};
