import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { BillingDocumentEntity, BillingDocumentType, BillingProviderStatus, BillingServiceSimulation, BillingSubmissionResult } from '../../domain/entities/billing-document.entity';
import { IBillingProvider } from '../../domain/repositories/billing-provider';
import { sunatUnit } from '../../application/services/billing-calculation';

@Injectable()
export class GreenterBillingProvider implements IBillingProvider {
  constructor(private readonly config: ConfigService) {}

  private settings(branchSeriesCode?: string) {
    const branchNumbering = this.config.get('GREENTER_BRANCH_NUMBERING') === 'true';
    const code = branchSeriesCode && /^[1-9A-Z]$/.test(branchSeriesCode) ? branchSeriesCode : '';
    return {
      url: String(this.config.get('GREENTER_SERVICE_URL') || '').replace(/\/+$/, ''),
      apiKey: String(this.config.get('GREENTER_API_KEY') || ''),
      issuerRuc: String(this.config.get('GREENTER_ISSUER_RUC') || ''),
      environment: this.config.get('GREENTER_ENVIRONMENT') === 'production' ? 'production' as const : 'beta' as const,
      enabled: this.config.get('GREENTER_ENABLED') === 'true',
      simulationEnabled: this.config.get('GREENTER_SIMULATION_ENABLED') === 'true',
      allowProduction: this.config.get('GREENTER_ALLOW_PRODUCTION') === 'true',
      branchNumbering,
      series: branchNumbering ? { FACTURA: code ? `FAG${code}` : '', BOLETA: code ? `BAG${code}` : '' }
        : { FACTURA: String(this.config.get('GREENTER_SERIE_FACTURA') || ''), BOLETA: String(this.config.get('GREENTER_SERIE_BOLETA') || '') },
    };
  }

  getNumberingStart(type: BillingDocumentType | 'SUMMARY'): number {
    return Number(this.config.get(type === 'FACTURA' ? 'GREENTER_FACTURA_NEXT_NUMBER' : type === 'BOLETA' ? 'GREENTER_BOLETA_NEXT_NUMBER' : 'GREENTER_SUMMARY_NEXT_NUMBER'));
  }

  getSummaryNumberLimit(): number {
    return this.config.get('GREENTER_EXTERNAL_BILLING_ACTIVE') === 'true'
      ? Number(this.config.get('GREENTER_SUMMARY_LAST_NUMBER')) : 99_999;
  }

  private options(timeout = 10_000) {
    return { headers: { Authorization: `Bearer ${this.settings().apiKey}` }, timeout, maxRedirects: 0, maxContentLength: 12_000_000, maxBodyLength: 2_000_000, validateStatus: () => true };
  }

  private validConnection(simulation = false): boolean {
    const config = this.settings();
    try {
      const url = new URL(config.url);
      if (url.username || url.password || url.search || url.hash) return false;
      return !!config.apiKey && /^\d{11}$/.test(config.issuerRuc)
        && (url.protocol === 'https:' || (url.protocol === 'http:' && (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || (simulation && url.hostname === 'billing'))));
    } catch { return false; }
  }

  private async simulationStatus(): Promise<BillingProviderStatus> {
    const config = this.settings();
    const base: BillingProviderStatus = { configured: this.validConnection(true), ready: false, simulationReady: false, environment: 'simulation', issuerRuc: config.issuerRuc || undefined, supportedDocumentTypes: [], message: 'La simulación local está disponible; falta conectar el microservicio de pruebas.' };
    if (!base.configured || config.enabled) return { ...base, message: config.enabled ? 'Usa la simulación con la emisión deshabilitada.' : base.message };
    try {
      const response = await axios.get(`${config.url}/api/agromax/capabilities`, this.options());
      const data = response.data;
      if (response.status !== 200 || data?.apiVersion !== 'agromax-1' || data.environment !== 'simulation' || data.simulationReady !== true || data.ready !== false || data.issuer?.ruc !== config.issuerRuc) return base;
      return { ...base, simulationReady: true, issuerName: data.issuer.razonSocial, issuerAddress: data.issuer.direccion, boletaSubmissionMode: data.boletaSubmissionMode === 'individual' ? 'individual' : 'summary', supportedDocumentTypes: (['FACTURA', 'BOLETA'] as const).filter(type => data.supportedDocumentTypes?.includes(type)), message: 'Microservicio de simulación conectado. La emisión real permanece deshabilitada.' };
    } catch { return base; }
  }

