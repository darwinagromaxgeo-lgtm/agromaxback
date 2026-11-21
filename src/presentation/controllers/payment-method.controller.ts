import { AccountingRead } from '../../common/decorators/accounting-access.decorator';
import { SellerAccess } from '../../common/decorators/seller-access.decorator';
import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { ManagePaymentMethodsUseCase } from '../../application/use-cases/payment-method/manage-payment-methods.use-case';
import { CreatePaymentMethodDto, UpdatePaymentMethodDto } from '../../application/dtos/payment-method/create-payment-method.dto';

@ApiTags('Payment Methods')
@ApiBearerAuth('JWT')
@AccountingRead()
@Controller('payment-methods')
export class PaymentMethodController {
  constructor(
    private readonly managePaymentMethods: ManagePaymentMethodsUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear método de pago', description: 'Registra un nuevo método de pago' })
  async create(@Body() dto: CreatePaymentMethodDto) {
    return this.managePaymentMethods.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar métodos de pago', description: 'Obtiene todos los métodos de pago registrados' })
  @SellerAccess()
  async findAll() {
    return this.managePaymentMethods.findAll();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar método de pago', description: 'Modifica un método de pago existente' })
  @ApiParam({ name: 'id', description: 'ID del método de pago' })
  async update(@Param('id') id: string, @Body() dto: UpdatePaymentMethodDto) {
    return this.managePaymentMethods.update(id, dto);
  }
}
