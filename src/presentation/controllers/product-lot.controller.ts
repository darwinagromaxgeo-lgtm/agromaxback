import { SellerAccess } from '../../common/decorators/seller-access.decorator';
import { Controller, Get, Post, Patch, Query, Body, Param } from '@nestjs/common';
import { BranchScoped } from '../../common/decorators/branch-scoped.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GetProductLotsUseCase } from '../../application/use-cases/product-lot/get-product-lots.use-case';
import { UpsertProductLotUseCase } from '../../application/use-cases/product-lot/upsert-product-lot.use-case';
import { UpdateProductLotUseCase } from '../../application/use-cases/product-lot/update-product-lot.use-case';
import { CreateProductLotDto } from '../../application/dtos/product-lot/create-product-lot.dto';
import { UpdateProductLotDto } from '../../application/dtos/product-lot/update-product-lot.dto';

@ApiTags('ProductLots')
@ApiBearerAuth('JWT')
@Controller('product-lots')
@BranchScoped()
export class ProductLotController {
  constructor(
    private readonly getLots: GetProductLotsUseCase,
    private readonly upsertLot: UpsertProductLotUseCase,
    private readonly updateLot: UpdateProductLotUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Registrar lote manualmente' })
  async create(@Body() dto: CreateProductLotDto) {
    return this.upsertLot.execute({
      productId: dto.productId,
      companyId: dto.companyId,
      lotNumber: dto.lotNumber,
      expirationDate: dto.expirationDate ? new Date(dto.expirationDate + 'T12:00:00.000Z') : undefined,
      quantity: dto.quantity,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Listar lotes de producto por empresa o producto' })
  @SellerAccess()
  async findAll(
    @Query('companyId') companyId?: string,
    @Query('productId') productId?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.getLots.execute({
      companyId,
      productId,
      activeOnly: activeOnly === undefined ? true : activeOnly !== 'false',
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar código de lote, fecha de vencimiento o estado activo' })
  async update(@Param('id') id: string, @Body() dto: UpdateProductLotDto) {
    return this.updateLot.execute(id, dto);
  }

  @Get('expiring')
  @ApiOperation({ summary: 'Lotes próximos a vencer' })
  async expiring(
    @Query('companyId') companyId: string,
    @Query('days') days?: string,
  ) {
    return this.getLots.expiring(companyId, days ? parseInt(days, 10) : 30);
  }
}
