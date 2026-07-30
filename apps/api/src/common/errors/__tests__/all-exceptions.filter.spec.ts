import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { ErrorCode } from '@tiny-threads/shared';
import { AllExceptionsFilter } from '../all-exceptions.filter';
import { CodedUnauthorizedException } from '../coded-exceptions';

function buildHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
  });

  it('passes a coded HttpException straight through, wrapped in { error }', () => {
    const { host, status, json } = buildHost();
    const exception = new CodedUnauthorizedException(
      ErrorCode.AUTH_INVALID_CREDENTIALS,
      'Invalid email or password',
    );

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message: 'Invalid email or password',
        params: {},
      },
    });
  });

  it('synthesizes an HTTP_<status> code for an uncoded HttpException', () => {
    const { host, status, json } = buildHost();
    const exception = new BadRequestException('plain nest message');

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'HTTP_400', message: 'plain nest message', params: {} },
    });
  });

  it('never leaks a raw error and logs it server-side instead', () => {
    const { host, status, json } = buildHost();
    const exception = new Error('db exploded with secrets');
    const logSpy = jest.spyOn(filter['logger'], 'error');

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        params: {},
      },
    });
    expect(logSpy).toHaveBeenCalled();
    expect(JSON.stringify(json.mock.calls[0])).not.toContain(
      'db exploded with secrets',
    );
  });
});
