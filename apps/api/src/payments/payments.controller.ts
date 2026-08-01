import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('webhooks/mock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle mock payment webhook notifications' })
  @ApiResponse({ status: 200, description: 'Webhook received successfully' })
  handleWebhook(@Body() payload: any): { received: boolean } {
    return this.paymentsService.handleWebhook(payload);
  }
}
