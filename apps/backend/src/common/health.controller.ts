import { Controller, Get } from '@nestjs/common';

/** Port of app.js's `GET /api/health` — same route, same response shape. */
@Controller('api')
export class HealthController {
  @Get('health')
  health() {
    return { ok: true, time: new Date().toISOString() };
  }
}
