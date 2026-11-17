# Facturación de Agromax: simulación e integración preparada

El flujo disponible parte de una venta registrada. Se prepara un borrador por **venta + empresa emisora + afectación tributaria**. Una misma venta con productos gravados, exonerados e inafectos produce hasta tres documentos independientes por empresa. Se puede elegir factura o boleta para cada grupo. El proceso no vuelve a registrar la venta, descontar stock ni cobrar en caja.

## Probar sin emitir

1. Abrir **Finanzas → Facturación → Preparar comprobante**.
2. Seleccionar venta, empresa/grupo tributario y tipo de documento. Para factura se requiere cliente con RUC; para ventas antiguas se confirma la revisión de impuestos y unidades.
3. Guardar el borrador y abrir su detalle.
4. Usar **Simular sin enviar**. El backend revisa importes, afectación, unidades, identificación del cliente y condición de pago.
5. Descargar el **PDF de simulación**, marcado «SIMULACIÓN LOCAL · SIN VALIDEZ TRIBUTARIA».

La simulación es de solo lectura: mantiene `DRAFT`, no asigna serie ni correlativo fiscal y no genera un CDR de SUNAT. No representa aceptación de SUNAT ni verifica legalmente la exoneración del producto. Sin conexión adicional funciona como revisión local. Con `GREENTER_SIMULATION_ENABLED=true`, URL, clave compartida y RUC de pruebas, también verifica la copia independiente por `/api/agromax/simulate` y permite descargar su XML/PDF de prueba. Este flujo no necesita certificado real ni Clave SOL. Ver `../../MVP.md` para el entorno completo.

## Decolecta: consultas de identidad

Agromax ya dispone de consultas de RUC/DNI desde el backend. El detalle de facturación incorpora el botón **Consultar cliente en Decolecta**, que se ejecuta únicamente al pulsarlo y muestra nombre/razón social y, para RUC, dirección, estado y condición disponibles.

Configurar `DECOLECTA_API_KEY` en el backend. El navegador nunca recibe ese token. La consulta no modifica las instantáneas del borrador: si los datos difieren, corregir la ficha del cliente y descartar/preparar otro borrador. La simulación funciona aunque esta consulta esté sin configurar o temporalmente no disponible.

La documentación pública de Decolecta describe consultas de datos; no se ha encontrado una API de emisión ni un sandbox de facturación: https://decolecta.gitbook.io/docs y https://decolecta.gitbook.io/docs/servicios/integrations.

## Preparación para el microservicio Greenter

La emisión queda deshabilitada por defecto con `GREENTER_ENABLED=false` y `GREENTER_ALLOW_PRODUCTION=false`. No se modificó el entorno de producción ni se enviaron comprobantes reales durante el desarrollo.

La copia independiente de Agromax está en `../facturacion-service/` desde la raíz del proyecto y ofrece rutas autenticadas `/api/agromax/*`. Admite simulación, beta y producción habilitada expresamente; el perfil con la base existente está documentado en `../../LOCAL-FACTURACION.md`. No hay que cambiar ni desplegar sobre el microservicio del hotel. Cada instancia tiene sus propios valores:

| Variable del backend | Uso |
| --- | --- |
| `GREENTER_SERVICE_URL` | URL base HTTPS, sin `/api` al final, credenciales ni parámetros |
| `GREENTER_API_KEY` | Clave compartida con `AGROMAX_API_KEY` del microservicio |
| `GREENTER_ISSUER_RUC` | RUC real del emisor, debe coincidir con la empresa de la venta y con el microservicio |
| `GREENTER_ENVIRONMENT` | `beta` o `production` |
| `GREENTER_SERIE_FACTURA`, `GREENTER_SERIE_BOLETA` | Series de cuatro caracteres, prefijos F/B |
| `GREENTER_FACTURA_NEXT_NUMBER`, `GREENTER_BOLETA_NEXT_NUMBER` | Siguientes números fiscales libres, confirmados antes de habilitar |
| `GREENTER_SUMMARY_NEXT_NUMBER` | Solo para modalidad summary: inicio del contador RC para cada nuevo día |
| `GREENTER_ENABLED` | Habilita la conexión y emisión con `true` |
| `GREENTER_ALLOW_PRODUCTION` | Permite expresamente el ambiente productivo con `true` |

El servicio PHP trabaja con un solo RUC por instancia. Si Agromax y el hotel facturan con RUC diferentes, necesitan instancias/configuraciones separadas. No cambiar el RUC o ambiente de la instancia que el hotel usa en producción para realizar pruebas de Agromax.

