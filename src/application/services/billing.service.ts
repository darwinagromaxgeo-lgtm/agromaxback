import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BillingDocumentEntity, BillingItemSnapshot, BillingPartySnapshot, BillingSimulation, BillingTaxType } from '../../domain/entities/billing-document.entity';
import { BranchEntity } from '../../domain/entities/branch.entity';
import { BILLING_DOCUMENT_REPOSITORY, IBillingDocumentRepository } from '../../domain/repositories/billing-document.repository';
import { BILLING_PROVIDER, IBillingProvider } from '../../domain/repositories/billing-provider';
import { CLIENT_REPOSITORY, IClientRepository } from '../../domain/repositories/client.repository';
import { COMPANY_REPOSITORY, ICompanyRepository } from '../../domain/repositories/company.repository';
import { PRODUCT_REPOSITORY, IProductRepository } from '../../domain/repositories/product.repository';
import { ISaleRepository, SALE_REPOSITORY } from '../../domain/repositories/sale.repository';
import { CreateBillingDraftDto } from '../dtos/billing/create-billing-draft.dto';
import { FilterBillingDocumentsDto } from '../dtos/billing/filter-billing-documents.dto';
import { calculateBillingItem, moneyCents, sunatUnit } from './billing-calculation';
import { normalizeBillingReceiver, sameBillingReceiver } from './billing-receiver';

@Injectable()
export class BillingService {
  constructor(
    @Inject(BILLING_DOCUMENT_REPOSITORY) private readonly documents: IBillingDocumentRepository,
    @Inject(SALE_REPOSITORY) private readonly sales: ISaleRepository,
    @Inject(COMPANY_REPOSITORY) private readonly companies: ICompanyRepository,
    @Inject(CLIENT_REPOSITORY) private readonly clients: IClientRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly products: IProductRepository,
    @Inject(BILLING_PROVIDER) private readonly provider: IBillingProvider,
  ) {}

  getStatus(branch?: BranchEntity) { return this.provider.getStatus(branch?.billingSeriesCode, branch?.sunatEstablishmentCode); }

  private receiverFromClient(client: { name: string; documentNumber?: string; address?: string; email?: string } | null): BillingPartySnapshot {
    const number = client?.documentNumber?.replace(/\s/g, '') || '';
    return { name: client?.name.trim() || 'CONSUMIDOR FINAL', documentType: number.length === 11 ? 'RUC' : number.length === 8 ? 'DNI' : 'UNIDENTIFIED', documentNumber: number || undefined, address: client?.address, email: client?.email };
  }

  async saleReceiver(id: string, branch: BranchEntity) {
    const sale = await this.sales.findById(id, branch.id!);
    if (!sale || sale.branchId !== branch.id) throw new NotFoundException('Venta no encontrada en la sucursal activa');
    const client = sale.clientId ? await this.clients.findById(sale.clientId) : null;
    if (sale.clientId && (!client || client.branchId !== branch.id)) throw new BadRequestException('El cliente no pertenece a la sucursal activa');
    return this.receiverFromClient(client);
  }

  async updateReceiver(id: string, branchId: string, receiver: BillingPartySnapshot, userId: string, expectedRevision: number) {
    const document = await this.findById(id, branchId);
    if (document.status !== 'DRAFT') throw new ConflictException('Solo puedes editar el receptor de un borrador sin enviar');
    const normalized = normalizeBillingReceiver(document.documentType, document.total, receiver);
    const updated = await this.documents.updateReceiver(id, branchId, normalized, userId, expectedRevision);
    if (!updated) throw new ConflictException('El borrador cambió durante la edición. Actualiza sus datos antes de continuar');
    return updated;
  }

  async saleGroups(id: string, branch: BranchEntity) {
    const sale = await this.sales.findById(id, branch.id!);
    if (!sale || sale.branchId !== branch.id) throw new NotFoundException('Venta no encontrada en la sucursal activa');
    if (sale.isCancelled) throw new BadRequestException('La venta está anulada');
    const groups = new Map<string, { companyId: string; companyName: string; taxType: BillingTaxType; total: number; items: number }>();
    for (const item of sale.items) {
      if (!branch.companyIds.includes(item.companyId)) continue;
      const [company, product] = await Promise.all([this.companies.findById(item.companyId), this.products.findById(item.productId)]);
      const taxType = item.taxType || product?.taxType;
      if (!company?.isActive || !taxType || !['GRAVADO', 'EXONERADO', 'INAFECTO'].includes(taxType)) continue;
      const key = `${item.companyId}:${taxType}`;
      const group = groups.get(key) || { companyId: item.companyId, companyName: company.name, taxType: taxType as BillingTaxType, total: 0, items: 0 };
      group.total = (moneyCents(group.total) + moneyCents(item.subtotal)) / 100;
      group.items++;
      groups.set(key, group);
    }
    return [...groups.values()];
  }

