import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IPurchaseRepository } from '../../../../domain/repositories/purchase.repository';
import { PurchaseEntity, PurchaseItemEntity, ReceptionEntity } from '../../../../domain/entities/purchase.entity';
import { PurchaseDocument, PurchaseDoc } from '../schemas/purchase.schema';

@Injectable()
export class MongoPurchaseRepository implements IPurchaseRepository {
  constructor(
    @InjectModel(PurchaseDocument.name) private readonly purchaseModel: Model<PurchaseDoc>,
  ) {}

  async create(purchase: PurchaseEntity): Promise<PurchaseEntity> {
    const doc: any = {
      company: purchase.companyId,
      supplier: purchase.supplier,
      items: purchase.items.map((i) => ({
        product: new Types.ObjectId(i.productId),
        quantity: i.quantity,
        receivedQty: 0,
        unitCost: i.unitCost,
        unitPriceSinIgv: i.unitPriceSinIgv,
        unitPriceConIgv: i.unitPriceConIgv,
        flete: i.flete,
        otrosCostos: i.otrosCostos,
        precioVenta: i.precioVenta,
        precioMinorista: i.precioMinorista,
        precioEspecial: i.precioEspecial,
        markupPercent: i.markupPercent,
        markupMinoristaPercent: i.markupMinoristaPercent,
        markupEspecialPercent: i.markupEspecialPercent,
        minMarginPercent: i.minMarginPercent ?? 5,
        ...(i.lotNumber ? { lotNumber: i.lotNumber } : {}),
        ...(i.expirationDate ? { expirationDate: i.expirationDate } : {}),
        ...(i.taxType ? { taxType: i.taxType } : {}),
      })),
      totalCost: purchase.totalCost,
      paymentType: purchase.paymentType || 'CONTADO',
      paymentScheduleType: purchase.paymentScheduleType,
      dueDate: purchase.dueDate,
      date: purchase.date,
      receptionStatus: purchase.receptionStatus || 'PENDING',
      receptions: [],
      createdBy: purchase.createdBy || undefined,
    };
    if (purchase.totalCostUsd != null) doc.totalCostUsd = purchase.totalCostUsd;
    if (purchase.exchangeRate != null) doc.exchangeRate = purchase.exchangeRate;
    if (purchase.supplierId) doc.supplierId = new Types.ObjectId(purchase.supplierId);
    if (purchase.supplierRuc) doc.supplierRuc = purchase.supplierRuc;
    if (purchase.documentType) doc.documentType = purchase.documentType;
    if (purchase.documentSeries) doc.documentSeries = purchase.documentSeries;
    if (purchase.documentNumber) doc.documentNumber = purchase.documentNumber;
    if (purchase.issueDate) doc.issueDate = purchase.issueDate;
    if (purchase.isHistorical) doc.isHistorical = true;
    if (purchase.remisionGuia) doc.remisionGuia = purchase.remisionGuia;
    if (purchase.bonificationItems?.length) {
      doc.bonificationItems = purchase.bonificationItems.map((i) => ({
        product: new Types.ObjectId(i.productId),
        quantity: i.quantity,
        receivedQty: 0,
        unitCost: 0,
        ...(i.lotNumber ? { lotNumber: i.lotNumber } : {}),
        ...(i.expirationDate ? { expirationDate: i.expirationDate } : {}),
        ...(i.taxType ? { taxType: i.taxType } : {}),
      }));
    }
    const created = await this.purchaseModel.create(doc);
    return this.toEntity(created.toObject());
  }

  async findAll(
    filter?: { companyId?: string; startDate?: Date; endDate?: Date },
    page = 1, limit = 20,
  ): Promise<{ data: PurchaseEntity[]; total: number }> {
    const query: any = {};
    if (filter?.companyId) query.company = filter.companyId;
    if (filter?.startDate || filter?.endDate) {
      const dateRange: any = {};
      if (filter.startDate) dateRange.$gte = filter.startDate;
      if (filter.endDate) dateRange.$lte = filter.endDate;
      query.$or = [
        { issueDate: dateRange },
        { issueDate: { $exists: false }, date: dateRange },
        { issueDate: null, date: dateRange },
      ];
    }
    const [data, total] = await Promise.all([
      this.purchaseModel.find(query).populate('company').populate('items.product').skip((page - 1) * limit).limit(limit).sort({ date: -1, createdAt: -1 }).lean().exec(),
      this.purchaseModel.countDocuments(query).exec(),
    ]);
    return { data: data.map((d) => this.toEntity(d)), total };
  }

