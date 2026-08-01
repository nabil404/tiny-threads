import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle global payment webhooks' })
  @ApiResponse({ status: 200, description: 'Webhook received successfully' })
  async handleGlobalWebhook(
    @Body() payload: unknown,
    @Headers() headers: Record<string, string>,
  ): Promise<{ received: boolean; status: string }> {
    return this.paymentsService.handleWebhookEvent(payload, headers);
  }

  @Post('webhooks/mock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle mock payment webhook notifications' })
  @ApiResponse({ status: 200, description: 'Webhook received successfully' })
  handleWebhook(@Body() payload: unknown): { received: boolean } {
    return this.paymentsService.handleWebhook(payload);
  }
}