  async findAll(filter: FilterBillingDocumentsDto, branchId: string) {
    const startDate = filter.startDate ? new Date(`${filter.startDate.slice(0, 10)}T00:00:00.000-05:00`) : undefined;
    const endDate = filter.endDate ? new Date(`${filter.endDate.slice(0, 10)}T23:59:59.999-05:00`) : undefined;
    if (startDate && endDate && startDate > endDate) throw new BadRequestException('El rango de fechas no es válido');
    if (filter.saleId && filter.saleIds) throw new BadRequestException('Usa saleId o saleIds, no ambos filtros');
    return this.documents.findAll({ branchId, companyId: filter.companyId, saleId: filter.saleId, saleIds: filter.saleIds, documentType: filter.documentType, status: filter.status, startDate, endDate }, filter.page, filter.limit);
  }

  async findById(id: string, branchId: string) {
    const document = await this.documents.findById(id, branchId);
    if (!document) throw new NotFoundException('Comprobante no encontrado en la sucursal activa');
    return document;
  }

  async preview(dto: CreateBillingDraftDto, branch: BranchEntity): Promise<BillingDocumentEntity> {
    if (dto.replacesDocumentId) return this.previewReissue(dto,branch);
    const branchId = branch.id!;
    if (!branch.companyIds.includes(dto.companyId)) throw new BadRequestException('La empresa no está habilitada en esta sucursal');
    const sale = await this.sales.findById(dto.saleId, branchId);
    if (!sale || sale.branchId !== branchId) throw new NotFoundException('Venta no encontrada en la sucursal activa');
    if (sale.isCancelled) throw new BadRequestException('No se puede preparar un comprobante de una venta anulada');
    const company = await this.companies.findById(dto.companyId);
    if (!company?.isActive) throw new BadRequestException('Empresa emisora no disponible');
    if (!/^\d{11}$/.test(company.ruc.trim()) || !company.name.trim()) throw new BadRequestException('Completa nombre y RUC de 11 dígitos de la empresa emisora');
    const saleTotal = sale.items.reduce((total, item) => total + moneyCents(item.subtotal), 0);
    if (saleTotal !== moneyCents(sale.total)) throw new BadRequestException('El total de la venta no coincide con sus productos; revisa la operación');
    const companyItems = sale.items.filter(item => item.companyId === dto.companyId);
    if (!companyItems.length) throw new BadRequestException('La venta no contiene productos de esta empresa');
    const client = sale.clientId ? await this.clients.findById(sale.clientId) : null;
    if (sale.clientId && (!client || client.branchId !== branchId)) throw new BadRequestException('El cliente no pertenece a la sucursal activa');
    let legacyTaxData = false;
    const items: BillingItemSnapshot[] = [];
    for (const item of companyItems) {
      const product = await this.products.findById(item.productId);
      const taxType = item.taxType ?? product?.taxType;
      if (!taxType) throw new BadRequestException(`Completa la afectación tributaria de ${item.productName || 'un producto de la venta'}`);
      if (taxType !== dto.taxType) continue;
      if (!item.taxType || item.taxRate == null || !item.unit) legacyTaxData = true;
      const unit = item.unit || product?.unit;
      if (!unit) throw new BadRequestException('Completa la unidad de medida del producto');
      items.push(calculateBillingItem({
        ...item,
        description: item.productName || product?.name || item.productId,
        unit,
        taxType,
        taxRate: item.taxRate,
      }));
    }
    if (!items.length) throw new BadRequestException('La venta no tiene productos con la afectación tributaria seleccionada');
    const sum = (taxType?: BillingTaxType, tax = false) => items
      .filter(item => !taxType || item.taxType === taxType)
      .reduce((total, item) => total + moneyCents(tax ? item.taxAmount : item.baseAmount), 0) / 100;
    const warnings: string[] = [];
    if (legacyTaxData) warnings.push('Venta anterior sin todos los datos tributarios históricos. Se utilizó el catálogo actual donde faltaban datos; revisa afectación, unidades e importes.');
    if (sale.isCredit) warnings.push('La emisión a crédito requiere definir su cronograma fiscal; por ahora se puede guardar el borrador.');
    const total = items.reduce((value, item) => value + moneyCents(item.total), 0) / 100;
    if (total <= 0) throw new BadRequestException('Esta etapa requiere un comprobante con total mayor que cero');
    const receiver = normalizeBillingReceiver(dto.documentType, total, dto.receiver || this.receiverFromClient(client));
    return {
      branchId,
      companyId: dto.companyId,
      saleId: dto.saleId,
      documentType: dto.documentType,
      taxType: dto.taxType,
      status: 'DRAFT',
      currency: 'PEN',
      issuer: { name: company.name.trim(), documentType: 'RUC', documentNumber: company.ruc.trim(), address: company.address },
      receiver,
      items,
      taxableAmount: sum('GRAVADO'),
      exemptAmount: sum('EXONERADO'),
      unaffectedAmount: sum('INAFECTO'),
      taxAmount: sum(undefined, true),
      total,
      paymentCondition: sale.isCredit ? 'CREDITO' : 'CONTADO',
      saleDate: new Date(sale.date),
      warnings,
      legacyTaxData,
    };
  }

