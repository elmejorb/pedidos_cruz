<?php

namespace App\Services;

use App\Models\ConfigFe;
use App\Models\Factura;
use App\Models\FacturaDetalle;
use App\Models\NotaCredito;
use App\Models\Pedido;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Convierte un Pedido en Factura Electrónica enviándolo a la API DIAN
 * (api-electronica, endpoint /api/factura/send-v2). Mismo formato de payload
 * que usa el facturador Conta (conta-app-backend/api/facturacion-electronica/enviar.php).
 */
class FacturacionElectronicaService
{
    /** Código DIAN tipo documento => id en la tabla tipos_documentos de la API */
    const TIPOS_DOCUMENTO = [
        '31' => ['id' => 1, 'nombre' => 'NIT'],
        '13' => ['id' => 2, 'nombre' => 'Cédula de ciudadanía'],
        '22' => ['id' => 3, 'nombre' => 'Cédula de extranjería'],
        '41' => ['id' => 4, 'nombre' => 'Pasaporte'],
        '42' => ['id' => 5, 'nombre' => 'Documento extranjero'],
    ];

    /** id API type_liabilities => código */
    const RESPONSABILIDADES = [1 => '50', 2 => '51', 3 => '52', 4 => 'R-99-PN'];

    /** id API unit_measures usado para ventas por caja (BX) */
    const UNIDAD_CAJA = 381;

    const UNIDADES = [
        70 => 'Unidad', 381 => 'Caja', 642 => 'Cada', 767 => 'Kilogramo', 692 => 'Gramo',
        802 => 'Libra', 821 => 'Litro', 686 => 'Galón', 923 => 'Paquete', 636 => 'Docena',
        372 => 'Botella', 938 => 'Par', 865 => 'Metro',
    ];

    /** Consumidor final (mismo usado por el facturador, aceptado por DIAN) */
    const CONSUMIDOR_FINAL = ['identificacion' => '222222222', 'tipo' => '31', 'nombre' => 'CONSUMIDOR FINAL'];

    private $config;

    public function __construct()
    {
        $this->config = ConfigFe::actual();
    }

    public function config(): ConfigFe
    {
        return $this->config;
    }

    // ==================================================================
    // PREPARACIÓN
    // ==================================================================

