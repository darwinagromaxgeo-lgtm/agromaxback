import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { BranchEntity } from '../../domain/entities/branch.entity';
import { BILLING_DOCUMENT_REPOSITORY, IBillingDocumentRepository } from '../../domain/repositories/billing-document.repository';
import { BILLING_CREDIT_NOTE_REPOSITORY, IBillingCreditNoteRepository } from '../../domain/repositories/billing-credit-note.repository';
import { BILLING_PROVIDER, IBillingProvider } from '../../domain/repositories/billing-provider';
import { COMPANY_REPOSITORY, ICompanyRepository } from '../../domain/repositories/company.repository';
import { CreateCreditNoteDto, FilterCreditNotesDto, PreviewCreditNoteDto } from '../dtos/billing/credit-note.dto';
import { buildCreditNote, creditNoteAvailability } from './credit-note-calculation';
import { sunatUnit } from './billing-calculation';

@Injectable()
export class BillingCreditNoteService {
  constructor(
    @Inject(BILLING_DOCUMENT_REPOSITORY) private readonly documents:IBillingDocumentRepository,
    @Inject(BILLING_CREDIT_NOTE_REPOSITORY) private readonly notes:IBillingCreditNoteRepository,
    @Inject(BILLING_PROVIDER) private readonly provider:IBillingProvider,
    @Inject(COMPANY_REPOSITORY) private readonly companies:ICompanyRepository,
  ) {}
  private async original(id:string, branch:BranchEntity) {
    const original=await this.documents.findById(id,branch.id!);
    if (!original || original.branchId!==branch.id) throw new NotFoundException('Comprobante original no encontrado en la sucursal activa');
    if (!branch.companyIds.includes(original.companyId)) throw new BadRequestException('La empresa no está habilitada en esta sucursal');
    return original;
  }
  async availability(id:string, branch:BranchEntity) {
    const original=await this.original(id,branch);
    const notes=await this.notes.forOriginal(id,branch.id!);
    const items=creditNoteAvailability(original,notes).map(({ usedBase,usedTax,...item })=>item);
    return { original,items,notes };
  }
  async preview(dto:PreviewCreditNoteDto, branch:BranchEntity) {
    const original=await this.original(dto.originalDocumentId,branch);
    return buildCreditNote(original,await this.notes.forOriginal(dto.originalDocumentId,branch.id!),dto);
  }
  async create(dto:CreateCreditNoteDto, branch:BranchEntity, userId:string) {
    await this.original(dto.originalDocumentId,branch);
    const requestHash=createHash('sha256').update(JSON.stringify({ originalDocumentId:dto.originalDocumentId,returnType:dto.returnType,reason:dto.reason.trim(),items:dto.items?.slice().sort((a,b)=>a.itemIndex-b.itemIndex) || [] })).digest('hex');
    return this.notes.createDraft(dto.originalDocumentId,branch.id!,dto.requestId,requestHash,(original,previous)=>({ ...buildCreditNote(original,previous,dto), createdBy:userId }));
  }
  list(filter:FilterCreditNotesDto,branchId:string) { return this.notes.findAll(branchId,filter); }
  async findById(id:string,branchId:string) {
    const note=await this.notes.findById(id,branchId);
    if (!note || note.branchId!==branchId) throw new NotFoundException('Nota de crédito no encontrada en la sucursal activa');
    return note;
  }
  async discard(id:string,branchId:string,reason:string,userId:string) {
    await this.findById(id,branchId);
    const note=await this.notes.discard(id,branchId,reason,userId);
    if (!note) throw new ConflictException('Solo se puede descartar una nota de crédito en borrador');
    return note;
  }
  async issue(id:string,branch:BranchEntity,userId:string) {
    const note=await this.findById(id,branch.id!);
    if (note.status!=='DRAFT') throw new ConflictException('Esta nota de crédito ya fue procesada. Consulta su estado');
    const original=await this.original(note.originalDocumentId,branch);
    const company=await this.companies.findById(note.companyId);
    if (original.status!=='ACCEPTED' || !original.hasCdr || !company?.isActive || company.ruc.trim()!==note.issuer.documentNumber) throw new BadRequestException('El comprobante original o la empresa emisora requieren revisión');
    if (note.originalSeries!==original.series || note.originalNumber!==original.number || note.originalDocumentType!==original.documentType || note.companyId!==original.companyId) throw new BadRequestException('La referencia al comprobante original no coincide');
    // All drafts and uncertain submissions remain reserved until discarded or definitively rejected.
    creditNoteAvailability(original,await this.notes.forOriginal(original.id!,branch.id!));
    for (const item of note.items) sunatUnit(item.unit);
    const status=await this.provider.getStatus(branch.billingSeriesCode,branch.sunatEstablishmentCode);
    if (!status.ready || !status.creditNotes?.ready || !status.environment || status.environment==='simulation') throw new BadRequestException(status.creditNotes?.message || 'El servicio todavía no habilita las notas de crédito');
    if (note.reasonCode==='01' && !status.creditNotes.cancellationReady) throw new BadRequestException('El facturador todavía no habilita las notas de crédito por anulación');
    if (status.issuerRuc!==note.issuer.documentNumber || status.environment!==note.environment || original.environment!==note.environment) throw new BadRequestException('El RUC o ambiente del facturador no coincide con el comprobante original');
    if (branch.sunatEstablishmentCode && note.issuer.establishmentCode!==branch.sunatEstablishmentCode) throw new BadRequestException('El establecimiento del comprobante original no coincide con la configuración actual');
    const claimed=await this.notes.claimDraft(id,branch.id!,userId);
    if (!claimed) throw new ConflictException('Otra solicitud está procesando esta nota de crédito');
    try {
      const series=status.creditNotes.series[note.originalDocumentType];
      const number=await this.documents.reserveNumber(status.issuerRuc!,series,status.environment,this.provider.getCreditNoteNumberingStart(note.originalDocumentType));
      const boletaSubmissionMode=note.originalDocumentType==='BOLETA' ? status.boletaSubmissionMode || 'summary' : undefined;
      const summaryDate=boletaSubmissionMode==='summary' ? new Date(claimed.submittedAt!).toLocaleDateString('en-CA',{ timeZone:'America/Lima' }) : undefined;
      const summaryNumber=summaryDate ? await this.documents.reserveNumber(status.issuerRuc!,`RC-${summaryDate}`,status.environment,this.provider.getNumberingStart('SUMMARY'),this.provider.getSummaryNumberLimit?.() ?? 99_999) : undefined;
      const submission={ series,number,environment:status.environment,boletaSubmissionMode,summaryDate,summaryNumber };
      await this.notes.setSubmission(id,branch.id!,submission);
      return await this.notes.saveResult(id,branch.id!,await this.provider.submitCreditNote({ ...claimed,...submission }));
    } catch {
      return this.notes.saveResult(id,branch.id!,{ status:'UNKNOWN',sunatDescription:'No se pudo confirmar la emisión de la nota de crédito. Consulta su estado; la devolución permanece reservada para evitar duplicados.' });
    }
  }
  async checkStatus(id:string,branchId:string) {
    const note=await this.findById(id,branchId);
    if (!['PENDING','UNKNOWN','SENDING'].includes(note.status) || !note.series || !note.number) return note;
    return this.notes.saveResult(id,branchId,await this.provider.checkCreditNoteStatus(note));
  }
  async artifact(id:string,branchId:string,format:'pdf'|'xml'|'cdr') {
    await this.findById(id,branchId);
    const file=await this.notes.artifact(id,branchId,format);
    if (!file) throw new NotFoundException('Este archivo todavía no está disponible');
    return file;
  }
}
