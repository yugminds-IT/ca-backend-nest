import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {

  @Get()
  getHello(): string {
    return 'running';
  }

  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
