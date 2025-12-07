
import { GameState, NetworkMessage, NetworkMessageType } from '../types';

type MessageCallback = (payload: any) => void;

export class NetworkService {
  private channel: BroadcastChannel | null = null;
  private roomId: string | null = null;
  private listeners: Map<NetworkMessageType, MessageCallback[]> = new Map();

  constructor() {}

  public connect(roomId: string) {
    if (this.channel) {
      this.channel.close();
    }
    this.roomId = roomId;
    this.channel = new BroadcastChannel(`minima-${roomId}`);
    
    this.channel.onmessage = (event) => {
      const msg = event.data as NetworkMessage;
      // Only process messages for this room (redundant with channel name, but good safety)
      if (msg.roomId !== this.roomId) return;
      
      this.notify(msg.type, msg.payload);
    };
  }

  public disconnect() {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.roomId = null;
    this.listeners.clear();
  }

  public on(type: NetworkMessageType, callback: MessageCallback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)?.push(callback);
  }

  public off(type: NetworkMessageType, callback: MessageCallback) {
    const callbacks = this.listeners.get(type);
    if (callbacks) {
      this.listeners.set(type, callbacks.filter(c => c !== callback));
    }
  }

  // Send a message to everyone else in the channel
  public send(type: NetworkMessageType, payload: any) {
    if (!this.channel || !this.roomId) return;
    const msg: NetworkMessage = {
      type,
      roomId: this.roomId,
      payload
    };
    this.channel.postMessage(msg);
  }

  private notify(type: NetworkMessageType, payload: any) {
    const callbacks = this.listeners.get(type);
    if (callbacks) {
      callbacks.forEach(cb => cb(payload));
    }
  }
}

export const network = new NetworkService();