Los contadores de Agromax son compartidos entre sucursales y grupos tributarios por RUC + serie + ambiente. Otra aplicación no debe emitir con esas mismas series sin un coordinador de numeración común. Los números iniciales solo inicializan contadores nuevos; cambiar la variable no reinicia un contador existente. Los resúmenes RC también requieren coordinación para el mismo RUC/día. Para probar envíos al ambiente beta se debe usar una base de datos de pruebas; la simulación local no necesita envíos beta.

## Alcance y estados

Ventas (`/sales`) consulta los comprobantes de las ventas visibles mediante `saleIds`, validado y limitado a 50 referencias por consulta, con paginación y alcance de sucursal. Las listas de ventas, boletas y facturas muestran las series, correlativos y estados guardados; los borradores y resultados inciertos no aparecen como aceptados. El detalle utiliza los datos históricos del emisor y receptor y permite visualizar A4/ticket y descargar los archivos PDF/XML/CDR existentes. La exportación incluye una fila por comprobante y afectación, con su estado; si no existe comprobante, indica Sin emitir sin inventar una numeración.

Cuando una venta tiene un comprobante activo, el tipo de comprobante se conserva y no puede cambiarse mediante la actualización manual de Ventas. Los borradores descartados liberan esa restricción. La anulación operativa sigue bloqueada para emisiones enviadas, pendientes, aceptadas o inciertas; Ventas refleja esa misma regla y no emite bajas fiscales.

- Permisos: ADMIN/VENDEDOR y sucursal activa; los archivos también se validan por sucursal.
- Datos históricos: las ventas nuevas guardan nombre, unidad, afectación y tasa del producto. Cambiar el catálogo no altera esos datos. Las ventas antiguas requieren revisión explícita cuando faltan esos campos.
- Emisión inicial: facturas y boletas al contado en PEN, con receptor identificado por DNI/RUC, o boleta simple hasta S/700, y unidades soportadas. El crédito se puede preparar/simular, pero su emisión queda bloqueada hasta implementar las cuotas fiscales.
- Facturas: resultado según CDR, distinguiendo aceptación y rechazo.
- Boletas: con `AGROMAX_BOLETA_SUBMISSION_MODE=individual` en PHP se envía cada XML directamente y se guarda su propio CDR. El backend toma la modalidad de las capacidades del servicio, la guarda en el documento y reserva únicamente el correlativo de la serie BAG. La modalidad summary anterior sigue disponible; en ese caso se conserva el ticket y el CDR del resumen RC. Un resultado incierto nunca cambia de modalidad ni se reenvía automáticamente.
- Los borradores se pueden descartar conservando motivo e historial. Un documento enviado no se descarta ni se reenvía con otro número automáticamente.
- Ante respuesta incierta se conserva `UNKNOWN`; requiere conciliación antes de continuar. `SENDING` tras una caída también requiere revisión. No hay recuperador automático de documentos sin resultado confirmado.
- Ventas con documentos enviados, pendientes o inciertos bloquean la anulación operativa y la eliminación de caja/crédito vinculados. Esto es una comprobación previa; aún falta coordinar transaccionalmente la anulación y la emisión concurrentes para habilitar una operación productiva completa.
- No se implementaron notas de crédito/débito, bajas fiscales, corrección de rechazados ni emisión a crédito con cuotas. Son pasos posteriores; no se ofrece una anulación fiscal desde el botón de anular venta.

Comprobar conexión solo valida la configuración local; la autenticación y aceptación de SUNAT se confirman al emitir manualmente. Además de las regresiones con repositorios de prueba, `npm run test:mvp` prueba Nest, MongoDB temporal y el PHP independiente con documentos simulados y solicitudes concurrentes de borradores. Ninguna prueba usa datos productivos.

## Verificación local

Con la versión Node de `.nvmrc`:

```bash
npm run test:billing
npm run test:security
```

En el frontend: `npm run build`, `npm run test:billing` y `npm run test:security`.

En el microservicio: `php tests/agromax-gateway.test.php` y, con las dependencias de Composer instaladas, `php tests/agromax-invoice.test.php`. La segunda prueba genera un certificado autofirmado temporal y sustituye todos los envíos y consultas SUNAT por respuestas simuladas, usando Greenter y Dompdf reales para XML/PDF.

El receptor puede editarse únicamente en DRAFT mediante `POST /api/billing/documents/:id/receiver`, con `receiver` y `expectedRevision`. El envío incluye `receiverRevision` y requiere confirmación explícita. El servidor rechaza revisiones obsoletas antes de reservar numeración. Cambiar el receptor no modifica la venta ni el maestro de clientes. Las facturas requieren RUC de 11 dígitos que comience con 10 o 20; boletas con identificación admiten DNI de 8 dígitos o RUC. Las boletas simples se envían con marcadores de identidad `-`, sin inventar DNI.
