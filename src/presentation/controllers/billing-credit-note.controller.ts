import { AccountingRead } from '../../common/decorators/accounting-access.decorator';
import { Body, Controller, Get, Param, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { BranchScoped } from '../../common/decorators/branch-scoped.decorator';
import { CurrentBranch } from '../../common/decorators/current-branch.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BranchEntity } from '../../domain/entities/branch.entity';
import { BillingCreditNoteService } from '../../application/services/billing-credit-note.service';
import { CreateCreditNoteDto, FilterCreditNotesDto, PreviewCreditNoteDto } from '../../application/dtos/billing/credit-note.dto';
import { BillingDocumentIdDto, BillingFileParamsDto, IssueBillingDocumentDto } from '../../application/dtos/billing/billing-action.dto';
import { DiscardBillingDraftDto } from '../../application/dtos/billing/discard-billing-draft.dto';

@ApiTags('Credit notes') @ApiBearerAuth('JWT') @BranchScoped() @Roles('ADMIN','VENDEDOR','CONTABILIDAD')
@AccountingRead()
@Controller('billing/credit-notes')
export class BillingCreditNoteController {
  constructor(private readonly notes:BillingCreditNoteService) {}
  @Get() list(@Query() filter:FilterCreditNotesDto,@CurrentBranch('id') branchId:string) { return this.notes.list(filter,branchId); }
  @Get('original/:id') availability(@Param() params:BillingDocumentIdDto,@CurrentBranch() branch:BranchEntity) { return this.notes.availability(params.id,branch); }
  @Post('preview') preview(@Body() dto:PreviewCreditNoteDto,@CurrentBranch() branch:BranchEntity) { return this.notes.preview(dto,branch); }
  @Post() create(@Body() dto:CreateCreditNoteDto,@CurrentBranch() branch:BranchEntity,@CurrentUser('id') userId:string) { return this.notes.create(dto,branch,userId); }
  @Get(':id') find(@Param() params:BillingDocumentIdDto,@CurrentBranch('id') branchId:string) { return this.notes.findById(params.id,branchId); }
  @Post(':id/discard') discard(@Param() params:BillingDocumentIdDto,@Body() dto:DiscardBillingDraftDto,@CurrentBranch('id') branchId:string,@CurrentUser('id') userId:string) { return this.notes.discard(params.id,branchId,dto.reason,userId); }
  @Post(':id/issue') issue(@Param() params:BillingDocumentIdDto,@Body() dto:IssueBillingDocumentDto,@CurrentBranch() branch:BranchEntity,@CurrentUser('id') userId:string) { return this.notes.issue(params.id,branch,userId); }
  @Post(':id/check-status') check(@Param() params:BillingDocumentIdDto,@CurrentBranch('id') branchId:string) { return this.notes.checkStatus(params.id,branchId); }
  @Get(':id/files/:format') async file(@Param() params:BillingFileParamsDto,@CurrentBranch('id') branchId:string,@Res({ passthrough:true }) response:Response) {
    const file=await this.notes.artifact(params.id,branchId,params.format);
    response.set({ 'Content-Type':params.format==='pdf'?'application/pdf':params.format==='xml'?'application/xml':'application/zip','Content-Disposition':`attachment; filename="${file.filename}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff' });
    return new StreamableFile(Buffer.from(file.data,'base64'));
  }
}
