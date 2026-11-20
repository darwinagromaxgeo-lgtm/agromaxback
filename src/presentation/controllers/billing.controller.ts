import { SellerAccess } from '../../common/decorators/seller-access.decorator';
import { Body, Controller, Get, Param, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { BranchScoped } from '../../common/decorators/branch-scoped.decorator';
import { CurrentBranch } from '../../common/decorators/current-branch.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BranchEntity } from '../../domain/entities/branch.entity';
import { BillingService } from '../../application/services/billing.service';
import { CreateBillingDraftDto } from '../../application/dtos/billing/create-billing-draft.dto';
import { FilterBillingDocumentsDto } from '../../application/dtos/billing/filter-billing-documents.dto';
import { DiscardBillingDraftDto } from '../../application/dtos/billing/discard-billing-draft.dto';
import { BillingDocumentIdDto, BillingFileParamsDto, IssueBillingDocumentDto } from '../../application/dtos/billing/billing-action.dto';
import { UpdateBillingReceiverDto } from '../../application/dtos/billing/billing-receiver.dto';

@ApiTags('Billing')
@ApiBearerAuth('JWT')
@BranchScoped()
@Roles('ADMIN', 'VENDEDOR')
@Controller('billing')
@SellerAccess()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('status')
  @ApiOperation({ summary: 'Estado de conexión del servicio de facturación, sin credenciales' })
  status(@CurrentBranch() branch: BranchEntity) { return this.billing.getStatus(branch); }

  @Get('sales/:id/groups')
  groups(@Param() params: BillingDocumentIdDto, @CurrentBranch() branch: BranchEntity) { return this.billing.saleGroups(params.id, branch); }

  @Get('sales/:id/receiver')
  saleReceiver(@Param() params: BillingDocumentIdDto, @CurrentBranch() branch: BranchEntity) { return this.billing.saleReceiver(params.id, branch); }

  @Post('documents/:id/receiver')
  updateReceiver(@Param() params: BillingDocumentIdDto, @Body() dto: UpdateBillingReceiverDto, @CurrentBranch('id') branchId: string, @CurrentUser('id') userId: string) { return this.billing.updateReceiver(params.id, branchId, dto.receiver, userId, dto.expectedRevision); }

  @Get('documents')
  @ApiOperation({ summary: 'Comprobantes de venta de la sucursal activa' })
  list(@Query() filter: FilterBillingDocumentsDto, @CurrentBranch('id') branchId: string) { return this.billing.findAll(filter, branchId); }

  @Post('preview')
  @ApiOperation({ summary: 'Previsualizar por empresa y afectación, sin modificar venta, stock ni caja' })
  preview(@Body() dto: CreateBillingDraftDto, @CurrentBranch() branch: BranchEntity) { return this.billing.preview(dto, branch); }

  @Post('documents')
  @ApiOperation({ summary: 'Guardar borrador de factura o boleta, con gravados y exonerados separados' })
  create(@Body() dto: CreateBillingDraftDto, @CurrentBranch() branch: BranchEntity, @CurrentUser('id') userId: string) { return this.billing.createDraft(dto, branch, userId); }

  @Get('documents/:id')
  findOne(@Param() params: BillingDocumentIdDto, @CurrentBranch('id') branchId: string) { return this.billing.findById(params.id, branchId); }

  @Post('documents/:id/discard')
  discard(@Param() params: BillingDocumentIdDto, @Body() dto: DiscardBillingDraftDto, @CurrentBranch('id') branchId: string, @CurrentUser('id') userId: string) { return this.billing.discard(params.id, branchId, dto.reason, userId); }

  @Post('documents/:id/issue')
  @ApiOperation({ summary: 'Emitir con confirmación explícita, numeración reservada y protección de duplicados' })
  issue(@Param() params: BillingDocumentIdDto, @Body() dto: IssueBillingDocumentDto, @CurrentBranch() branch: BranchEntity, @CurrentUser('id') userId: string) { return this.billing.issue(params.id, branch, userId, dto.receiverRevision); }

  @Post('documents/:id/simulate')
  @ApiOperation({ summary: 'Simular un borrador sin contactar a SUNAT ni reservar correlativos' })
  simulate(@Param() params: BillingDocumentIdDto, @CurrentBranch('id') branchId: string) { return this.billing.simulate(params.id, branchId); }

  @Post('documents/:id/check-status')
  checkStatus(@Param() params: BillingDocumentIdDto, @CurrentBranch('id') branchId: string) { return this.billing.checkStatus(params.id, branchId); }

  @Get('documents/:id/files/:format')
  async file(@Param() params: BillingFileParamsDto, @CurrentBranch('id') branchId: string, @Res({ passthrough: true }) response: Response) {
    const format = params.format;
    const artifact = await this.billing.artifact(params.id, branchId, format);
    response.set({ 'Content-Type': format === 'pdf' ? 'application/pdf' : format === 'xml' ? 'application/xml' : 'application/zip', 'Content-Disposition': `attachment; filename="${artifact.filename}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(Buffer.from(artifact.data, 'base64'));
  }
}
