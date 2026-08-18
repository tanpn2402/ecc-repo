import { DynamicModule, Global, Module } from '@nestjs/common';
import type { AppConfig } from './configuration';

export const APP_CONFIG = Symbol('APP_CONFIG');

/**
 * Provides the already-loaded, already-validated AppConfig object (see
 * main.ts, which calls loadConfig()/validateStartupConfig() once before
 * NestFactory.create) as a single injectable value — every module that used
 * to receive a plain `config` object in the pre-Nest wiring keeps doing so,
 * just via DI instead of manual constructor calls in index.js.
 */
@Global()
@Module({})
export class AppConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppConfigModule,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