  async getStatus(branchSeriesCode?: string, establishmentCode?: string): Promise<BillingProviderStatus> {
    const config = this.settings(branchSeriesCode);
    if (config.simulationEnabled) return this.simulationStatus();
    const base: BillingProviderStatus = { configured: false, ready: false, environment: config.environment, supportedDocumentTypes: [], message: 'La conexión de facturación todavía no está configurada.' };
    if (config.branchNumbering && !config.series.FACTURA) return { ...base, message: 'Asigna un código de series exclusivo a esta sucursal antes de emitir.' };
    let url: URL;
    try { url = new URL(config.url); } catch { return base; }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return base;
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return base;
    if (!config.apiKey || !/^\d{11}$/.test(config.issuerRuc) || !/^F[A-Z0-9]{3}$/.test(config.series.FACTURA) || !/^B[A-Z0-9]{3}$/.test(config.series.BOLETA)) return base;
    for (const type of ['FACTURA', 'BOLETA'] as const) {
      const number = this.getNumberingStart(type);
      if (!Number.isSafeInteger(number) || number < 1 || number > 99_999_999) return { ...base, message: 'Confirma las series y los siguientes correlativos antes de habilitar la facturación.' };
    }
    base.configured = true;
    base.issuerRuc = config.issuerRuc;
    base.series = config.series;
    if (!config.enabled) return { ...base, message: 'La conexión está preparada y la emisión permanece deshabilitada.' };
    if (config.environment === 'production' && !config.allowProduction) return { ...base, message: 'Falta habilitar expresamente la emisión en producción.' };
    try {
      const response = await axios.get(`${config.url}/api/agromax/capabilities`, this.options());
      const data = response.data;
      if (response.status !== 200 || data?.apiVersion !== 'agromax-1' || !data.ready) return { ...base, message: 'El microservicio necesita tener habilitada la integración de Agromax y sus credenciales.' };
      if (data.issuer?.ruc !== config.issuerRuc || data.environment !== config.environment) return { ...base, message: 'El emisor o el ambiente del servicio no coincide con Agromax.' };
      const issuerEstablishmentCode = establishmentCode || data.issuer?.establishmentCode;
      if (config.environment === 'production' && !/^\d{4}$/.test(issuerEstablishmentCode || '')) return { ...base, message: 'El facturador necesita el código de establecimiento del emisor.' };
      const summaryNumber = this.getNumberingStart('SUMMARY');
      const summaryLimit = this.getSummaryNumberLimit();
      const externallyCoordinated = this.config.get('GREENTER_EXTERNAL_BILLING_ACTIVE') !== 'true'
        || this.config.get('GREENTER_SUMMARY_RANGE_CONFIRMED') === 'true';
      const summaryReady = externallyCoordinated && Number.isSafeInteger(summaryNumber) && summaryNumber >= 1
        && Number.isSafeInteger(summaryLimit) && summaryLimit >= summaryNumber && summaryLimit <= 99_999;
      const boletaSubmissionMode = data.boletaSubmissionMode === 'individual' ? 'individual' : 'summary';
      const supportedDocumentTypes = (['FACTURA', 'BOLETA'] as const).filter(type => data.supportedDocumentTypes?.includes(type) && (type !== 'BOLETA' || boletaSubmissionMode === 'individual' || summaryReady));
      return { ...base, ready: supportedDocumentTypes.length > 0, issuerName: data.issuer.razonSocial, issuerAddress: data.issuer.direccion, issuerEstablishmentCode, boletaSubmissionMode, supportedDocumentTypes, message: boletaSubmissionMode === 'summary' && !summaryReady
        ? 'Facturas preparadas. Para habilitar boletas falta coordinar la numeración del resumen diario del RUC. Si otro software también emite, reserva un rango exclusivo para Agromax en ambos sistemas.'
        : config.environment === 'production' ? 'Configuración local lista para producción. La aceptación se confirma con la respuesta de SUNAT al emitir.' : 'Conexión verificada en pruebas.' };
    } catch {
      return { ...base, message: 'No se pudo comprobar la conexión. Los borradores siguen disponibles.' };
    }
  }

