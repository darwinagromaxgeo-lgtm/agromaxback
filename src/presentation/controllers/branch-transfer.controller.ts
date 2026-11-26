import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BranchScoped } from '../../common/decorators/branch-scoped.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentBranch } from '../../common/decorators/current-branch.decorator';
import { SellerAccess } from '../../common/decorators/seller-access.decorator';
import { BranchTransferRequestDto, CreateBranchTransferDto, FilterBranchTransfersDto } from '../../application/dtos/stock/branch-transfer.dto';
import { DirectBranchTransferUseCase } from '../../application/use-cases/stock/direct-branch-transfer.use-case';

@ApiTags('Branch transfers') @ApiBearerAuth('JWT') @BranchScoped() @Roles('ADMIN', 'VENDEDOR') @SellerAccess()
@Controller('stock/branch-transfers')
export class BranchTransferController {
  constructor(private readonly transfers: DirectBranchTransferUseCase) {}
  @Get()
  @ApiOperation({ summary: 'Historial de transferencias directas entre sucursales' })
  list(@Query() filter: FilterBranchTransfersDto, @CurrentUser('role') role: string, @CurrentUser('canTransferStock') canTransfer: boolean, @CurrentBranch('id') branchId: string) { return this.transfers.list(filter, role, canTransfer, branchId); }
  @Get('options')
  options(@CurrentUser('role') role: string, @CurrentUser('canTransferStock') canTransfer: boolean, @CurrentBranch('id') branchId: string) { return this.transfers.options(role, canTransfer, branchId); }
  @Get('request/:requestId')
  findByRequest(@Param() params: BranchTransferRequestDto, @CurrentUser('id') userId: string, @CurrentUser('role') role: string, @CurrentUser('canTransferStock') canTransfer: boolean, @CurrentBranch('id') branchId: string) { return this.transfers.findByRequest(params.requestId, userId, role, canTransfer, branchId); }
  @Post()
  @ApiOperation({ summary: 'Transferir stock directamente y registrar ambos movimientos en una transacción' })
  create(@Body() dto: CreateBranchTransferDto, @CurrentUser('id') userId: string, @CurrentUser('role') role: string, @CurrentUser('canTransferStock') canTransfer: boolean, @CurrentBranch('id') branchId: string) { return this.transfers.execute(dto, userId, role, canTransfer, branchId); }
}
