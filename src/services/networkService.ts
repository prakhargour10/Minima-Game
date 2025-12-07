
import { NetworkMessage, NetworkMessageType } from '../types';
import * as Ably from 'ably';

type MessageCallback = (payload: any) => void;

export class NetworkService {
  private client: Ably.Realtime | null = null;
  private channel: Ably.RealtimeChannel | null = null;
  private roomId: string | null = null;
  private listeners: Map<NetworkMessageType, MessageCallback[]> = new Map();

  constructor() {}

  public connect(roomId: string) {
    if (this.client) {
      this.client.close();
    }
    this.roomId = roomId;
    
    const apiKey = import.meta.env.VITE_ABLY_API_KEY;
    if (!apiKey) {
      console.error('❌ VITE_ABLY_API_KEY not found in environment variables');
      return;
    }
    
    console.log('🔌 Connecting to Ably room:', roomId);
    
    this.client = new Ably.Realtime({ key: apiKey });
    this.channel = this.client.channels.get(`minima-${roomId}`);
    
    this.channel.subscribe((message) => {
      console.log('📩 Received message:', message.name, message.data);
      try {
        const msg = message.data as NetworkMessage;
        if (msg.roomId !== this.roomId) return;
        this.notify(msg.type, msg.payload);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    });

    this.client.connection.on('connected', () => {
      console.log('✅ Connected to Ably room:', roomId);
    });

    this.client.connection.on('failed', (error) => {
      console.error('❌ Ably connection failed:', error);
    });
    
    this.client.connection.on('disconnected', () => {
      console.log('🔌 Disconnected from Ably');
    });
  }

  public disconnect() {
    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }
    if (this.client) {
      this.client.close();
      this.client = null;
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

  public send(type: NetworkMessageType, payload: any) {
    if (!this.channel || !this.roomId) {
      console.warn('⚠️ Cannot send - not connected:', { channel: !!this.channel, roomId: this.roomId });
      return;
    }
    const msg: NetworkMessage = {
      type,
      roomId: this.roomId,
      payload
    };
    console.log('📤 Sending message:', type, payload);
    this.channel.publish('game-message', msg);
  }

  private notify(type: NetworkMessageType, payload: any) {
    const callbacks = this.listeners.get(type);
    if (callbacks) {
      callbacks.forEach(cb => cb(payload));
    }
  }
}

export const network = new NetworkService();
