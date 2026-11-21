import { Injectable, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IProductRepository } from '../../../../domain/repositories/product.repository';
import { ProductEntity } from '../../../../domain/entities/product.entity';
import { ProductDocument, ProductDoc } from '../schemas/product.schema';

@Injectable()
export class MongoProductRepository implements IProductRepository {
  constructor(
    @InjectModel(ProductDocument.name)
    private readonly productModel: Model<ProductDoc>,
  ) {}

  async create(product: ProductEntity): Promise<ProductEntity> {
    const created = await this.productModel.create({
      name: product.name,
      description: product.description,
      category: product.categoryId,
      unit: product.unit,
      activeIngredient: product.activeIngredient,
      activeIngredients: (product.activeIngredients || []).map(i => ({ name: i.name, concentration: i.concentration || '' })),
      taxType: product.taxType || 'GRAVADO',
      catalogStatus: product.catalogStatus || 'READY',
      catalogImport: product.catalogImport,
      prices: product.prices.map((p) => ({ priceTier: p.priceTierId, ...(p.companyId && { company: p.companyId }), ...(p.branchId && { branch: p.branchId }), price: p.price })),
      tracksLot: product.tracksLot ?? false,
      isActive: product.isActive,
      location: product.location,
      locations: product.locations ?? [],
    });
    return this.toEntity(created);
  }

  async findAll(
    filter?: { search?: string; category?: string; activeIngredient?: string; control?: string; isActive?: boolean; sellableOnly?: boolean; supplier?: string; unit?: string; sort?: 'asc' | 'desc' },
    page = 1,
    limit = 20,
  ): Promise<{ data: ProductEntity[]; total: number }> {
    const query: any = {};
    if (filter?.search) query.name = { $regex: filter.search, $options: 'i' };
    if (filter?.category) query.$expr = { $eq: [{ $toString: '$category' }, filter.category] };
    if (filter?.activeIngredient) {
      query.$or = [
        { 'activeIngredients.name': { $regex: filter.activeIngredient, $options: 'i' } },
        { activeIngredient: { $regex: filter.activeIngredient, $options: 'i' } },
      ];
    }
    if (filter?.control) query.control = { $regex: filter.control, $options: 'i' };
    if (filter?.supplier) query.supplier = { $regex: filter.supplier, $options: 'i' };
    if (filter?.unit) query.unit = filter.unit;
    query.isActive = filter?.isActive !== undefined ? filter.isActive : true;
    if (filter?.sellableOnly) {
      query.catalogStatus = { $ne: 'PENDING_REVIEW' };
      query.taxType = { $ne: 'PENDIENTE' };
    }

    const collation = { locale: 'es', strength: 1 };
    const sortQuery = filter?.sort
      ? { name: filter.sort === 'asc' ? 1 : -1, _id: filter.sort === 'asc' ? 1 : -1 }
      : { createdAt: -1, _id: -1 };

    const [data, total] = await Promise.all([
      this.productModel.find(query).collation(collation).skip((page - 1) * limit).limit(limit).sort(sortQuery as any).lean().exec(),
      this.productModel.countDocuments(query).collation(collation).exec(),
    ]);
    return { data: data.map((d) => this.toEntity(d)), total };
  }

  async findById(id: string): Promise<ProductEntity | null> {
    const doc = await this.productModel.findById(id).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findByName(name: string): Promise<ProductEntity | null> {
    const literalName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const doc = await this.productModel.findOne({ name: { $regex: `^${literalName}$`, $options: 'i' } }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async update(id: string, product: Partial<ProductEntity>): Promise<ProductEntity | null> {
    if (product.isActive === true) {
      const current = await this.productModel.findById(id).lean().exec();
      const consolidation = (current?.catalogImport as ProductEntity['catalogImport'])?.deduplication;
      if (consolidation?.inventoryConsolidated) {
        throw new ConflictException(`Esta ficha fue consolidada. Usa el producto principal ${consolidation.canonicalSku || consolidation.canonicalProductId}`);
      }
    }
    const updateData: any = { ...product };
    if (product.categoryId) {
      updateData.category = product.categoryId;
      delete updateData.categoryId;
    }
    if (product.prices) {
      updateData.prices = product.prices.map((p) => ({ priceTier: p.priceTierId, ...(p.companyId && { company: p.companyId }), ...(p.branchId && { branch: p.branchId }), price: p.price }));
    }
    if (product.activeIngredients !== undefined) {
      updateData.activeIngredients = product.activeIngredients.map(i => ({ name: i.name, concentration: i.concentration || '' }));
    }
    const doc = await this.productModel.findByIdAndUpdate(id, updateData, { new: true }).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async delete(id: string): Promise<void> {
    // Soft delete: preserve the document so historical sales can still resolve
    // the product name. Hard deletes corrupted reporting (see incident: 17 orphan
    // products in last-month sales after hard-delete usage).
    await this.productModel.findByIdAndUpdate(id, { isActive: false }).exec();
  }

  private toEntity(doc: any): ProductEntity {
    return {
      id: doc._id.toString(),
      name: doc.name,
      description: doc.description,
      categoryId: doc.category?.toString() || doc.category,
      unit: doc.unit,
      activeIngredient: doc.activeIngredient,
      activeIngredients: doc.activeIngredients?.length
        ? doc.activeIngredients.map((i: any) => ({ name: i.name, concentration: i.concentration || '' }))
        : doc.activeIngredient ? [{ name: doc.activeIngredient, concentration: '' }] : [],
      taxType: doc.taxType || 'GRAVADO',
      catalogStatus: doc.catalogStatus || 'READY',
      catalogImport: doc.catalogImport,
      tracksLot: doc.tracksLot ?? false,
      prices: (doc.prices || []).map((p: any) => ({
        priceTierId: p.priceTier?.toString() || p.priceTier,
        ...(p.company && { companyId: p.company.toString() }),
        ...(p.branch && { branchId: p.branch.toString() }),
        price: p.price,
      })),
      isActive: doc.isActive,
      minSalePrice: doc.minSalePrice,
      minMarginPercent: doc.minMarginPercent ?? 5,
      location: doc.location || (doc.locations?.length ? doc.locations.join(' - ') : undefined),
      locations: doc.locations?.length ? doc.locations : (doc.location ? [doc.location] : []),
      supplier: doc.supplier,
      control: doc.control,
      cultivo: doc.cultivo,
      dosis: doc.dosis,
      imageUrl: doc.imageUrl,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