  async simulate(document: BillingDocumentEntity): Promise<BillingServiceSimulation> {
    const unavailable = { verified: false, message: 'Se completó la revisión local. La conexión con el microservicio de simulación no está disponible.' };
    if (!this.settings().simulationEnabled) return { ...unavailable, message: 'Revisión local completada. La simulación mediante microservicio no está configurada.' };
    const status = await this.getStatus();
    if (!status.simulationReady || status.issuerRuc !== document.issuer.documentNumber || !status.supportedDocumentTypes.includes(document.documentType)) return unavailable;
    const issued = new Date();
    const series = document.documentType === 'FACTURA' ? 'FDEM' : 'BDEM';
    const boletaSubmissionMode = document.documentType === 'BOLETA' ? status.boletaSubmissionMode || 'summary' : undefined;
    const summary = boletaSubmissionMode === 'summary';
    const payload = { ...this.buildPayload({ ...document, series, number: 1, submittedAt: issued, boletaSubmissionMode, summaryNumber: summary ? 1 : undefined, summaryDate: summary ? issued.toLocaleDateString('en-CA', { timeZone: 'America/Lima' }) : undefined }), environment: 'simulation' };
    try {
      const response = await axios.post(`${this.settings().url}/api/agromax/simulate`, payload, this.options(30_000));
      const data = response.data;
      if (response.status !== 200 || data?.simulation !== true || data.status !== 'SIMULATED' || data.environment !== 'simulation' || data.emisorRuc !== document.issuer.documentNumber || data.invoiceNumber !== `${series}-00000001`) return unavailable;
      const result: BillingServiceSimulation = { verified: true, message: 'Conexión y generación de XML/PDF verificadas en el microservicio de simulación. Sin validez tributaria.' };
      for (const field of ['pdfBase64', 'xmlBase64'] as const) {
        const value = data[field];
        if (typeof value !== 'string' || value.length > 3_000_000 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return unavailable;
        const bytes = Buffer.from(value, 'base64');
        if (field === 'pdfBase64' && bytes.subarray(0, 5).toString() !== '%PDF-') return unavailable;
        if (field === 'xmlBase64' && !bytes.toString('utf8').trimStart().startsWith('<')) return unavailable;
        result[field] = value;
      }
      return result;
    } catch { return unavailable; }
  }

  buildPayload(document: BillingDocumentEntity) {
    return {
      emisorRuc: document.issuer.documentNumber, environment: document.environment, taxGroup: document.taxType,
      codigoEstablecimiento: document.issuer.establishmentCode,
      boletaSubmissionMode: document.documentType === 'BOLETA' ? document.boletaSubmissionMode || 'summary' : undefined,
      tipoDoc: document.documentType === 'FACTURA' ? '01' : '03', serie: document.series, numero: String(document.number).padStart(8, '0'),
      fechaEmision: document.submittedAt?.toISOString(), resumenCorrelativo: document.summaryNumber ? String(document.summaryNumber) : undefined, resumenFecha: document.summaryDate,
      cliente: { tipoDoc: document.receiver.documentType === 'RUC' ? '6' : document.receiver.documentType === 'DNI' ? '1' : '-', numDoc: document.receiver.documentNumber || '-', rznSocial: document.receiver.name, address: document.receiver.address },
      items: document.items.map(item => ({
        codProducto: item.productId, descripcion: item.description, unidad: sunatUnit(item.unit), cantidad: item.quantity,
        mtoValorUnitario: Number((item.baseAmount / item.quantity).toFixed(6)), mtoPrecioUnitario: Number((item.total / item.quantity).toFixed(6)),
        mtoValorVenta: item.baseAmount, mtoBaseIgv: item.baseAmount, porcentajeIgv: Number((item.taxRate * 100).toFixed(2)),
        igv: item.taxAmount, totalImpuestos: item.taxAmount, tipAfeIgv: item.taxType === 'GRAVADO' ? '10' : item.taxType === 'EXONERADO' ? '20' : '30',
      })),
      mtoOperGravadas: document.taxableAmount, mtoOperExoneradas: document.exemptAmount, mtoOperInafectas: document.unaffectedAmount,
      mtoIGV: document.taxAmount, totalImpuestos: document.taxAmount, mtoImpVenta: document.total,
    };
  }

  async submit(document: BillingDocumentEntity): Promise<BillingSubmissionResult> {
    try {
      const response = await axios.post(`${this.settings().url}/api/agromax/invoices/generate`, this.buildPayload(document), this.options(90_000));
      return this.parseResult(response.data, document);
    } catch { return { status: 'UNKNOWN', sunatDescription: 'No se confirmó la respuesta. No se repetirá el envío automáticamente.' }; }
  }

  async checkStatus(document: BillingDocumentEntity): Promise<BillingSubmissionResult> {
    try {
      const response = await axios.post(`${this.settings().url}/api/agromax/invoices/status`, { emisorRuc: document.issuer.documentNumber, tipoDoc: document.documentType === 'FACTURA' ? '01' : '03', serie: document.series, numero: String(document.number).padStart(8, '0'), environment: document.environment }, this.options(30_000));
      return this.parseResult(response.data, document);
    } catch { return { status: 'PENDING', ticket: document.ticket, sunatDescription: 'No se pudo consultar el ticket. Puedes consultar de nuevo sin reenviar el comprobante.' }; }
  }

  private parseResult(data: any, document: BillingDocumentEntity): BillingSubmissionResult {
    const unknown: BillingSubmissionResult = { status: 'UNKNOWN', sunatDescription: 'La respuesta no permite confirmar el resultado. Revisa el comprobante antes de continuar.' };
    if (!data || data.invoiceNumber !== `${document.series}-${String(document.number).padStart(8, '0')}` || data.emisorRuc !== document.issuer.documentNumber || data.environment !== document.environment) return unknown;
    const code = data.sunatResponse?.code == null ? undefined : String(data.sunatResponse.code);
    let status: BillingSubmissionResult['status'];
    if (data.status === 'ACCEPTED' && code === '0') status = 'ACCEPTED';
    else if (data.status === 'REJECTED' && code) status = 'REJECTED';
    else if (data.status === 'PENDING' && typeof data.ticket === 'string' && data.ticket) status = 'PENDING';
    else if (data.status === 'UNKNOWN') status = 'UNKNOWN';
    else return unknown;
    const result: BillingSubmissionResult = { status, sunatCode: code, ticket: typeof data.ticket === 'string' ? data.ticket.slice(0, 200) : undefined, sunatDescription: String(data.sunatResponse?.description || data.description || 'Consulta pendiente').slice(0, 2000), hash: typeof data.hash === 'string' ? data.hash.slice(0, 256) : undefined };
    for (const field of ['pdfBase64', 'xmlBase64', 'cdrBase64'] as const) {
      const value = data[field];
      if (value == null || value === '') continue;
      if (typeof value !== 'string' || value.length > 3_000_000 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return unknown;
      const bytes = Buffer.from(value, 'base64');
      if (field === 'pdfBase64' && bytes.subarray(0, 5).toString() !== '%PDF-') return unknown;
      if (field === 'xmlBase64' && !bytes.toString('utf8').trimStart().startsWith('<')) return unknown;
      if (field === 'cdrBase64' && bytes.subarray(0, 2).toString() !== 'PK') return unknown;
      result[field] = value;
    }
    if (status === 'ACCEPTED' && !result.cdrBase64) return unknown;
    return result;
  }
}
