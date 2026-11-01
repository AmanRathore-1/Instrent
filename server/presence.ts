export class PresenceRegistry {
  private readonly socketsByUser = new Map<string, Set<string>>();

  add(userId: string, socketId: string): boolean {
    let sockets = this.socketsByUser.get(userId);
    const wasOffline = !sockets || sockets.size === 0;
    if (!sockets) {
      sockets = new Set<string>();
      this.socketsByUser.set(userId, sockets);
    }
    sockets.add(socketId);
    return wasOffline;
  }

  remove(userId: string, socketId: string): boolean {
    const sockets = this.socketsByUser.get(userId);
    if (!sockets) return false;
    sockets.delete(socketId);
    if (sockets.size > 0) return false;
    this.socketsByUser.delete(userId);
    return true;
  }

  removeAll(userId: string): boolean {
    const wasOnline = this.isOnline(userId);
    this.socketsByUser.delete(userId);
    return wasOnline;
  }

  isOnline(userId: string): boolean {
    return (this.socketsByUser.get(userId)?.size ?? 0) > 0;
  }

  onlineUserIds(): string[] {
    return [...this.socketsByUser.keys()];
  }
}

export const presenceRegistry = new PresenceRegistry();
