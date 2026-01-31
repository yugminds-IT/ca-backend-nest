import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';

export interface JwtPayload {
  sub: number;
  email: string;
  role: string;
  organizationId?: number;
  type: 'access' | 'refresh';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private config: ConfigService,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {
    const secret = config.get<string>('SECRET_KEY') ?? config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('SECRET_KEY or JWT_SECRET must be set');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    if (payload.type === 'refresh') throw new UnauthorizedException('Use refresh token endpoint');
    const user = await this.userRepo.findOne({
      where: { id: payload.sub },
      relations: ['role', 'organization'],
    });
    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }
}