    /**
     * Valida el pedido y calcula cliente, líneas y totales tal como se facturarían.
     * No escribe nada en la base de datos.
     *
     * @param array $opciones forma_pago (1|2), medio_pago (código DIAN), dias_credito, consumidor_final (bool), email
     */
    public function preparar(Pedido $pedido, array $opciones = []): array
    {
        $pedido->loadMissing(['cliente', 'detalles.producto']);
        $errores = [];
        $cfg = $this->config;

        if (!$cfg->activo) $errores[] = 'La facturación electrónica no está activada (Configuración FE).';
        if (!$cfg->api_email || !$cfg->api_password) $errores[] = 'Faltan las credenciales de la API DIAN (Configuración FE).';
        if ($pedido->estado === 'cancelado') $errores[] = 'El pedido está cancelado.';
        if ($pedido->detalles->isEmpty()) $errores[] = 'El pedido no tiene productos.';

        $yaFacturado = Factura::where('id_pedido', $pedido->id_pedido)->where('estado', 'autorizada')->first();
        if ($yaFacturado) $errores[] = "El pedido ya fue facturado ({$yaFacturado->prefijo}{$yaFacturado->numero}).";

        // ---------- Cliente ----------
        $cli = $pedido->cliente;
        $consumidorFinal = !empty($opciones['consumidor_final']);
        $municipio = null;

        if ($consumidorFinal) {
            $identificacion = self::CONSUMIDOR_FINAL['identificacion'];
            $tipoDoc = self::CONSUMIDOR_FINAL['tipo'];
            $nombre = self::CONSUMIDOR_FINAL['nombre'];
            $tipoOrg = 2;
            $idResp = 4;
        } else {
            $identificacion = self::nitBase($cli->nit_cedula ?? '');
            $tipoDoc = (string) ($cli->tipo_documento ?? '13');
            $nombre = trim($cli->razon_social ?: $cli->nombre);
            $tipoOrg = (int) ($cli->tipo_organizacion ?? 2);
            $idResp = (int) ($cli->id_responsabilidad ?? 4);

            if (!$identificacion || $identificacion === '0') {
                $errores[] = 'El cliente no tiene NIT / Cédula. Complétalo o factura a Consumidor Final.';
            }
            if (!isset(self::TIPOS_DOCUMENTO[$tipoDoc])) $errores[] = 'Tipo de documento del cliente inválido.';
        }

        $municipio = $this->resolverMunicipio($consumidorFinal ? null : $cli);
        if (!$municipio) {
            $errores[] = 'No se pudo determinar el municipio del cliente. Selecciónalo en el cliente o define un municipio por defecto en Configuración FE.';
        }

        $email = trim($opciones['email'] ?? '') ?: trim($cli->email ?? '');
        if ($email && !filter_var(explode(',', $email)[0], FILTER_VALIDATE_EMAIL)) {
            $errores[] = "El email del cliente no es válido: {$email}";
        }

        // ---------- Pago ----------
        $formaPago = (int) ($opciones['forma_pago'] ?? 1) === 2 ? 2 : 1;
        $medioPago = (int) ($opciones['medio_pago'] ?? 10) ?: 10;
        $diasCredito = $formaPago === 2 ? (int) ($opciones['dias_credito'] ?? 0) : 0;
        if ($formaPago === 2 && $diasCredito <= 0) $errores[] = 'Para venta a crédito indica los días de plazo.';

        // ---------- Líneas ----------
        $noResponsableIva = self::esNoResponsableIva($cfg->empresa_regimen);
        $lineas = [];
        $totalBase = 0;
        $totalIva = 0;

        foreach ($pedido->detalles as $d) {
            $prod = $d->producto;
            $cant = (float) $d->cantidad;
            $precio = (float) $d->precio_unitario;
            $desc = (float) ($d->descuento ?? 0);
            $esCaja = $d->tipo_unidad === 'caja';
            $pct = $noResponsableIva ? 0 : (float) ($prod->iva ?? 0);

            // Precio con IVA incluido: se separa base e impuesto
            $lineAmount = round($cant * $precio - $desc, 2);
            $ivaAmount = $pct > 0 ? round($lineAmount * ($pct / (100 + $pct)), 2) : 0;
            $base = round($lineAmount - $ivaAmount, 2);

            $unitId = $esCaja ? self::UNIDAD_CAJA : (int) ($prod->unit_measure_id ?? 70);
            $descripcion = $prod->nombre ?? 'Producto';
            if ($esCaja && ($prod->unidades_por_caja ?? 1) > 1) {
                $descripcion .= " (Caja x {$prod->unidades_por_caja})";
            }

            $lineas[] = [
                'id_producto' => $d->id_producto,
                'codigo' => $prod->codigo ?: (string) $d->id_producto,
                'descripcion' => mb_substr($descripcion, 0, 255),
                'unit_measure_id' => $unitId,
                'unidad' => self::UNIDADES[$unitId] ?? 'Unidad',
                'cantidad' => $cant,
                'precio' => $precio,
                'descuento' => $desc,
                'iva_porcentaje' => $pct,
                'base' => $base,
                'iva' => $ivaAmount,
                'total' => $lineAmount,
            ];
            $totalBase += $base;
            $totalIva += $ivaAmount;
        }

        $descuentoGlobal = round((float) $pedido->descuento, 2);
        $total = round($totalBase + $totalIva - $descuentoGlobal, 2);
        if ($total <= 0 && $pedido->detalles->isNotEmpty()) $errores[] = 'El total a facturar debe ser mayor a cero.';

        $ahora = Carbon::now('America/Bogota');

        return [
            'errores' => $errores,
            'advertencias' => $this->advertencias($pedido, $email, $consumidorFinal),
            'cliente' => [
                'identificacion' => $identificacion,
                'dv' => self::calcularDV($identificacion),
                'tipo_documento' => $tipoDoc,
                'tipo_documento_nombre' => self::TIPOS_DOCUMENTO[$tipoDoc]['nombre'] ?? $tipoDoc,
                'tipo_organizacion' => $tipoOrg,
                'id_responsabilidad' => $idResp,
                'nombre' => $nombre,
                'direccion' => $consumidorFinal ? '-' : ($cli->direccion ?: '-'),
                'telefono' => $consumidorFinal ? '0' : (preg_replace('/[^0-9]/', '', $cli->telefono ?? '') ?: '0'),
                'email' => $email,
                'municipio' => $municipio,
                'consumidor_final' => $consumidorFinal,
            ],
            'pago' => [
                'forma_pago' => $formaPago,
                'medio_pago' => $medioPago,
                'dias_credito' => $diasCredito,
                'fecha_vencimiento' => $formaPago === 2 ? $ahora->copy()->addDays($diasCredito)->toDateString() : null,
            ],
            'lineas' => $lineas,
            'totales' => [
                'subtotal' => round($totalBase, 2),
                'iva' => round($totalIva, 2),
                'descuento' => $descuentoGlobal,
                'total' => $total,
            ],
            'fecha' => $ahora->toDateString(),
            'hora' => $ahora->format('H:i:s'),
            'nota' => trim("Pedido {$pedido->numero_pedido}" . ($pedido->notas ? ". {$pedido->notas}" : '')),
        ];
    }