  async findById(id: string): Promise<PurchaseEntity | null> {
    const doc = await this.purchaseModel.findById(id)
      .populate('company')
      .populate('items.product')
      .populate('bonificationItems.product')
      .populate('receptions.receivedBy', 'fullName')
      .populate('receptions.items.product', 'name')
      .lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async update(id: string, data: Partial<PurchaseEntity>): Promise<PurchaseEntity | null> {
    const $set: any = {};
    const $unset: any = {};
    if (data.supplier !== undefined) $set.supplier = data.supplier;
    if (data.supplierId !== undefined) {
      if (data.supplierId) $set.supplierId = new Types.ObjectId(data.supplierId);
      else $unset.supplierId = '';
    }
    if (data.supplierRuc !== undefined) $set.supplierRuc = data.supplierRuc;
    if (data.date !== undefined) $set.date = data.date;
    if (data.documentType !== undefined) $set.documentType = data.documentType;
    if (data.documentSeries !== undefined) $set.documentSeries = data.documentSeries;
    if (data.documentNumber !== undefined) $set.documentNumber = data.documentNumber;
    if ('issueDate' in data) {
      if (data.issueDate) $set.issueDate = data.issueDate;
      else $unset.issueDate = '';
    }
    if (data.paymentType !== undefined) $set.paymentType = data.paymentType;
    if ('paymentScheduleType' in data) {
      if (data.paymentScheduleType) $set.paymentScheduleType = data.paymentScheduleType;
      else $unset.paymentScheduleType = '';
    }
    if ('dueDate' in data) {
      if (data.dueDate) $set.dueDate = data.dueDate;
      else $unset.dueDate = '';
    }
    if (data.totalCostUsd !== undefined) $set.totalCostUsd = data.totalCostUsd;
    if (data.exchangeRate !== undefined) $set.exchangeRate = data.exchangeRate;
    if (data.totalCost !== undefined) $set.totalCost = data.totalCost;
    const update: any = {};
    if (Object.keys($set).length > 0) update.$set = $set;
    if (Object.keys($unset).length > 0) update.$unset = $unset;
    const doc = await this.purchaseModel
      .findByIdAndUpdate(id, update, { new: true })
      .populate('company').populate('items.product').lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async updateRemisionGuia(id: string, data: { serie: string; correlativo: string; fecha: Date }): Promise<PurchaseEntity | null> {
    const doc = await this.purchaseModel
      .findByIdAndUpdate(id, { $set: { remisionGuia: data } }, { new: true })
      .populate('company').populate('items.product').lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async updateItem(id: string, productId: string, data: Partial<PurchaseItemEntity>): Promise<PurchaseEntity | null> {
    const $set: any = {};
    if (data.quantity !== undefined) $set['items.$[elem].quantity'] = data.quantity;
    if (data.receivedQty !== undefined) $set['items.$[elem].receivedQty'] = data.receivedQty;
    if (data.unitCost !== undefined) $set['items.$[elem].unitCost'] = data.unitCost;
    if (data.unitPriceSinIgv !== undefined) $set['items.$[elem].unitPriceSinIgv'] = data.unitPriceSinIgv;
    if (data.unitPriceConIgv !== undefined) $set['items.$[elem].unitPriceConIgv'] = data.unitPriceConIgv;
    if (data.precioVenta !== undefined) $set['items.$[elem].precioVenta'] = data.precioVenta;
    if (data.precioMinorista !== undefined) $set['items.$[elem].precioMinorista'] = data.precioMinorista;
    if (data.precioEspecial !== undefined) $set['items.$[elem].precioEspecial'] = data.precioEspecial;
    if (data.markupPercent !== undefined) $set['items.$[elem].markupPercent'] = data.markupPercent;
    if (data.markupMinoristaPercent !== undefined) $set['items.$[elem].markupMinoristaPercent'] = data.markupMinoristaPercent;
    if (data.markupEspecialPercent !== undefined) $set['items.$[elem].markupEspecialPercent'] = data.markupEspecialPercent;
    if (data.minMarginPercent !== undefined) $set['items.$[elem].minMarginPercent'] = data.minMarginPercent;
    if (data.lotNumber !== undefined) $set['items.$[elem].lotNumber'] = data.lotNumber;
    if (data.expirationDate !== undefined) $set['items.$[elem].expirationDate'] = data.expirationDate;
    const doc = await this.purchaseModel.findByIdAndUpdate(
      id,
      { $set },
      { new: true, arrayFilters: [{ 'elem.product': { $in: [new Types.ObjectId(productId), productId] } }] },
    ).populate('company').populate('items.product').lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async addItem(id: string, item: PurchaseItemEntity): Promise<PurchaseEntity | null> {
    const newDoc: any = {
      product: new Types.ObjectId(item.productId),
      quantity: item.quantity,
      receivedQty: item.receivedQty ?? 0,
      ...(item.unitCost != null ? { unitCost: item.unitCost } : {}),
      ...(item.unitPriceSinIgv != null ? { unitPriceSinIgv: item.unitPriceSinIgv } : {}),
      ...(item.unitPriceConIgv != null ? { unitPriceConIgv: item.unitPriceConIgv } : {}),
      ...(item.precioVenta != null ? { precioVenta: item.precioVenta } : {}),
      ...(item.precioMinorista != null ? { precioMinorista: item.precioMinorista } : {}),
      ...(item.precioEspecial != null ? { precioEspecial: item.precioEspecial } : {}),
      ...(item.markupPercent != null ? { markupPercent: item.markupPercent } : {}),
      ...(item.markupMinoristaPercent != null ? { markupMinoristaPercent: item.markupMinoristaPercent } : {}),
      ...(item.markupEspecialPercent != null ? { markupEspecialPercent: item.markupEspecialPercent } : {}),
      minMarginPercent: item.minMarginPercent ?? 5,
      ...(item.lotNumber ? { lotNumber: item.lotNumber } : {}),
      ...(item.expirationDate ? { expirationDate: item.expirationDate } : {}),
      ...(item.taxType ? { taxType: item.taxType } : {}),
    };
    const doc = await this.purchaseModel.findByIdAndUpdate(
      id,
      { $push: { items: newDoc } },
      { new: true },
    ).populate('company').populate('items.product').lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async addBonificationItem(id: string, item: PurchaseItemEntity): Promise<PurchaseEntity | null> {
    const newDoc: any = {
      product: new Types.ObjectId(item.productId),
      quantity: item.quantity,
      receivedQty: item.receivedQty ?? 0,
      unitCost: 0,
      ...(item.lotNumber ? { lotNumber: item.lotNumber } : {}),
      ...(item.expirationDate ? { expirationDate: item.expirationDate } : {}),
      ...(item.taxType ? { taxType: item.taxType } : {}),
    };
    const doc = await this.purchaseModel.findByIdAndUpdate(
      id,
      { $push: { bonificationItems: newDoc } },
      { new: true },
    ).populate('company').populate('items.product').populate('bonificationItems.product').lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async delete(id: string): Promise<void> {
    await this.purchaseModel.findByIdAndDelete(id).exec();
  }

  async registerReception(id: string, reception: ReceptionEntity): Promise<PurchaseEntity | null> {
    const purchase = await this.purchaseModel.findById(id).lean().exec();
    if (!purchase) return null;

    const receptionDoc = {
      date: reception.date,
      receivedBy: reception.receivedBy ? new Types.ObjectId(reception.receivedBy) : undefined,
      notes: reception.notes,
      items: reception.items.map(i => ({ product: new Types.ObjectId(i.productId), quantity: i.quantity })),
    };

    // Build updated items with new receivedQty
    const updatedItems = purchase.items.map((item: any) => {
      const received = reception.items.find(
        r => r.productId === (item.product?._id?.toString() || item.product?.toString())
      );
      return { ...item, receivedQty: (item.receivedQty || 0) + (received?.quantity || 0) };
    });

    // Auto-receive all bonification items in full on first reception
    const updatedBonifItems = ((purchase as any).bonificationItems || []).map((item: any) => ({
      ...item,
      receivedQty: item.quantity,
    }));

    // Determine new reception status (based on regular items only)
    const allReceived = updatedItems.every((i: any) => i.receivedQty >= i.quantity);
    const anyReceived = updatedItems.some((i: any) => i.receivedQty > 0);
    const newStatus = allReceived ? 'RECEIVED' : anyReceived ? 'PARTIAL' : 'PENDING';

    const updated = await this.purchaseModel.findByIdAndUpdate(
      id,
      {
        $push: { receptions: receptionDoc },
        $set: {
          receptionStatus: newStatus,
          items: updatedItems,
          bonificationItems: updatedBonifItems,
        },
      },
      { new: true },
    ).populate('company').populate('items.product').populate('bonificationItems.product').populate('receptions.receivedBy', 'fullName').lean().exec();

    return updated ? this.toEntity(updated) : null;
  }

  private toEntity(doc: any): PurchaseEntity {
    return {
      id: doc._id.toString(),
      companyId: doc.company?._id?.toString() || doc.company?.toString(),
      supplier: doc.supplier,
      items: (doc.items || []).map((i: any) => ({
        productId: i.product?._id?.toString() || i.product?.toString(),
        productName: i.product?.name,
        quantity: i.quantity,
        receivedQty: i.receivedQty || 0,
        unitCost: i.unitCost,
        unitPriceSinIgv: i.unitPriceSinIgv,
        unitPriceConIgv: i.unitPriceConIgv,
        flete: i.flete,
        otrosCostos: i.otrosCostos,
        precioVenta: i.precioVenta,
        precioMinorista: i.precioMinorista,
        precioEspecial: i.precioEspecial,
        markupPercent: i.markupPercent,
        markupMinoristaPercent: i.markupMinoristaPercent,
        markupEspecialPercent: i.markupEspecialPercent,
        minMarginPercent: i.minMarginPercent ?? 5,
        lotNumber: i.lotNumber,
        expirationDate: i.expirationDate,
        taxType: i.taxType,
      })),
      bonificationItems: (doc.bonificationItems || []).map((i: any) => ({
        productId: i.product?._id?.toString() || i.product?.toString(),
        productName: i.product?.name,
        quantity: i.quantity,
        receivedQty: i.receivedQty || 0,
        unitCost: 0,
        lotNumber: i.lotNumber,
        expirationDate: i.expirationDate,
        taxType: i.taxType,
      })),
      totalCost: doc.totalCost,
      receptionStatus: doc.receptionStatus || 'RECEIVED',
      receptions: (doc.receptions || []).map((r: any) => ({
        id: r._id?.toString(),
        date: r.date,
        receivedBy: r.receivedBy?._id?.toString() || r.receivedBy?.toString(),
        receivedByName: r.receivedBy?.fullName,
        notes: r.notes,
        items: (r.items || []).map((ri: any) => ({
          productId: ri.product?._id?.toString() || ri.product?.toString(),
          productName: ri.product?.name,
          quantity: ri.quantity,
        })),
      })),
      paymentType: doc.paymentType || 'CONTADO',
      paymentScheduleType: doc.paymentScheduleType,
      dueDate: doc.dueDate,
      totalCostUsd: doc.totalCostUsd,
      exchangeRate: doc.exchangeRate,
      supplierId: doc.supplierId?.toString(),
      supplierRuc: doc.supplierRuc,
      documentType: doc.documentType,
      documentSeries: doc.documentSeries,
      documentNumber: doc.documentNumber,
      issueDate: doc.issueDate,
      remisionGuia: doc.remisionGuia
        ? { serie: doc.remisionGuia.serie, correlativo: doc.remisionGuia.correlativo, fecha: doc.remisionGuia.fecha }
        : undefined,
      isHistorical: doc.isHistorical || false,
      date: doc.date,
      createdBy: doc.createdBy?.toString(),
      createdAt: doc.createdAt,
    };
  }
}
