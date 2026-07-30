import type { ValidationArguments, ValidationError } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import {
  buildValidationException,
  buildValidationFields,
  field,
} from '../validation-field';

function args(
  property: string,
  constraints: unknown[] = [],
): ValidationArguments {
  return { property, constraints } as ValidationArguments;
}

describe('field()', () => {
  it('encodes a param-less code with a human message prefixed by the property name', () => {
    const raw = field(ErrorCode.IS_EMAIL)(args('email'));
    expect(JSON.parse(raw)).toEqual({
      code: ErrorCode.IS_EMAIL,
      message: 'email must be a valid email address',
      params: {},
    });
  });

  it('encodes MIN_LENGTH with the real constraint argument as a named param', () => {
    const raw = field(ErrorCode.MIN_LENGTH)(args('password', [12]));
    expect(JSON.parse(raw)).toEqual({
      code: ErrorCode.MIN_LENGTH,
      message: 'password must be at least 12 characters',
      params: { min: 12 },
    });
  });

  it('encodes IS_IN with the allowed values joined into the message', () => {
    const raw = field(ErrorCode.IS_IN)(args('role', [['owner', 'admin']]));
    expect(JSON.parse(raw)).toEqual({
      code: ErrorCode.IS_IN,
      message: 'role must be one of: owner, admin',
      params: { values: 'owner, admin' },
    });
  });
});

describe('buildValidationFields', () => {
  it('groups decoded errors by property, preserving multiple rules on one field', () => {
    const errors = [
      {
        property: 'email',
        constraints: { isEmail: field(ErrorCode.IS_EMAIL)(args('email')) },
      },
      {
        property: 'password',
        constraints: {
          isString: field(ErrorCode.IS_STRING)(args('password')),
          minLength: field(ErrorCode.MIN_LENGTH)(args('password', [12])),
        },
      },
    ] as unknown as ValidationError[];

    expect(buildValidationFields(errors)).toEqual({
      email: [
        {
          code: ErrorCode.IS_EMAIL,
          message: 'email must be a valid email address',
          params: {},
        },
      ],
      password: [
        {
          code: ErrorCode.IS_STRING,
          message: 'password must be a string',
          params: {},
        },
        {
          code: ErrorCode.MIN_LENGTH,
          message: 'password must be at least 12 characters',
          params: { min: 12 },
        },
      ],
    });
  });

  it('degrades a constraint message that was never field()-encoded to a best-effort code', () => {
    const errors = [
      {
        property: 'email',
        constraints: {
          minLength: 'email must be longer than or equal to 5 characters',
        },
      },
    ] as unknown as ValidationError[];

    expect(buildValidationFields(errors)).toEqual({
      email: [
        {
          code: ErrorCode.MIN_LENGTH,
          message: 'email must be longer than or equal to 5 characters',
          params: {},
        },
      ],
    });
  });

  it('falls back to VALIDATION_FAILED for a constraint name with no matching code', () => {
    const errors = [
      { property: 'x', constraints: { someUnknownRule: 'x is bad' } },
    ] as unknown as ValidationError[];

    expect(buildValidationFields(errors)).toEqual({
      x: [
        { code: ErrorCode.VALIDATION_FAILED, message: 'x is bad', params: {} },
      ],
    });
  });
});

describe('buildValidationException', () => {
  it('returns a CodedBadRequestException carrying the decoded fields map', () => {
    const errors = [
      {
        property: 'email',
        constraints: { isEmail: field(ErrorCode.IS_EMAIL)(args('email')) },
      },
    ] as unknown as ValidationError[];

    const exception = buildValidationException(errors);

    expect(exception.getResponse()).toEqual({
      code: ErrorCode.VALIDATION_FAILED,
      message: 'Validation failed',
      params: {},
      fields: {
        email: [
          {
            code: ErrorCode.IS_EMAIL,
            message: 'email must be a valid email address',
            params: {},
          },
        ],
      },
    });
  });
});
