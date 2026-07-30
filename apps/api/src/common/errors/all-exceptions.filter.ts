import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { ErrorCode, ErrorResponseBody, FieldError } from '@tiny-threads/shared';

interface CodedErrorBody {
  code: ErrorCode;
  message: string;
  params: Record<string, unknown>;
  fields?: Record<string, FieldError[]>;
}

function isCodedErrorBody(body: unknown): body is CodedErrorBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    'code' in body &&
    'message' in body &&
    'params' in body
  );
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{
      status: (code: number) => { json: (body: ErrorResponseBody) => void };
    }>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (isCodedErrorBody(body)) {
        response.status(status).json({ error: body });
        return;
      }
      // Framework/library-thrown HttpException we haven't retrofitted (e.g.
      // Nest's own 404 for an unmatched route) — synthesize a code so the
      // envelope shape stays consistent even for paths that were missed. A
      // 5xx here (e.g. a library throwing InternalServerErrorException) gets
      // the same log-and-suppress treatment as the non-HttpException branch
      // below — an uncoded 5xx is still an unexpected error, not a modeled one.
      if (status >= 500) {
        this.logger.error(exception.stack);
      }
      response.status(status).json({
        error: {
          code: `HTTP_${status}` as ErrorCode,
          message: status >= 500 ? 'Internal server error' : exception.message,
          params: {},
        },
      });
      return;
    }

    // A genuine bug, not a modeled error — log full detail server-side, never
    // leak the real message or stack to the client.
    this.logger.error(exception instanceof Error ? exception.stack : exception);
    response.status(500).json({
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        params: {},
      },
    });
  }
}