  private async previewReissue(dto:CreateBillingDraftDto,branch:BranchEntity):Promise<BillingDocumentEntity> {
    const original=await this.findById(dto.replacesDocumentId!,branch.id!);
    if (!original.cancelledByCreditNoteId || !original.cancelledAt || original.status!=='ACCEPTED') throw new BadRequestException('Primero debe aceptarse la nota de crédito que anula este comprobante');
    if (original.saleId!==dto.saleId || original.companyId!==dto.companyId || original.taxType!==dto.taxType || !branch.companyIds.includes(original.companyId)) throw new BadRequestException('La nueva emisión debe corresponder al mismo pedido, empresa y afectación tributaria');
    if (original.replacementDocumentId) {
      const replacement=await this.findById(original.replacementDocumentId,branch.id!);
      if (replacement.status!=='DISCARDED') throw new ConflictException('Este comprobante ya fue reemplazado. Abre el nuevo comprobante para continuar');
    }
    const [sale,company]=await Promise.all([this.sales.findById(original.saleId,branch.id!),this.companies.findById(original.companyId)]);
    if (!sale || sale.branchId!==branch.id || sale.isCancelled || !company?.isActive || company.ruc.trim()!==original.issuer.documentNumber) throw new BadRequestException('El pedido o la empresa emisora no están disponibles para una nueva emisión');
    const receiver=normalizeBillingReceiver(dto.documentType,original.total,dto.receiver || original.receiver);
    return {
      branchId:original.branchId,companyId:original.companyId,saleId:original.saleId,documentType:dto.documentType,
      taxType:original.taxType,status:'DRAFT',currency:original.currency,issuer:{...original.issuer},receiver,
      items:original.items.map(item=>({...item})),taxableAmount:original.taxableAmount,exemptAmount:original.exemptAmount,unaffectedAmount:original.unaffectedAmount,taxAmount:original.taxAmount,total:original.total,
      paymentCondition:original.paymentCondition,saleDate:original.saleDate,warnings:[],legacyTaxData:false,environment:original.environment,
      replacesDocumentId:original.id,reissueAfterCreditNoteId:original.cancelledByCreditNoteId,
    };
  }

  async createDraft(dto: CreateBillingDraftDto, branch: BranchEntity, userId: string) {
    const existing = await this.documents.findForSale(dto.saleId, dto.companyId, dto.taxType, branch.id!);
    if (existing) {
      if (dto.replacesDocumentId && existing.replacesDocumentId!==dto.replacesDocumentId) throw new ConflictException('El pedido ya tiene otro comprobante vigente. Ábrelo para continuar');
      return this.existingDraft(existing, dto.documentType, dto.receiver);
    }
    if (!dto.replacesDocumentId && await this.documents.findCancelledForSale(dto.saleId,dto.companyId,dto.taxType,branch.id!)) throw new ConflictException('El comprobante anterior está anulado. Usa Volver a emitir desde ese comprobante para conservar su historial');
    const document = await this.preview(dto, branch);
    if (document.legacyTaxData && dto.legacyTaxConfirmed !== true) throw new BadRequestException('Confirma la revisión de datos tributarios de esta venta anterior');
    try {
      const saved=await this.documents.createDraft({ ...document, createdBy: userId });
      return dto.replacesDocumentId ? this.existingDraft(saved,dto.documentType,dto.receiver) : saved;
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      const winner = await this.documents.findForSale(dto.saleId, dto.companyId, dto.taxType, branch.id!);
      if (!winner) throw new ConflictException('Otra solicitud está preparando este comprobante. Actualiza el listado');
      if (dto.replacesDocumentId && winner.replacesDocumentId!==dto.replacesDocumentId) throw new ConflictException('El pedido ya tiene otro comprobante vigente. Actualiza su historial');
      return this.existingDraft(winner, dto.documentType, dto.receiver);
    }
  }

