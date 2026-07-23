import { Controller, Delete, Get, Post, Patch, Body, Query, Param } from '@nestjs/common';
import { BranchScoped } from '../../common/decorators/branch-scoped.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RegisterPurchaseUseCase } from '../../application/use-cases/purchase/register-purchase.use-case';
import { GetPurchasesUseCase } from '../../application/use-cases/purchase/get-purchases.use-case';
import { ReceivePurchaseUseCase } from '../../application/use-cases/purchase/receive-purchase.use-case';
import { UpdateRemisionGuiaUseCase } from '../../application/use-cases/purchase/update-remision-guia.use-case';
import { UpdatePurchaseUseCase } from '../../application/use-cases/purchase/update-purchase.use-case';
import { EditPurchaseItemsUseCase } from '../../application/use-cases/purchase/edit-purchase-items.use-case';
import { DeletePurchaseUseCase } from '../../application/use-cases/purchase/delete-purchase.use-case';
import { CreatePurchaseDto } from '../../application/dtos/purchase/create-purchase.dto';
import { FilterPurchaseDto } from '../../application/dtos/purchase/filter-purchase.dto';
import { RegisterReceptionDto } from '../../application/dtos/purchase/receive-purchase.dto';
import { UpdateRemisionGuiaDto } from '../../application/dtos/purchase/update-remision-guia.dto';
import { UpdatePurchaseDto } from '../../application/dtos/purchase/update-purchase.dto';
import { EditPurchaseItemsDto } from '../../application/dtos/purchase/edit-purchase-items.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Inject } from '@nestjs/common';
import { IPurchaseRepository, PURCHASE_REPOSITORY } from '../../domain/repositories/purchase.repository';
import { IAccountPayableRepository, ACCOUNT_PAYABLE_REPOSITORY } from '../../domain/repositories/account-payable.repository';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Purchases')
@ApiBearerAuth('JWT')
@Controller('purchases')
@BranchScoped()
export class PurchaseController {
  constructor(
    private readonly registerPurchase: RegisterPurchaseUseCase,
    private readonly getPurchases: GetPurchasesUseCase,
    private readonly receivePurchase: ReceivePurchaseUseCase,
    private readonly updateRemisionGuia: UpdateRemisionGuiaUseCase,
    private readonly updatePurchaseUC: UpdatePurchaseUseCase,
    private readonly editPurchaseItemsUC: EditPurchaseItemsUseCase,
    private readonly deletePurchaseUC: DeletePurchaseUseCase,
    @Inject(PURCHASE_REPOSITORY) private readonly purchaseRepository: IPurchaseRepository,
    @Inject(ACCOUNT_PAYABLE_REPOSITORY) private readonly apRepository: IAccountPayableRepository,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Registrar compra' })
  async create(@Body() dto: CreatePurchaseDto, @CurrentUser('id') userId: string) {
    return this.registerPurchase.execute(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Listar compras' })
  async findAll(@Query() filter: FilterPurchaseDto) {
    return this.getPurchases.execute(filter);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener compra por ID' })
  async findOne(@Param('id') id: string) {
    return this.purchaseRepository.findById(id);
  }

  @Get(':id/account-payable')
  @ApiOperation({ summary: 'Obtener cuenta por pagar asociada a una compra' })
  async getAccountPayable(@Param('id') id: string) {
    return this.apRepository.findByPurchaseId(id);
  }

  @Post(':id/receive')
  @ApiOperation({ summary: 'Registrar recepción parcial o total de mercadería' })
  async receive(@Param('id') id: string, @Body() dto: RegisterReceptionDto, @CurrentUser('id') userId: string) {
    return this.receivePurchase.execute(id, { ...dto, userId });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar metadatos y condiciones de pago de una compra' })
  async update(@Param('id') id: string, @Body() dto: UpdatePurchaseDto) {
    return this.updatePurchaseUC.execute(id, dto);
  }

  @Patch(':id/items')
  @ApiOperation({ summary: 'Editar o agregar productos a una compra existente' })
  async editItems(@Param('id') id: string, @Body() dto: EditPurchaseItemsDto, @CurrentUser('id') userId: string) {
    return this.editPurchaseItemsUC.execute(id, dto, userId);
  }

  @Patch(':id/remision-guia')
  @ApiOperation({ summary: 'Agregar o actualizar guía de remisión de una compra' })
  async setRemisionGuia(@Param('id') id: string, @Body() dto: UpdateRemisionGuiaDto) {
    return this.updateRemisionGuia.execute(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN', 'VENDEDOR')
  @ApiOperation({ summary: 'Eliminar compra, stock recibido y cuenta por pagar asociada' })
  async remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.deletePurchaseUC.execute(id, userId);
  }
}
