import { Controller, Get, Post, Body, Param, Query, UploadedFile, UseInterceptors, BadRequestException, Inject } from '@nestjs/common';
import { BranchScoped } from '../../common/decorators/branch-scoped.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { GetAllAccountsPayableUseCase } from '../../application/use-cases/account-payable/get-all-accounts-payable.use-case';
import { GetAccountPayableByIdUseCase } from '../../application/use-cases/account-payable/get-account-payable-by-id.use-case';
import { RegisterAPPaymentUseCase } from '../../application/use-cases/account-payable/register-ap-payment.use-case';
import { GetAPAlertsUseCase } from '../../application/use-cases/account-payable/get-ap-alerts.use-case';
import { FilterAccountPayableDto } from '../../application/dtos/account-payable/filter-account-payable.dto';
import { RegisterAPPaymentDto } from '../../application/dtos/account-payable/register-ap-payment.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CloudinaryService } from '../../infrastructure/cloudinary/cloudinary.service';
import { IAccountPayableRepository, ACCOUNT_PAYABLE_REPOSITORY } from '../../domain/repositories/account-payable.repository';

@ApiTags('Accounts Payable')
@ApiBearerAuth('JWT')
@Controller('accounts-payable')
@BranchScoped()
export class AccountPayableController {
  constructor(
    private readonly getAllAP: GetAllAccountsPayableUseCase,
    private readonly getAPById: GetAccountPayableByIdUseCase,
    private readonly registerPayment: RegisterAPPaymentUseCase,
    private readonly getAlerts: GetAPAlertsUseCase,
    private readonly cloudinary: CloudinaryService,
    @Inject(ACCOUNT_PAYABLE_REPOSITORY) private readonly apRepository: IAccountPayableRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar cuentas por pagar', description: 'Obtiene todas las cuentas por pagar con filtros por proveedor y estado' })
  async findAll(@Query() filter: FilterAccountPayableDto) {
    return this.getAllAP.execute(filter);
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Alertas de cuentas por pagar', description: 'Obtiene cuentas vencidas y próximas a vencer' })
  @ApiQuery({ name: 'days', required: false, description: 'Días para próximos vencimientos (default: 3)' })
  async alerts(@Query('days') days?: number) {
    return this.getAlerts.execute(days ? Number(days) : 3);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de cuenta por pagar', description: 'Obtiene detalle con cuotas e historial de pagos' })
  @ApiParam({ name: 'id', description: 'ID de la cuenta por pagar' })
  async findById(@Param('id') id: string) {
    return this.getAPById.execute(id);
  }

  @Post(':id/payments')
  @ApiOperation({ summary: 'Registrar pago a proveedor', description: 'Registra un pago parcial o total. No genera movimiento en caja.' })
  @ApiParam({ name: 'id', description: 'ID de la cuenta por pagar' })
  async pay(@Param('id') id: string, @Body() dto: RegisterAPPaymentDto, @CurrentUser('id') userId: string) {
    return this.registerPayment.execute(id, dto, userId);
  }

  @Post(':id/payments/:paymentId/voucher')
  @ApiOperation({ summary: 'Subir voucher de pago', description: 'Sube la foto del comprobante de pago a Cloudinary' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }))
  async uploadVoucher(
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    const url = await this.cloudinary.uploadBuffer(file.buffer, 'vouchers', `${id}_${paymentId}`);
    await this.apRepository.setPaymentVoucher(id, paymentId, url);
    return { voucherUrl: url };
  }
}
