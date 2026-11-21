import { AccountingRead } from '../../common/decorators/accounting-access.decorator';
import { Controller, Get, Post, Patch, Body, Param, Query, UploadedFile, UseInterceptors, BadRequestException, Inject } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { CloudinaryService } from '../../infrastructure/cloudinary/cloudinary.service';
import { PAYMENT_AGREEMENT_REPOSITORY, IPaymentAgreementRepository } from '../../domain/repositories/payment-agreement.repository';
import { GetAllPaymentAgreementsUseCase } from '../../application/use-cases/payment-agreement/get-all-payment-agreements.use-case';
import { GetPaymentAgreementByIdUseCase } from '../../application/use-cases/payment-agreement/get-payment-agreement-by-id.use-case';
import { CreatePaymentAgreementUseCase } from '../../application/use-cases/payment-agreement/create-payment-agreement.use-case';
import { RegisterAgreementPaymentUseCase } from '../../application/use-cases/payment-agreement/register-agreement-payment.use-case';
import { CancelPaymentAgreementUseCase } from '../../application/use-cases/payment-agreement/cancel-payment-agreement.use-case';
import { CreatePaymentAgreementDto } from '../../application/dtos/payment-agreement/create-payment-agreement.dto';
import { RegisterAgreementPaymentDto } from '../../application/dtos/payment-agreement/register-agreement-payment.dto';
import { CancelAgreementDto } from '../../application/dtos/payment-agreement/cancel-agreement.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Payment Agreements')
@ApiBearerAuth('JWT')
@AccountingRead()
@Controller('payment-agreements')
export class PaymentAgreementController {
  constructor(
    private readonly getAll: GetAllPaymentAgreementsUseCase,
    private readonly getById: GetPaymentAgreementByIdUseCase,
    private readonly create: CreatePaymentAgreementUseCase,
    private readonly registerPayment: RegisterAgreementPaymentUseCase,
    private readonly cancel: CancelPaymentAgreementUseCase,
    private readonly cloudinary: CloudinaryService,
    @Inject(PAYMENT_AGREEMENT_REPOSITORY) private readonly agRepo: IPaymentAgreementRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar acuerdos de pago' })
  async findAll(@Query('supplier') supplier?: string, @Query('status') status?: string) {
    return this.getAll.execute({ supplier, status });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de acuerdo de pago' })
  @ApiParam({ name: 'id', description: 'ID del acuerdo' })
  async findById(@Param('id') id: string) {
    return this.getById.execute(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear acuerdo de pago', description: 'Consolida 2 o más facturas del mismo proveedor en un acuerdo de pago' })
  async createAgreement(@Body() dto: CreatePaymentAgreementDto, @CurrentUser('id') userId: string) {
    return this.create.execute(dto, userId);
  }

  @Post(':id/payments')
  @ApiOperation({ summary: 'Registrar pago al acuerdo' })
  @ApiParam({ name: 'id', description: 'ID del acuerdo' })
  async pay(@Param('id') id: string, @Body() dto: RegisterAgreementPaymentDto, @CurrentUser('id') userId: string) {
    return this.registerPayment.execute(id, dto, userId);
  }

  @Post(':id/payments/:paymentId/voucher')
  @ApiOperation({ summary: 'Subir voucher de pago del acuerdo' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }))
  async uploadVoucher(
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    const url = await this.cloudinary.uploadBuffer(file.buffer, 'vouchers', `ag_${id}_${paymentId}`);
    await this.agRepo.setPaymentVoucher(id, paymentId, url);
    return { voucherUrl: url };
  }

  @Post(':id/installments/:installmentId/voucher')
  @ApiOperation({ summary: 'Subir voucher de cuota del acuerdo' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }))
  async uploadInstallmentVoucher(
    @Param('id') id: string,
    @Param('installmentId') installmentId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    const url = await this.cloudinary.uploadBuffer(file.buffer, 'vouchers', `ag_${id}_inst_${installmentId}`);
    await this.agRepo.setInstallmentVoucher(id, installmentId, url);
    return { voucherUrl: url };
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Anular acuerdo de pago', description: 'Solo disponible si no hay pagos registrados' })
  @ApiParam({ name: 'id', description: 'ID del acuerdo' })
  async cancelAgreement(@Param('id') id: string, @Body() dto: CancelAgreementDto, @CurrentUser('id') userId: string) {
    return this.cancel.execute(id, dto, userId);
  }
}
