import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
const allowedAppOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000', ...corsOrigins];

@WebSocketGateway({
  cors: {
    origin: allowedAppOrigins,
    credentials: false,
  },
})
export class EventsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket) {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      (client.handshake.query?.token as string | undefined);

    if (!token) {
      this.logger.warn(`Socket ${client.id} connected with no token, disconnecting`);
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      if (payload.type === 'refresh') {
        throw new Error('Refresh tokens cannot be used for socket auth');
      }
      client.data.userId = payload.sub;
      client.data.organizationId = payload.organizationId;
      if (payload.organizationId) {
        void client.join(`org:${payload.organizationId}`);
      }
    } catch (err) {
      this.logger.warn(`Socket ${client.id} failed auth: ${(err as Error).message}`);
      client.disconnect();
    }
  }

  emitToOrg(organizationId: number | null | undefined, event: string, payload: unknown) {
    if (!organizationId) return;
    this.server?.to(`org:${organizationId}`).emit(event, payload);
  }
}
