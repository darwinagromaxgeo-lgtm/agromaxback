import { Injectable, HttpException, HttpStatus, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class LookupService {
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>('DECOLECTA_API_KEY') || '';
  }

  async searchByDni(numero: string) {
    this.validateIdentity(numero, 8);
    try {
      const { data } = await firstValueFrom(
        this.httpService.get(`/reniec/dni`, {
          params: { numero },
          headers: { Authorization: `Bearer ${this.apiKey}` },
        }),
      );
      return {
        nombre: data.first_name,
        apellidoPaterno: data.first_last_name,
        apellidoMaterno: data.second_last_name,
        nombreCompleto: data.full_name,
      };
    } catch (error) {
      const status = error.response?.status || HttpStatus.BAD_REQUEST;
      const message = error.response?.data?.message || 'DNI no encontrado';
      throw new HttpException(message, status);
    }
  }

  async searchByRuc(numero: string) {
    this.validateIdentity(numero, 11);
    try {
      const { data } = await firstValueFrom(
        this.httpService.get(`/sunat/ruc`, {
          params: { numero },
          headers: { Authorization: `Bearer ${this.apiKey}` },
        }),
      );
      return {
        razonSocial: data.razon_social,
        direccion: data.direccion,
        estado: data.estado,
        condicion: data.condicion,
      };
    } catch (error) {
      const status = error.response?.status || HttpStatus.BAD_REQUEST;
      const message = error.response?.data?.message || 'RUC no encontrado';
      throw new HttpException(message, status);
    }
  }

  private validateIdentity(numero: string, length: number) {
    if (!new RegExp(`^\\d{${length}}$`).test(numero)) throw new BadRequestException(`El documento debe tener ${length} dígitos`);
    if (!this.apiKey) throw new ServiceUnavailableException('La consulta de identidad en Decolecta todavía no está configurada');
  }

  async getTipoCambio(date?: string) {
    const fetchRate = async (params: any) => {
      const { data } = await firstValueFrom(
        this.httpService.get(`/tipo-cambio/sunat`, {
          params,
          headers: { Authorization: `Bearer ${this.apiKey}` },
        }),
      );
      return { compra: parseFloat(data.buy_price), venta: parseFloat(data.sell_price), fecha: data.date };
    };

    try {
      // Try with the requested date first; fall back to latest available if not found
      if (date) {
        try {
          return await fetchRate({ date });
        } catch {
          return await fetchRate({});
        }
      }
      return await fetchRate({});
    } catch (error) {
      const status = error.response?.status || HttpStatus.BAD_REQUEST;
      const message = error.response?.data?.message || 'No se pudo obtener el tipo de cambio';
      throw new HttpException(message, status);
    }
  }
}
