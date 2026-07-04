import { Controller, Get, Post, Put, Delete, Body, Param, Query, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { CloudinaryService } from '../../infrastructure/cloudinary/cloudinary.service';
import { CreateProductUseCase } from '../../application/use-cases/product/create-product.use-case';
import { GetProductsUseCase } from '../../application/use-cases/product/get-products.use-case';
import { UpdateProductUseCase } from '../../application/use-cases/product/update-product.use-case';
import { DeleteProductUseCase } from '../../application/use-cases/product/delete-product.use-case';
import { GetPriceFloorAlertsUseCase } from '../../application/use-cases/product/get-price-floor-alerts.use-case';
import { ImportProductsUseCase } from '../../application/use-cases/product/import-products.use-case';
import { CreateProductDto } from '../../application/dtos/product/create-product.dto';
import { UpdateProductDto } from '../../application/dtos/product/update-product.dto';
import { FilterProductDto } from '../../application/dtos/product/filter-product.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Products')
@ApiBearerAuth('JWT')
@Controller('products')
export class ProductController {
  constructor(
    private readonly createProduct: CreateProductUseCase,
    private readonly getProducts: GetProductsUseCase,
    private readonly updateProduct: UpdateProductUseCase,
    private readonly deleteProduct: DeleteProductUseCase,
    private readonly getPriceFloorAlerts: GetPriceFloorAlertsUseCase,
    private readonly cloudinary: CloudinaryService,
    private readonly importProducts: ImportProductsUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear producto', description: 'Registra un nuevo producto en el catalogo' })
  async create(@Body() dto: CreateProductDto, @CurrentUser('id') userId: string) { return this.createProduct.execute(dto, userId); }

  @Get('price-floor-alerts')
  @ApiOperation({ summary: 'Productos en precio mínimo', description: 'Productos cuyo precio de venta alcanzó el límite inferior (C. Adquisición + 5%)' })
  async priceFloorAlerts() { return this.getPriceFloorAlerts.execute(); }

  @Get()
  @ApiOperation({ summary: 'Listar productos', description: 'Obtiene lista paginada de productos con filtros opcionales' })
  async findAll(@Query() filter: FilterProductDto, @Query('isActive') isActiveRaw?: string) {
    const isActive = isActiveRaw === undefined ? undefined : isActiveRaw === 'true';
    return this.getProducts.execute({ ...filter, isActive });
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar producto', description: 'Modifica los datos de un producto existente' })
  @ApiParam({ name: 'id', description: 'ID del producto' })
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto) { return this.updateProduct.execute(id, dto); }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar producto', description: 'Elimina un producto permanentemente de la base de datos' })
  @ApiParam({ name: 'id', description: 'ID del producto' })
  async remove(@Param('id') id: string) { return this.deleteProduct.execute(id); }

  @Post('import')
  @ApiOperation({ summary: 'Importar productos desde Excel' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  async importFromExcel(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    return this.importProducts.execute(file.buffer);
  }

  @Post(':id/image')
  @ApiOperation({ summary: 'Subir imagen de producto' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadImage(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    const url = await this.cloudinary.uploadBuffer(file.buffer, 'products', id);
    await this.updateProduct.execute(id, { imageUrl: url } as any);
    return { imageUrl: url };
  }
}
