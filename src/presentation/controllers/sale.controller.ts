import { SellerAccess } from '../../common/decorators/seller-access.decorator';
import { Controller, Get, Post, Patch, Delete, Body, Query, Param } from '@nestjs/common';
import { BranchScoped } from '../../common/decorators/branch-scoped.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { CreateSaleUseCase } from '../../application/use-cases/sale/create-sale.use-case';
import { GetSalesUseCase } from '../../application/use-cases/sale/get-sales.use-case';
import { CancelSaleUseCase } from '../../application/use-cases/sale/cancel-sale.use-case';
import { UpdateVoucherUseCase } from '../../application/use-cases/sale/update-voucher.use-case';
import { CreateSaleDto } from '../../application/dtos/sale/create-sale.dto';
import { FilterSaleDto } from '../../application/dtos/sale/filter-sale.dto';
import { CancelSaleDto } from '../../application/dtos/sale/cancel-sale.dto';
import { UpdateVoucherDto } from '../../application/dtos/sale/update-voucher.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentBranch } from '../../common/decorators/current-branch.decorator';

@ApiTags('Sales')
@ApiBearerAuth('JWT')
@Controller('sales')
@BranchScoped()
export class SaleController {
  constructor(
    private readonly createSale: CreateSaleUseCase,
    private readonly getSales: GetSalesUseCase,
    private readonly cancelSale: CancelSaleUseCase,
    private readonly updateVoucher: UpdateVoucherUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Registrar venta', description: 'Crea una venta (mixta multi-empresa). Descuenta stock, registra en caja (efectivo) o crea credito (credito)' })
  @SellerAccess()
  async create(
    @Body() dto: CreateSaleDto,
    @CurrentUser('id') userId: string,
    @CurrentBranch('id') branchId: string,
  ) {
    return this.createSale.execute(dto, userId, branchId);
  }

  @Get()
  @ApiOperation({ summary: 'Listar ventas', description: 'Obtiene lista paginada de ventas con filtros opcionales' })
  @SellerAccess()
  async findAll(@Query() filter: FilterSaleDto) { return this.getSales.execute(filter); }

  @Patch(':id/voucher')
  @ApiOperation({ summary: 'Actualizar comprobante', description: 'Cambia el tipo de comprobante de una venta' })
  @ApiParam({ name: 'id', description: 'ID de la venta' })
  @SellerAccess()
  async updateVoucherType(@Param('id') id: string, @Body() dto: UpdateVoucherDto) {
    return this.updateVoucher.execute(id, dto.voucherType);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Anular venta', description: 'Anula una venta: devuelve stock, elimina entradas de caja y anula crédito si aplica' })
  @ApiParam({ name: 'id', description: 'ID de la venta' })
  async cancel(@Param('id') id: string, @Body() dto: CancelSaleDto, @CurrentUser('id') userId: string) {
    return this.cancelSale.execute(id, dto.reason, userId);
  }
}