  private existingDraft(existing: BillingDocumentEntity, documentType: string, receiver?: BillingPartySnapshot) {
    if (existing.status !== 'DRAFT') throw new ConflictException('Este grupo de productos ya tiene un comprobante enviado o en revisión');
    if (existing.documentType !== documentType) throw new ConflictException('Ya existe un borrador de otro tipo para este grupo. Descártalo antes de crear uno nuevo');
    if (receiver && !sameBillingReceiver(existing.receiver, normalizeBillingReceiver(existing.documentType, existing.total, receiver))) throw new ConflictException('Ya existe un borrador con otro receptor. Ábrelo y edita el receptor antes del envío');
    return existing;
  }

  async discard(id: string, branchId: string, reason: string, userId: string) {
    await this.findById(id, branchId);
    const document = await this.documents.discard(id, branchId, reason, userId);
    if (!document) throw new ConflictException('Solo se puede descartar un borrador que no haya sido enviado');
    return document;
  }

  async simulate(id: string, branchId: string): Promise<BillingSimulation> {
    const document = await this.findById(id, branchId);
    if (document.status !== 'DRAFT') throw new ConflictException('La simulación está disponible para borradores sin enviar');
    const sale = await this.sales.findById(document.saleId, branchId);
    if (!sale || sale.branchId !== branchId || sale.isCancelled) throw new BadRequestException('La venta de origen no está disponible');
    const calculated = document.items.map(item => calculateBillingItem({ ...item, subtotal: item.total }));
    const totalsMatch = calculated.length > 0 && calculated.every((item, index) =>
      item.taxType === document.taxType && moneyCents(item.baseAmount) === moneyCents(document.items[index].baseAmount)
      && moneyCents(item.taxAmount) === moneyCents(document.items[index].taxAmount))
      && calculated.reduce((total, item) => total + moneyCents(item.total), 0) === moneyCents(document.total)
      && calculated.reduce((total, item) => total + moneyCents(item.taxAmount), 0) === moneyCents(document.taxAmount)
      && (['GRAVADO', 'EXONERADO', 'INAFECTO'] as const).every(type =>
        calculated.filter(item => item.taxType === type).reduce((total, item) => total + moneyCents(item.baseAmount), 0)
        === moneyCents(type === 'GRAVADO' ? document.taxableAmount : type === 'EXONERADO' ? document.exemptAmount : document.unaffectedAmount));
    let unitsValid = true;
    for (const item of calculated) { try { sunatUnit(item.unit); } catch { unitsValid = false; } }
    let identified = true;
    try { normalizeBillingReceiver(document.documentType, document.total, document.receiver); } catch { identified = false; }
    const checks = [
      { label: 'Importes y afectación separados', passed: totalsMatch, detail: totalsMatch ? 'El detalle, la base, el IGV y el total coinciden para un solo grupo tributario.' : 'Revisa los importes o las afectaciones del borrador.' },
      { label: 'Unidades de medida', passed: unitsValid, detail: unitsValid ? 'Las unidades tienen una equivalencia para el comprobante.' : 'Hay unidades que requieren configuración.' },
      { label: 'Datos del receptor', passed: identified, detail: identified ? document.receiver.documentType === 'UNIDENTIFIED' ? 'Boleta simple dentro del límite de S/700.' : 'El formato del documento es válido. La consulta de identidad en Decolecta se realiza por separado.' : 'Revisa el receptor antes de emitir. Facturas requieren RUC; boletas mayores de S/700 requieren DNI o RUC.' },
      { label: 'Condición de pago', passed: document.paymentCondition === 'CONTADO', detail: document.paymentCondition === 'CONTADO' ? 'Venta al contado.' : 'La emisión a crédito requiere implementar el cronograma fiscal de cuotas.' },
    ];
    const dataReady = checks.every(check => check.passed);
    const service = dataReady && this.provider.simulate ? await this.provider.simulate(document) : undefined;
    // Read-only: no fiscal number, CDR or stored status is produced.
    return { simulation: true, status: 'SIMULATED', document, checks, dataReady, service, message: 'Simulación sin validez tributaria. No se envió a SUNAT, no se consumieron correlativos y el comprobante permanece como borrador.' };
  }

