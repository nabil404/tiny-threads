import { ErrorCode } from '../error-codes';

describe('ErrorCode Enum', () => {
  it('should include file and image error codes', () => {
    expect(ErrorCode.INVALID_FILE_TYPE).toBe('INVALID_FILE_TYPE');
    expect(ErrorCode.FILE_TOO_LARGE).toBe('FILE_TOO_LARGE');
    expect(ErrorCode.IMAGE_PROCESSING_FAILED).toBe('IMAGE_PROCESSING_FAILED');
    expect(ErrorCode.PRODUCT_VARIANT_IMAGE_NOT_FOUND).toBe('PRODUCT_VARIANT_IMAGE_NOT_FOUND');
  });
});