    private function advertencias(Pedido $pedido, string $email, bool $consumidorFinal): array
    {
        $adv = [];
        if (!$email) $adv[] = 'El cliente no tiene email: la factura no se enviará por correo.';
        if ((float) $pedido->impuesto > 0) {
            $adv[] = 'El pedido tiene un "impuesto" manual; en la factura el IVA se calcula por producto (incluido en el precio).';
        }
        if ($consumidorFinal) $adv[] = 'Se facturará a CONSUMIDOR FINAL.';
        return $adv;
    }

    // ==================================================================
    // ENVÍO
    // ==================================================================

    /**
     * Crea (o reutiliza si fue rechazada) la factura del pedido y la envía a la DIAN.
     */
    public function facturar(Pedido $pedido, array $opciones, int $idUsuario): array
    {
        $prep = $this->preparar($pedido, $opciones);
        if ($prep['errores']) {
            return ['ok' => false, 'http' => 422, 'mensaje' => 'No se puede facturar', 'errores' => $prep['errores']];
        }

        // Bloqueo contra doble envío
        $factura = DB::transaction(function () use ($pedido, $prep, $idUsuario) {
            Pedido::where('id_pedido', $pedido->id_pedido)->lockForUpdate()->first();

            $existente = Factura::where('id_pedido', $pedido->id_pedido)
                ->whereIn('estado', ['pendiente', 'rechazada', 'error'])
                ->orderByDesc('id_factura')->first();

            if ($existente && $existente->estado === 'pendiente'
                && $existente->updated_at && $existente->updated_at->gt(Carbon::now()->subMinutes(2))) {
                return null; // otro envío en curso
            }

            $datos = $this->datosFactura($pedido, $prep, $idUsuario);
            if ($existente) {
                $existente->fill($datos)->save();
                FacturaDetalle::where('id_factura', $existente->id_factura)->delete();
                $factura = $existente;
            } else {
                $factura = Factura::create($datos);
            }

            foreach ($prep['lineas'] as $l) {
                FacturaDetalle::create(array_merge($l, ['id_factura' => $factura->id_factura]));
            }
            return $factura;
        });

        if (!$factura) {
            return ['ok' => false, 'http' => 409, 'mensaje' => 'Ya hay un envío en curso para este pedido. Espera un momento.'];
        }

        return $this->enviar($factura, $prep);
    }

    private function datosFactura(Pedido $pedido, array $prep, int $idUsuario): array
    {
        $c = $prep['cliente'];
        return [
            'id_pedido' => $pedido->id_pedido,
            'estado' => 'pendiente',
            'cliente_identificacion' => $c['identificacion'],
            'cliente_dv' => $c['dv'],
            'cliente_tipo_documento' => $c['tipo_documento'],
            'cliente_nombre' => $c['nombre'],
            'cliente_direccion' => $c['direccion'],
            'cliente_telefono' => $c['telefono'],
            'cliente_email' => $c['email'] ?: null,
            'cliente_municipio' => $c['municipio']['name'] ?? null,
            'forma_pago' => $prep['pago']['forma_pago'],
            'medio_pago' => $prep['pago']['medio_pago'],
            'dias_credito' => $prep['pago']['dias_credito'],
            'fecha_vencimiento' => $prep['pago']['fecha_vencimiento'],
            'subtotal' => $prep['totales']['subtotal'],
            'iva' => $prep['totales']['iva'],
            'descuento' => $prep['totales']['descuento'],
            'total' => $prep['totales']['total'],
            'nota' => $prep['nota'],
            'status_code' => null,
            'mensaje_dian' => null,
            'errores' => null,
            'id_usuario' => $idUsuario,
        ];
    }