  async issue(id: string, branch: BranchEntity, userId: string, expectedReceiverRevision?: number) {
    const document = await this.findById(id, branch.id!);
    if (document.status !== 'DRAFT') throw new ConflictException('El comprobante ya fue procesado. No se enviará de nuevo');
    if (expectedReceiverRevision !== undefined && expectedReceiverRevision !== (document.receiverRevision ?? 0)) throw new ConflictException('El receptor cambió después de la revisión. Actualiza el comprobante y confirma nuevamente');
    const sale = await this.sales.findById(document.saleId, branch.id!);
    if (!sale || sale.branchId !== branch.id || sale.isCancelled) throw new BadRequestException('La venta de origen no está disponible para emisión');
    if (!branch.companyIds.includes(document.companyId)) throw new BadRequestException('Empresa no habilitada en la sucursal');
    const company = await this.companies.findById(document.companyId);
    if (!company?.isActive || company.ruc.trim() !== document.issuer.documentNumber) throw new BadRequestException('La empresa emisora cambió; revisa el borrador');
    if (document.paymentCondition !== 'CONTADO') throw new BadRequestException('La emisión a crédito requiere configurar el cronograma fiscal');
    normalizeBillingReceiver(document.documentType, document.total, document.receiver);
    for (const item of document.items) {
      if (item.taxType !== document.taxType) throw new BadRequestException('Un comprobante no puede mezclar productos gravados y exonerados');
      sunatUnit(item.unit);
    }
    const status = await this.provider.getStatus(branch.billingSeriesCode, branch.sunatEstablishmentCode);
    if (!status.ready || !status.series || !status.environment || status.environment === 'simulation') throw new BadRequestException(status.message);
    if (document.reissueAfterCreditNoteId && document.environment!==status.environment) throw new BadRequestException('El ambiente de la nueva emisión debe coincidir con el comprobante anulado');
    if (status.issuerRuc !== document.issuer.documentNumber) throw new BadRequestException('El RUC del servicio no coincide con la empresa del comprobante');
    if (!status.supportedDocumentTypes.includes(document.documentType)) throw new BadRequestException('El servicio todavía no habilita este tipo de comprobante');
    const claimed = await this.documents.claimDraft(id, branch.id!, userId, document.receiverRevision ?? 0);
    if (!claimed) throw new ConflictException('El borrador cambió o una solicitud ya lo está procesando. Actualiza antes de confirmar');
    try {
      const series = status.series[document.documentType];
      const number = await this.documents.reserveNumber(status.issuerRuc!, series, status.environment, this.provider.getNumberingStart(document.documentType));
      const boletaSubmissionMode = document.documentType === 'BOLETA' ? status.boletaSubmissionMode || 'summary' : undefined;
      const summaryDate = boletaSubmissionMode === 'summary'
        ? new Date(claimed.submittedAt!).toLocaleDateString('en-CA', { timeZone: 'America/Lima' }) : undefined;
      const summaryNumber = summaryDate
        ? await this.documents.reserveNumber(status.issuerRuc!, `RC-${summaryDate}`, status.environment, this.provider.getNumberingStart('SUMMARY'), this.provider.getSummaryNumberLimit?.() ?? 99_999)
        : undefined;
      const data = {
        series, number, environment: status.environment, summaryDate, summaryNumber, boletaSubmissionMode,
        issuer: { ...document.issuer, name: status.issuerName || document.issuer.name, address: status.issuerAddress || document.issuer.address, establishmentCode: branch.sunatEstablishmentCode || status.issuerEstablishmentCode },
      };
      await this.documents.setSubmission(id, branch.id!, data);
      const result = await this.provider.submit({ ...claimed, ...data });
      return await this.documents.saveSubmissionResult(id, branch.id!, result);
    } catch {
      // A timeout or crash cannot prove that SUNAT did not receive the document.
      // Keep the fiscal slot and prohibit blind retries with another number.
      return this.documents.saveSubmissionResult(id, branch.id!, {
        status: 'UNKNOWN', sunatDescription: 'No se pudo confirmar el resultado. Revisa el comprobante antes de cualquier reintento; no se enviará automáticamente de nuevo.',
      });
    }
  }

  async checkStatus(id: string, branchId: string) {
    const document = await this.findById(id, branchId);
    if (document.status !== 'PENDING') return document;
    const result = await this.provider.checkStatus(document);
    return this.documents.saveSubmissionResult(id, branchId, result);
  }

  async artifact(id: string, branchId: string, format: 'pdf' | 'xml' | 'cdr') {
    await this.findById(id, branchId);
    const file = await this.documents.getArtifact(id, branchId, format);
    if (!file) throw new NotFoundException('Este archivo todavía no está disponible');
    return file;
  }
}
