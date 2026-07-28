import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateStockRequestDto } from '../../application/dtos/stock/create-stock-request.dto';
import {
  ApproveStockRequestDto,
  RejectStockRequestDto,
} from '../../application/dtos/stock/update-stock-request.dto';
import { ManageStockRequestsUseCase } from '../../application/use-cases/stock/manage-stock-requests.use-case';
import { BranchScoped } from '../../common/decorators/branch-scoped.decorator';
import { CurrentBranch } from '../../common/decorators/current-branch.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { StockRequestStatus } from '../../domain/entities/stock-request.entity';

@ApiTags('Stock Requests')
@ApiBearerAuth('JWT')
@Controller('stock-requests')
@BranchScoped()
export class StockRequestController {
  constructor(private readonly requests: ManageStockRequestsUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Listar solicitudes relacionadas con la sucursal actual' })
  list(
    @CurrentBranch('id') branchId: string,
    @Query('status') status?: StockRequestStatus,
    @Query('direction') direction?: 'incoming' | 'outgoing',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.requests.list(
      branchId,
      { status, direction },
      Math.max(1, Number(page) || 1),
      Math.min(100, Math.max(1, Number(limit) || 20)),
    );
  }

  @Post()
  @ApiOperation({ summary: 'Solicitar productos a otra sucursal' })
  create(
    @Body() dto: CreateStockRequestDto,
    @CurrentUser('id') userId: string,
    @CurrentBranch('id') branchId: string,
  ) {
    return this.requests.create(dto, userId, branchId);
  }

  @Roles('ADMIN', 'ALMACENERO')
  @Patch(':id/approve')
  @ApiOperation({ summary: 'Aprobar una solicitud recibida' })
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveStockRequestDto,
    @CurrentUser('id') userId: string,
    @CurrentBranch('id') branchId: string,
  ) {
    return this.requests.approve(id, branchId, userId, dto.notes);
  }

  @Roles('ADMIN', 'ALMACENERO')
  @Patch(':id/reject')
  @ApiOperation({ summary: 'Rechazar una solicitud recibida' })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectStockRequestDto,
    @CurrentUser('id') userId: string,
    @CurrentBranch('id') branchId: string,
  ) {
    return this.requests.reject(id, branchId, userId, dto.reason);
  }

  @Roles('ADMIN', 'ALMACENERO')
  @Patch(':id/dispatch')
  @ApiOperation({ summary: 'Despachar una solicitud aprobada' })
  dispatch(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentBranch('id') branchId: string,
  ) {
    return this.requests.dispatch(id, branchId, userId);
  }

  @Roles('ADMIN', 'ALMACENERO')
  @Patch(':id/receive')
  @ApiOperation({ summary: 'Confirmar recepción en la sucursal solicitante' })
  receive(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentBranch('id') branchId: string,
  ) {
    return this.requests.receive(id, branchId, userId);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancelar una solicitud pendiente' })
  cancel(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentBranch('id') branchId: string,
  ) {
    return this.requests.cancel(id, branchId, userId);
  }
}
