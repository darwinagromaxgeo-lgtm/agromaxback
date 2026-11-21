import { AccountingRead } from '../../common/decorators/accounting-access.decorator';
import { SellerAccess } from '../../common/decorators/seller-access.decorator';
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Inject, ParseFloatPipe } from '@nestjs/common';
import { BranchScoped } from '../../common/decorators/branch-scoped.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { GetAllCreditsUseCase } from '../../application/use-cases/credit-account/get-all-credits.use-case';
import { GetClientCreditsUseCase } from '../../application/use-cases/credit-account/get-client-credits.use-case';
import { RegisterPaymentUseCase } from '../../application/use-cases/credit-account/register-payment.use-case';
import { RegisterBatchPaymentUseCase } from '../../application/use-cases/credit-account/register-batch-payment.use-case';
import { EditCreditUseCase } from '../../application/use-cases/credit-account/edit-credit.use-case';
import { DeleteCreditUseCase } from '../../application/use-cases/credit-account/delete-credit.use-case';
import { AddSaleToCreditUseCase } from '../../application/use-cases/credit-account/add-sale-to-credit.use-case';
import { RegisterPaymentDto } from '../../application/dtos/credit-account/register-payment.dto';
import { RegisterBatchPaymentDto } from '../../application/dtos/credit-account/register-batch-payment.dto';
import { EditCreditDto } from '../../application/dtos/credit-account/edit-credit.dto';
import { FilterCreditDto } from '../../application/dtos/credit-account/filter-credit.dto';
import { IsString, IsNumber, Min } from 'class-validator';

class AddSaleDto {
  @IsString() saleId: string;
  @IsNumber() @Min(0.01) amount: number;
}
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ICreditAccountRepository, CREDIT_ACCOUNT_REPOSITORY } from '../../domain/repositories/credit-account.repository';

@ApiTags('Credits')
@ApiBearerAuth('JWT')
@AccountingRead()
@Controller('credits')
@BranchScoped()
export class CreditAccountController {
  constructor(
    private readonly getAllCredits: GetAllCreditsUseCase,
    private readonly getClientCredits: GetClientCreditsUseCase,
    private readonly registerPayment: RegisterPaymentUseCase,
    private readonly registerBatchPayment: RegisterBatchPaymentUseCase,
    private readonly editCredit: EditCreditUseCase,
    private readonly deleteCreditUseCase: DeleteCreditUseCase,
    private readonly addSaleToCreditUseCase: AddSaleToCreditUseCase,
    @Inject(CREDIT_ACCOUNT_REPOSITORY) private readonly creditRepository: ICreditAccountRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar creditos', description: 'Obtiene todos los creditos con filtros por cliente y estado' })
  async findAll(@Query() filter: FilterCreditDto) { return this.getAllCredits.execute(filter); }

  @Get('client/:clientId/open')
  @ApiOperation({ summary: 'Cuentas abiertas de un cliente', description: 'Obtiene las cuentas de crédito pendientes o parciales de un cliente' })
  @SellerAccess()
  async findOpenByClient(@Param('clientId') clientId: string) { return this.creditRepository.findOpenByClientId(clientId); }

  @Get('client/:clientId')
  @ApiOperation({ summary: 'Creditos de un cliente', description: 'Obtiene todos los creditos de un cliente especifico' })
  @ApiParam({ name: 'clientId', description: 'ID del cliente' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findByClient(@Param('clientId') clientId: string, @Query('page') page?: number, @Query('limit') limit?: number) { return this.getClientCredits.execute(clientId, page, limit); }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de credito', description: 'Obtiene el detalle de un credito con su historial de pagos' })
  @ApiParam({ name: 'id', description: 'ID del credito' })
  async findById(@Param('id') id: string) { return this.creditRepository.findById(id); }

  @Post('payments/batch')
  @ApiOperation({ summary: 'Registrar pago por lote', description: 'Registra pagos a múltiples cuentas de crédito de un cliente en una sola operación' })
  async payBatch(@Body() dto: RegisterBatchPaymentDto, @CurrentUser('id') userId: string) { return this.registerBatchPayment.execute(dto, userId); }

  @Post(':id/payments')
  @ApiOperation({ summary: 'Registrar pago de credito', description: 'Registra un pago parcial o total de un credito. Crea automaticamente una entrada en la caja del dia' })
  @ApiParam({ name: 'id', description: 'ID del credito' })
  async pay(@Param('id') id: string, @Body() dto: RegisterPaymentDto, @CurrentUser('id') userId: string) { return this.registerPayment.execute(id, dto, userId); }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar credito', description: 'Edita el monto total de un credito. Recalcula el pendiente y el estado' })
  @ApiParam({ name: 'id', description: 'ID del credito' })
  async update(@Param('id') id: string, @Body() dto: EditCreditDto) { return this.editCredit.execute(id, dto); }

  @Post(':id/add-sale')
  @ApiOperation({ summary: 'Agregar venta a cuenta de crédito', description: 'Añade una venta existente a una cuenta de crédito, incrementando la deuda' })
  async addSale(@Param('id') id: string, @Body() dto: AddSaleDto) { return this.addSaleToCreditUseCase.execute(id, dto.saleId, dto.amount); }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar credito', description: 'Elimina permanentemente un credito' })
  @ApiParam({ name: 'id', description: 'ID del credito' })
  async remove(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.deleteCreditUseCase.execute(id, userId); }
}
