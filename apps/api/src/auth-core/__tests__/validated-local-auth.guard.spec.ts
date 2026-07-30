import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsEmail, IsString } from 'class-validator';
import { createValidatedLocalAuthGuard } from '../guards/validated-local-auth.guard';

class TestLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}

function contextWithBody(body: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ body }),
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

describe('createValidatedLocalAuthGuard', () => {
  const strategyName = 'test-local';
  const Guard = createValidatedLocalAuthGuard(strategyName, TestLoginDto);
  const basePrototype = AuthGuard(strategyName).prototype as {
    canActivate: (context: ExecutionContext) => Promise<boolean>;
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects a body missing email and password before passport runs', async () => {
    const passportCanActivate = jest.spyOn(basePrototype, 'canActivate');
    const guard = new Guard();

    await expect(guard.canActivate(contextWithBody({}))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(passportCanActivate).not.toHaveBeenCalled();
  });

  it('rejects a malformed email before passport runs', async () => {
    const passportCanActivate = jest.spyOn(basePrototype, 'canActivate');
    const guard = new Guard();

    await expect(
      guard.canActivate(
        contextWithBody({ email: 'not-an-email', password: 'secret' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(passportCanActivate).not.toHaveBeenCalled();
  });

  it('delegates to the passport strategy for a valid body', async () => {
    const passportCanActivate = jest
      .spyOn(basePrototype, 'canActivate')
      .mockResolvedValue(true);
    const guard = new Guard();

    await expect(
      guard.canActivate(
        contextWithBody({ email: 'user@example.com', password: 'secret' }),
      ),
    ).resolves.toBe(true);
    expect(passportCanActivate).toHaveBeenCalledTimes(1);
  });
});
