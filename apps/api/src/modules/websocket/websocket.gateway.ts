import {
  WebSocketGateway as WsGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

export interface SyncStatusMessage {
  source: 'udesk' | 'zouwu';
  status: 'running' | 'completed' | 'failed';
  runId: string;
  timestamp: string;
  error?: string;
}

export interface SyncProgressMessage {
  source: 'udesk' | 'zouwu';
  isRunning: boolean;
  runId?: string;
  startedAt?: string;
  currentWindowStart?: string;
  currentWindowEnd?: string;
  totalWindows: number;
  processedWindows: number;
  sessionSynced: number;
  messageSynced: number;
  issueCount: number;
  estimatedRemainingRecords: number;
  estimatedRemainingSeconds: number;
  note?: string;
}

@WsGateway({
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173', 'http://localhost:8080'],
    credentials: true,
  },
  namespace: '/sync',
})
export class WebSocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(WebSocketGateway.name);
  private connectedClients = new Set<Socket>();

  handleConnection(client: Socket) {
    this.connectedClients.add(client);
    this.logger.log(`Client connected: ${client.id}, total: ${this.connectedClients.size}`);
  }

  handleDisconnect(client: Socket) {
    this.connectedClients.delete(client);
    this.logger.log(`Client disconnected: ${client.id}, total: ${this.connectedClients.size}`);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(@ConnectedSocket() client: Socket, @MessageBody() channels: string[]) {
    channels.forEach((channel) => {
      client.join(channel);
      this.logger.debug(`Client ${client.id} subscribed to ${channel}`);
    });
    return { success: true, channels };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(@ConnectedSocket() client: Socket, @MessageBody() channels: string[]) {
    channels.forEach((channel) => {
      client.leave(channel);
    });
    return { success: true };
  }

  broadcastSyncStatus(message: SyncStatusMessage) {
    this.server.emit('sync:status', message);
    this.logger.debug(`Broadcast sync:status - ${message.source} ${message.status}`);
  }

  broadcastSyncProgress(message: SyncProgressMessage) {
    this.server.emit('sync:progress', message);
  }

  getConnectedCount(): number {
    return this.connectedClients.size;
  }
}
