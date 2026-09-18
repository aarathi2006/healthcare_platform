import { HttpException, HttpStatus, Logger } from '@nestjs/common';

export type FailureMode = 'timeout' | '500' | 'partial' | 'duplicate' | 'auth' | null;

/**
 * Simulates failures for testing the platform's resilience.
 * Failure mode is chosen via the `X-Simulate` header on incoming requests.
 *
 * Usage in a controller:
 *   await FailureInjector.check(req.headers['x-simulate'], payloadToReturnOnPartial);
 *
 * Modes:
 *   timeout    — hangs for 60s (client times out)
 *   500        — immediate 500 error, no data created
 *   partial    — data IS created, but error is returned (unknown outcome!)
 *   duplicate  — returns a "duplicate" error
 *   auth       — 401 unauthorized
 */
export class FailureInjector {
  private static logger = new Logger('FailureInjector');

  static async check(mode: string | undefined): Promise<void> {
    const m = (mode || '').toLowerCase() as FailureMode;
    if (!m) return;

    this.logger.warn(`💥 Injecting failure mode: ${m}`);

    switch (m) {
      case 'timeout':
        await new Promise((r) => setTimeout(r, 60000));
        return;

      case '500':
        throw new HttpException('Simulated internal server error', HttpStatus.INTERNAL_SERVER_ERROR);

      case 'auth':
        throw new HttpException('Simulated unauthorized', HttpStatus.UNAUTHORIZED);

      case 'duplicate':
        throw new HttpException('Simulated duplicate appointment', HttpStatus.CONFLICT);

      case 'partial':
        // Signal to the caller that it should create the record and then throw
        return;

      default:
        return;
    }
  }

  /**
   * Wrap an operation to support "partial" mode: creates the entity, then throws.
   * The platform's verification logic must detect that the entity exists despite the error.
   */
  static async afterPartialOrThrow<T>(
    mode: string | undefined,
    result: T,
  ): Promise<T> {
    const m = (mode || '').toLowerCase();
    if (m === 'partial') {
      this.logger.warn('💥 Partial failure: record was created but error is returned');
      throw new HttpException(
        'Simulated partial failure (record WAS created)',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return result;
  }
}