    private function enviar(Factura $factura, array $prep): array
    {
        $login = $this->login();
        if (!$login['ok']) {
            $factura->update(['estado' => 'error', 'mensaje_dian' => $login['mensaje'], 'intentos' => $factura->intentos + 1]);
            return ['ok' => false, 'http' => 502, 'mensaje' => $login['mensaje'], 'factura' => $factura->fresh('detalles')];
        }

        $payload = $this->construirPayload($prep, $login['company_id']);
        $factura->request_json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $factura->save();

        $res = $this->http('POST', '/api/factura/send-v2', $payload, $login['token'], 90);
        $body = $res['body'] ?? [];

        $factura->response_json = json_encode($body ?: ['raw' => $res['raw'] ?? null, 'http' => $res['http']], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $factura->intentos = $factura->intentos + 1;
        $factura->status_code = $body['status_code'] ?? null;

        $aprobada = !empty($body['success']) && !empty($body['cufe']);

        if ($aprobada) {
            $email = $body['email_result'] ?? null;
            $factura->fill([
                'estado' => 'autorizada',
                'cufe' => $body['cufe'],
                'prefijo' => $body['prefix'] ?? $this->config->resolucion_prefijo,
                'numero' => $body['consecutive'] ?? null,
                // Fecha/hora que enviamos (hora Colombia); la API responde la hora en UTC
                'fecha_emision' => $prep['fecha'] . ' ' . $prep['hora'],
                'mensaje_dian' => mb_substr($body['message'] ?? 'Factura autorizada', 0, 500),
                'errores' => null,
                'email_enviado' => !empty($email['success']) ? 1 : 0,
                'email_enviado_at' => !empty($email['success']) ? Carbon::now() : null,
            ]);
            $factura->save();

            return [
                'ok' => true, 'http' => 200,
                'mensaje' => "Factura {$factura->prefijo}{$factura->numero} autorizada por la DIAN",
                'factura' => $factura->fresh('detalles'),
            ];
        }

        // Rechazo DIAN o error de comunicación
        $errores = self::extraerErrores($body, $res);
        $esRechazoDian = isset($body['status_code']) || isset($body['errors']);
        $mensaje = $body['error'] ?? $body['message'] ?? ($res['error'] ?? "Respuesta inválida de la API (HTTP {$res['http']})");

        $factura->fill([
            'estado' => $esRechazoDian ? 'rechazada' : 'error',
            'mensaje_dian' => mb_substr(is_string($mensaje) ? $mensaje : json_encode($mensaje), 0, 500),
            'errores' => $errores,
        ]);
        $factura->save();

        Log::warning('FE rechazada', ['id_factura' => $factura->id_factura, 'errores' => $errores]);

        return [
            'ok' => false, 'http' => 422,
            'mensaje' => $esRechazoDian ? 'La DIAN rechazó la factura' : $factura->mensaje_dian,
            'errores' => array_map(fn($e) => trim(($e['code'] ?? '') . ' ' . ($e['message'] ?? '')), $errores),
            'factura' => $factura->fresh('detalles'),
        ];
    }

    public function construirPayload(array $prep, int $companyId): array
    {
        $c = $prep['cliente'];
        $m = $c['municipio'];

        $customer = [
            'identification_number' => $c['identificacion'],
            'dv' => $c['dv'],
            'name' => $c['nombre'],
            'phone' => $c['telefono'],
            'address' => $c['direccion'],
            'email' => $c['email'] ?: '-',
            'merchant_registration' => '0000000-00',
            'type_document_identification' => [
                'id' => (string) self::TIPOS_DOCUMENTO[$c['tipo_documento']]['id'],
                'code' => $c['tipo_documento'],
            ],
            'type_organization' => ['id' => (string) $c['tipo_organizacion'], 'code' => (string) $c['tipo_organizacion']],
            'type_liability' => [
                'id' => (string) $c['id_responsabilidad'],
                'code' => self::RESPONSABILIDADES[$c['id_responsabilidad']] ?? 'R-99-PN',
            ],
            'tax' => ['id' => '01', 'code' => '01', 'name' => 'IVA'],
            'municipality' => [
                'id' => (string) $m['id'],
                'code' => $m['code'],
                'name' => $m['name'],
                'department' => ['code' => $m['dept_code'], 'name' => $m['dept_name']],
            ],
            'country' => ['code' => 'CO', 'name' => 'Colombia'],
            'language' => ['code' => 'es'],
        ];

        $n = fn($v) => number_format((float) $v, 2, '.', '');

        $lines = array_map(function ($l) use ($n) {
            $factor = 1 + $l['iva_porcentaje'] / 100;
            $bruto = round($l['cantidad'] * $l['precio'] / $factor, 2);
            return [
                'unit_measure_id' => $l['unit_measure_id'],
                'invoiced_quantity' => $n($l['cantidad']),
                'line_extension_amount' => $n($l['base']),
                'free_of_charge_indicator' => false,
                'allowance_charges' => $l['descuento'] > 0 ? [[
                    'charge_indicator' => false,
                    'allowance_charge_reason' => 'Descuento',
                    'amount' => $n($bruto - $l['base']),
                    'base_amount' => $n($bruto),
                ]] : [],
                'tax_totals' => [[
                    'tax_id' => 1,
                    'tax_amount' => $n($l['iva']),
                    'taxable_amount' => $n($l['base']),
                    'percent' => $n($l['iva_porcentaje']),
                ]],
                'description' => $l['descripcion'],
                'code' => $l['codigo'],
                'type_item_identification_id' => 3,
                // Precio unitario antes de IVA (con 0% coincide con el precio de venta)
                'price_amount' => $n($l['precio'] / $factor),
                'base_quantity' => $n($l['cantidad']),
            ];
        }, $prep['lineas']);

        $t = $prep['totales'];
        $p = $prep['pago'];

        $payload = [
            'company_id' => $companyId,
            'note' => $prep['nota'],
            'customer' => $customer,
            'legal_monetary_totals' => [
                'line_extension_amount' => $n($t['subtotal']),
                'tax_exclusive_amount' => $n($t['subtotal']),
                'tax_inclusive_amount' => $n($t['subtotal'] + $t['iva']),
                'allowance_total_amount' => $n($t['descuento']),
                'charge_total_amount' => '0.00',
                'payable_amount' => $n($t['total']),
            ],
            'invoice_lines' => $lines,
            'payment_form' => array_filter([
                'payment_form_id' => $p['forma_pago'],
                'payment_method_id' => $p['medio_pago'],
                'payment_due_date' => $p['fecha_vencimiento'],
                'duration_measure' => $p['dias_credito'] > 0 ? $p['dias_credito'] : null,
            ], fn($v) => $v !== null),
            'date' => $prep['fecha'],
            'time' => $prep['hora'],
        ];

        if ($this->config->enviar_email && $c['email']) {
            $payload['send_email'] = 'S';
            $payload['customer_email'] = $c['email'];
        }

        return $payload;
    }

    // ==================================================================
    // NOTA CRÉDITO: ANULACIÓN (concepto 2, Lista 34 DIAN)
    // Se reenvía el MISMO JSON de la factura original + billing_reference + credit_note,
    // igual que el facturador Conta (enviar.php, case 'nota_credito').
    // ==================================================================
    public function anular(Factura $factura, string $motivo, int $idUsuario): array
    {
        if ($factura->estado !== 'autorizada' || !$factura->cufe) {
            return ['ok' => false, 'http' => 409, 'mensaje' => 'Solo se pueden anular facturas autorizadas por la DIAN'];
        }
        $original = json_decode($factura->request_json ?? '', true);
        if (!is_array($original) || empty($original['invoice_lines'])) {
            return ['ok' => false, 'http' => 422, 'mensaje' => 'No se encontró el JSON original de la factura para armar la nota crédito'];
        }

        // Bloqueo contra doble anulación
        $nota = DB::transaction(function () use ($factura, $motivo, $idUsuario) {
            Factura::where('id_factura', $factura->id_factura)->lockForUpdate()->first();
            $enCurso = NotaCredito::where('id_factura', $factura->id_factura)
                ->where(fn($q) => $q->where('estado', 'autorizada')
                    ->orWhere(fn($w) => $w->where('estado', 'pendiente')->where('updated_at', '>', Carbon::now()->subMinutes(3))))
                ->exists();
            if ($enCurso) return null;
            return NotaCredito::create([
                'id_factura' => $factura->id_factura,
                'estado' => 'pendiente',
                'concepto' => 2,
                'motivo' => mb_substr($motivo, 0, 500),
                'total' => $factura->total,
                'id_usuario' => $idUsuario,
            ]);
        });
        if (!$nota) {
            return ['ok' => false, 'http' => 409, 'mensaje' => 'La factura ya tiene una nota crédito autorizada o en proceso'];
        }

        $login = $this->login();
        if (!$login['ok']) {
            $nota->update(['estado' => 'error', 'mensaje_dian' => $login['mensaje']]);
            return ['ok' => false, 'http' => 502, 'mensaje' => $login['mensaje']];
        }

        $payload = $original;
        unset($payload['note'], $payload['send_email'], $payload['customer_email'], $payload['withholding_taxes']);
        $payload['company_id'] = $login['company_id'];
        $payload['billing_reference'] = [
            'number' => ($factura->prefijo ?? '') . $factura->numero,
            'uuid' => $factura->cufe,
            'scheme_name' => 'CUFE-SHA384',
            'issue_date' => substr((string) $factura->fecha_emision, 0, 10),
        ];
        $payload['credit_note'] = [
            'reason' => 'Anulación de factura electrónica',
            'correction_concept_id' => '2',
            'description' => mb_substr($motivo, 0, 250),
        ];

        $nota->request_json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $nota->save();

        $res = $this->http('POST', '/api/notas/credito/enviar', $payload, $login['token'], 90);
        $body = $res['body'] ?? [];
        $nota->response_json = json_encode($body ?: ['raw' => $res['raw'] ?? null, 'http' => $res['http']], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $nota->status_code = $body['status_code'] ?? null;

        // La API de NC no envía "success": se aprueba por CUFE + status 00
        $aprobada = !empty($body['cufe']) && is_string($body['cufe']) && (($body['status_code'] ?? '00') === '00');

        if ($aprobada) {
            $dian = $body['response_dian']['Envelope']['Body']['SendBillSyncResponse']['SendBillSyncResult'] ?? [];
            $mensajeDian = is_string($dian['StatusMessage'] ?? null) ? $dian['StatusMessage'] : ($body['message'] ?? 'Nota crédito autorizada');
            // El número real viene en el mensaje DIAN ("La Nota Crédito NC12, ha sido autorizada.")
            $prefijo = $body['prefix'] ?? null;
            $numero = null;
            if ($prefijo && preg_match('/\b' . preg_quote($prefijo, '/') . '(\d+)\b/', $mensajeDian, $m)) $numero = $m[1];
            if (!$numero) $numero = (string) ($body['consecutive'] ?? '');

            $nota->fill([
                'estado' => 'autorizada',
                'prefijo' => $prefijo,
                'numero' => $numero,
                'cufe' => $body['cufe'],
                'fecha_emision' => Carbon::now(),
                'mensaje_dian' => mb_substr($mensajeDian, 0, 500),
                'errores' => null,
            ])->save();
            $factura->update(['estado' => 'anulada']);

            return [
                'ok' => true, 'http' => 200,
                'mensaje' => "Factura {$factura->prefijo}{$factura->numero} anulada con la nota crédito {$prefijo}{$numero}",
                'nota' => $nota->fresh(),
            ];
        }

        $errores = self::extraerErrores($body, $res);
        $mensaje = $body['error'] ?? $body['message'] ?? ($res['error'] ?? "Respuesta inválida de la API (HTTP {$res['http']})");
        if (is_string($mensaje) && stripos($mensaje, 'resolución activa') !== false) {
            $mensaje .= '. Falta configurar en la API una resolución activa de Nota Crédito para esta empresa.';
        }
        $nota->fill([
            'estado' => isset($body['respuesta_dian']) || isset($body['status_code']) ? 'rechazada' : 'error',
            'mensaje_dian' => mb_substr(is_string($mensaje) ? $mensaje : json_encode($mensaje), 0, 500),
            'errores' => $errores,
        ])->save();
        Log::warning('NC rechazada', ['id_factura' => $factura->id_factura, 'errores' => $errores]);

        return [
            'ok' => false, 'http' => 422,
            'mensaje' => $nota->mensaje_dian,
            'errores' => array_map(fn($e) => trim(($e['code'] ?? '') . ' ' . ($e['message'] ?? '')), $errores),
            'nota' => $nota->fresh(),
        ];
    }

    // ==================================================================
    // OTRAS ACCIONES
    // ==================================================================

    public function reenviarEmail(Factura $factura, string $email): array
    {
        if (!$factura->cufe) return ['ok' => false, 'mensaje' => 'La factura no tiene CUFE'];

        $login = $this->login();
        if (!$login['ok']) return ['ok' => false, 'mensaje' => $login['mensaje']];

        $res = $this->http('POST', '/api/email/send-complete', [
            'company_id' => $login['company_id'],
            'cufe' => $factura->cufe,
            'email' => $email,
            'force_resend' => true,
        ], $login['token']);

        $ok = $res['http'] === 200 && ($res['body']['success'] ?? true);
        if ($ok) {
            $factura->update(['email_enviado' => 1, 'email_enviado_at' => Carbon::now(), 'cliente_email' => $email]);
        }
        return [
            'ok' => $ok,
            'mensaje' => $res['body']['message'] ?? ($ok ? "Factura enviada a {$email}" : 'No se pudo enviar el correo'),
        ];
    }

    /** Prueba las credenciales y devuelve la(s) resolución(es) activas. */
    public function probarConexion(): array
    {
        $login = $this->login();
        if (!$login['ok']) return $login;

        $res = $this->http('GET', "/api/resoluciones/company/{$login['company_id']}", null, $login['token']);
        return [
            'ok' => true,
            'mensaje' => 'Conexión exitosa con la API DIAN',
            'company_id' => $login['company_id'],
            'usuario' => $login['usuario'],
            'resolucion_login' => $login['resolucion'],
            'resoluciones' => $res['body'] ?? null,
        ];
    }

    // ==================================================================
    // HELPERS
    // ==================================================================

    private function login(): array
    {
        $cfg = $this->config;
        if (!$cfg->api_email || !$cfg->api_password) {
            return ['ok' => false, 'mensaje' => 'Configure email y contraseña de la API DIAN'];
        }
        $res = $this->http('POST', '/login', ['email' => $cfg->api_email, 'password' => $cfg->api_password]);
        if (!empty($res['body']['token'])) {
            return [
                'ok' => true,
                'token' => $res['body']['token'],
                'company_id' => (int) ($res['body']['id_empresa'] ?? 1),
                'resolucion' => $res['body']['resolucion'] ?? null,
                'usuario' => $res['body']['usuario'] ?? null,
            ];
        }
        $msg = $res['body']['message'] ?? $res['body']['error'] ?? $res['error'] ?? 'Error al autenticar con la API DIAN';
        return ['ok' => false, 'mensaje' => 'API DIAN: ' . (is_string($msg) ? $msg : json_encode($msg))];
    }

    private function http(string $method, string $path, ?array $data = null, ?string $token = null, int $timeout = 60): array
    {
        $url = rtrim($this->config->api_url, '/') . $path;
        $ch = curl_init($url);
        $headers = ['Content-Type: application/json', 'Accept: application/json'];
        if ($token) $headers[] = "Authorization: Bearer {$token}";

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_CUSTOMREQUEST => $method,
        ]);
        if ($data !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data, JSON_UNESCAPED_UNICODE));

        $raw = curl_exec($ch);
        $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($error) return ['http' => 0, 'body' => null, 'error' => "Error de conexión: {$error}", 'raw' => null];

        $body = json_decode($raw, true);
        return ['http' => $http, 'body' => is_array($body) ? $body : null, 'raw' => is_array($body) ? null : mb_substr((string) $raw, 0, 1000)];
    }

    private static function extraerErrores(?array $body, array $res): array
    {
        if (!$body) {
            return [['code' => 'HTTP' . $res['http'], 'message' => $res['error'] ?? ('Respuesta no válida: ' . ($res['raw'] ?? ''))]];
        }
        $soap = $body['respuesta_dian']['Envelope']['Body']['SendBillSyncResponse']['SendBillSyncResult']
            ?? $body['response_dian']['Envelope']['Body']['SendBillSyncResponse']['SendBillSyncResult'] ?? null;
        $msgs = $soap['ErrorMessage']['string'] ?? null;
        if ($msgs && empty($body['errors'])) {
            $out = [];
            foreach ((array) $msgs as $m) {
                if (!is_string($m)) continue;
                $code = preg_match('/Regla:\s*([A-Z0-9]+)/', $m, $mm) ? $mm[1] : '';
                $out[] = ['code' => $code, 'message' => trim(preg_replace('/^Regla:\s*[A-Z0-9]+,\s*/', '', $m))];
            }
            if ($out) return $out;
        }

        $items = $body['errors']['items'] ?? null;
        if (is_array($items) && $items) {
            return array_values(array_map(fn($e) => [
                'code' => $e['code'] ?? '',
                'message' => $e['message'] ?? ($e['raw'] ?? ''),
            ], $items));
        }
        if (isset($body['errors']) && is_array($body['errors'])) {
            // Errores de validación Laravel: { campo: [mensajes] }
            $out = [];
            foreach ($body['errors'] as $campo => $msgs) {
                foreach ((array) $msgs as $msg) {
                    if (is_string($msg)) $out[] = ['code' => (string) $campo, 'message' => $msg];
                }
            }
            if ($out) return $out;
        }
        $msg = $body['error'] ?? $body['message'] ?? $body['status_description'] ?? 'Error desconocido';
        return [['code' => $body['status_code'] ?? '', 'message' => is_string($msg) ? $msg : json_encode($msg)]];
    }

    /** Municipio del cliente: id explícito → nombre de la ciudad → default de configuración. */
    private function resolverMunicipio($cliente): ?array
    {
        $q = DB::table('pc_dian_municipios as m')
            ->join('pc_dian_departamentos as d', 'd.id', '=', 'm.department_id')
            ->select('m.id', 'm.code', 'm.name', 'd.code as dept_code', 'd.name as dept_name');

        $row = null;
        if ($cliente && !empty($cliente->id_municipio)) {
            $row = (clone $q)->where('m.id', $cliente->id_municipio)->first();
        }
        if (!$row && $cliente && $cliente->ciudad) {
            $ciudad = self::normalizar($cliente->ciudad);
            $candidatos = (clone $q)->get()->filter(fn($m) => self::normalizar($m->name) === $ciudad);
            if ($candidatos->count() === 1) $row = $candidatos->first();
        }
        if (!$row && $this->config->id_municipio_default) {
            $row = (clone $q)->where('m.id', $this->config->id_municipio_default)->first();
        }
        if (!$row) return null;

        return [
            'id' => (int) $row->id,
            'code' => $row->code,
            'name' => trim($row->name),
            'dept_code' => $row->dept_code,
            'dept_name' => trim($row->dept_name),
        ];
    }

    public static function normalizar(string $s): string
    {
        $s = mb_strtolower(trim($s));
        $s = strtr($s, ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n']);
        return preg_replace('/[^a-z0-9 ]/', '', preg_replace('/,.*$/', '', $s));
    }

    public static function esNoResponsableIva(?string $regimen): bool
    {
        $r = mb_strtolower(trim($regimen ?? ''));
        return $r === '' || str_contains($r, 'no resp') || str_contains($r, 'simpl') || $r === 'no';
    }

    public static function nitBase(?string $nit): string
    {
        if ($nit === null || $nit === '') return '';
        if (strpos($nit, '-') !== false) $nit = explode('-', $nit)[0];
        return preg_replace('/[^0-9]/', '', $nit);
    }

    public static function calcularDV(?string $nit): string
    {
        $nit = self::nitBase($nit);
        if (!$nit || $nit === '0') return '0';
        $primes = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
        $sum = 0;
        $digits = str_split(strrev($nit));
        for ($i = 0; $i < count($digits) && $i < count($primes); $i++) $sum += intval($digits[$i]) * $primes[$i];
        $mod = $sum % 11;
        return $mod >= 2 ? (string) (11 - $mod) : (string) $mod;
    }
}
