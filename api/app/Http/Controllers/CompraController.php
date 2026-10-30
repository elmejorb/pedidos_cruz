<?php

namespace App\Http\Controllers;

use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Compras a proveedores y cuentas por pagar.
 * Reglas (las mismas del Facturador):
 *  - Al guardar la compra sube el stock (en unidades) y el precio de costo del producto queda
 *    en el último costo: (base - descuento prorrateado + IVA + flete prorrateado) / unidades.
 *  - El descuento se aplica antes del IVA; el flete se prorratea por el valor de cada línea.
 *  - Contado: queda pagada (pago automático). Crédito: queda con saldo = total - retención.
 *  - Editar o anular revierte el stock; no se permite si la compra ya tiene abonos.
 */
class CompraController extends Controller
{
    const MEDIOS = ['efectivo', 'transferencia', 'nequi', 'daviplata', 'tarjeta', 'cheque', 'otro'];

    private function soloAdmin(Request $request)
    {
        if ($request->usuario->rol !== 'admin') {
            return response()->json(['error' => true, 'mensaje' => 'Solo el administrador puede gestionar compras'], 403);
        }
        if (!Schema::hasTable('pc_compras')) {
            return response()->json(['error' => true, 'mensaje' => 'Falta ejecutar la migración de compras (compras_schema.sql)'], 500);
        }
        return null;
    }

    // ==================================================================
    // COMPRAS
    // ==================================================================

    public function index(Request $request)
    {
        if ($r = $this->soloAdmin($request)) return $r;

        $q = DB::table('pc_compras as c')
            ->join('pc_proveedores as p', 'p.id_proveedor', '=', 'c.id_proveedor')
            ->leftJoin('pc_usuarios as u', 'u.id_usuario', '=', 'c.id_usuario')
            ->select('c.*', 'p.nombre as proveedor', 'p.nit as proveedor_nit', 'u.nombre as usuario',
                DB::raw('(SELECT COUNT(*) FROM pc_compra_detalle d WHERE d.id_compra = c.id_compra) as items'));

        if ($request->desde) $q->where('c.fecha', '>=', $request->desde);
        if ($request->hasta) $q->where('c.fecha', '<=', $request->hasta);
        if ($request->id_proveedor) $q->where('c.id_proveedor', (int) $request->id_proveedor);
        if ($request->estado) $q->where('c.estado', $request->estado);
        if ($request->forma_pago) $q->where('c.forma_pago', $request->forma_pago);
        if ($request->buscar) {
            $t = '%' . trim($request->buscar) . '%';
            $q->where(fn($w) => $w->where('c.factura_proveedor', 'LIKE', $t)->orWhere('p.nombre', 'LIKE', $t)
                ->orWhere('p.nit', 'LIKE', $t)->orWhere('c.numero', 'LIKE', $t));
        }
        $compras = $q->orderByDesc('c.fecha')->orderByDesc('c.id_compra')->limit(1000)->get();

        $recibidas = $compras->where('estado', 'recibida');
        $hoy = Carbon::today()->toDateString();
        $porPagar = DB::table('pc_compras')->where('estado', 'recibida')->where('saldo', '>', 0);
        $stats = [
            'cantidad' => $recibidas->count(),
            'total' => round($recibidas->sum('total'), 2),
            'iva' => round($recibidas->sum('iva'), 2),
            'contado' => round($recibidas->where('forma_pago', 'contado')->sum('total'), 2),
            'credito' => round($recibidas->where('forma_pago', 'credito')->sum('total'), 2),
            'por_pagar' => round((float) (clone $porPagar)->sum('saldo'), 2),
            'vencido' => round((float) (clone $porPagar)->where('fecha_vencimiento', '<', $hoy)->sum('saldo'), 2),
        ];

        return response()->json(['error' => false, 'compras' => $compras, 'stats' => $stats]);
    }

    public function show(Request $request, $id)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $compra = DB::table('pc_compras as c')
            ->join('pc_proveedores as p', 'p.id_proveedor', '=', 'c.id_proveedor')
            ->leftJoin('pc_usuarios as u', 'u.id_usuario', '=', 'c.id_usuario')
            ->leftJoin('pc_usuarios as ua', 'ua.id_usuario', '=', 'c.id_usuario_anula')
            ->where('c.id_compra', $id)
            ->select('c.*', 'p.nombre as proveedor', 'p.nit as proveedor_nit', 'p.telefono as proveedor_telefono',
                'p.direccion as proveedor_direccion', 'u.nombre as usuario', 'ua.nombre as usuario_anula')
            ->first();
        if (!$compra) return response()->json(['error' => true, 'mensaje' => 'Compra no encontrada'], 404);

        $compra->detalles = DB::table('pc_compra_detalle as d')
            ->leftJoin('pc_productos as pr', 'pr.id_producto', '=', 'd.id_producto')
            ->where('d.id_compra', $id)
            ->select('d.*', 'pr.foto', 'pr.stock as stock_actual', 'pr.precio as precio_actual')
            ->orderBy('d.id_detalle')->get();
        $compra->pagos = DB::table('pc_pagos_proveedor as g')
            ->leftJoin('pc_usuarios as u', 'u.id_usuario', '=', 'g.id_usuario')
            ->where('g.id_compra', $id)->select('g.*', 'u.nombre as usuario')
            ->orderBy('g.id_pago')->get();
        $compra->tiene_abonos = $compra->pagos->where('estado', 'valido')->where('automatico', 0)->count() > 0;

        return response()->json(['error' => false, 'compra' => $compra]);
    }

    public function store(Request $request)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        return $this->guardar($request, null);
    }

    public function update(Request $request, $id)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        return $this->guardar($request, (int) $id);
    }

    private function guardar(Request $request, ?int $id)
    {
        $this->validate($request, [
            'id_proveedor' => 'required|integer',
            'factura_proveedor' => 'required|string|max:50',
            'fecha' => 'required|date',
            'forma_pago' => 'required|in:contado,credito',
            'dias_credito' => 'nullable|integer|min:0|max:365',
            'medio_pago' => 'nullable|in:' . implode(',', self::MEDIOS),
            'iva_incluido' => 'nullable|boolean',
            'descuento' => 'nullable|numeric|min:0',
            'flete' => 'nullable|numeric|min:0',
            'retencion' => 'nullable|numeric|min:0',
            'notas' => 'nullable|string|max:500',
            'items' => 'required|array|min:1',
            'items.*.id_producto' => 'required|integer',
            'items.*.tipo_unidad' => 'nullable|in:unidad,caja',
            'items.*.cantidad' => 'required|integer|min:1|max:1000000',
            'items.*.costo' => 'required|numeric|min:0',
            'items.*.iva_porcentaje' => 'required|numeric|in:0,5,19',
            'items.*.precio_venta' => 'nullable|numeric|min:0',
        ]);

        $prov = DB::table('pc_proveedores')->where('id_proveedor', $request->id_proveedor)->where('activo', 1)->first();
        if (!$prov) return response()->json(['error' => true, 'mensaje' => 'Proveedor no encontrado'], 422);

        $factura = trim($request->factura_proveedor);
        $dup = DB::table('pc_compras')->where('id_proveedor', $prov->id_proveedor)->where('factura_proveedor', $factura)
            ->where('estado', 'recibida')->when($id, fn($q) => $q->where('id_compra', '!=', $id))->value('numero');
        if ($dup) return response()->json(['error' => true, 'mensaje' => "La factura {$factura} de {$prov->nombre} ya está registrada en la compra #{$dup}"], 422);

        $productos = DB::table('pc_productos')->whereIn('id_producto', collect($request->items)->pluck('id_producto'))->get()->keyBy('id_producto');
        $calc = $this->calcular($request->items, $productos, (bool) $request->iva_incluido,
            (float) $request->descuento, (float) $request->flete, (float) $request->retencion);
        if (is_string($calc)) return response()->json(['error' => true, 'mensaje' => $calc], 422);

        $contado = $request->forma_pago === 'contado';
        $dias = $contado ? 0 : (int) ($request->dias_credito ?? 30);
        $fecha = Carbon::parse($request->fecha)->toDateString();
        $uid = $request->usuario->id_usuario;

        $res = DB::transaction(function () use ($id, $request, $prov, $factura, $calc, $contado, $dias, $fecha, $uid) {
            $ahora = Carbon::now();
            if ($id) {
                $actual = DB::table('pc_compras')->where('id_compra', $id)->lockForUpdate()->first();
                if (!$actual) return [404, 'Compra no encontrada'];
                if ($actual->estado !== 'recibida') return [409, 'La compra está anulada y no se puede editar'];
                if ($this->tieneAbonos($id)) return [409, 'La compra ya tiene abonos registrados: anula primero los pagos para poder editarla'];
                $this->revertirInventario($id);
                DB::table('pc_compra_detalle')->where('id_compra', $id)->delete();
                $this->anularPagosAutomaticos($id, $uid, 'Compra editada');
                $numero = $actual->numero;
            } else {
                $numero = (int) DB::table('pc_compras')->lockForUpdate()->max('numero') + 1;
            }

            $cab = [
                'id_proveedor' => $prov->id_proveedor,
                'factura_proveedor' => $factura,
                'fecha' => $fecha,
                'forma_pago' => $contado ? 'contado' : 'credito',
                'dias_credito' => $dias,
                'fecha_vencimiento' => $contado ? null : Carbon::parse($fecha)->addDays($dias)->toDateString(),
                'medio_pago' => $contado ? ($request->medio_pago ?: 'efectivo') : null,
                'iva_incluido' => $request->iva_incluido ? 1 : 0,
                'subtotal' => $calc['subtotal'],
                'descuento' => $calc['descuento'],
                'iva' => $calc['iva'],
                'flete' => $calc['flete'],
                'total' => $calc['total'],
                'retencion' => $calc['retencion'],
                'neto_pagar' => $calc['neto_pagar'],
                'saldo' => $contado ? 0 : $calc['neto_pagar'],
                'notas' => $request->notas,
                'updated_at' => $ahora,
            ];
            if ($id) {
                DB::table('pc_compras')->where('id_compra', $id)->update($cab);
            } else {
                $id = DB::table('pc_compras')->insertGetId($cab + ['numero' => $numero, 'estado' => 'recibida', 'id_usuario' => $uid, 'created_at' => $ahora]);
            }

            $this->aplicarInventario($id, $calc['lineas'], $prov->id_proveedor);

            if ($contado && $calc['neto_pagar'] > 0) {
                DB::table('pc_pagos_proveedor')->insert([
                    'comprobante' => $this->siguienteComprobante(), 'id_proveedor' => $prov->id_proveedor, 'id_compra' => $id,
                    'fecha' => $fecha, 'valor' => $calc['neto_pagar'], 'descuento' => 0, 'medio_pago' => $request->medio_pago ?: 'efectivo',
                    'notas' => "Pago de contado compra #{$numero}", 'automatico' => 1, 'estado' => 'valido', 'id_usuario' => $uid, 'created_at' => $ahora,
                ]);
            }
            return [200, $id, $numero];
        });

        if ($res[0] !== 200) return response()->json(['error' => true, 'mensaje' => $res[1]], $res[0]);
        $unidades = array_sum(array_column($calc['lineas'], 'unidades'));
        return response()->json([
            'error' => false,
            'mensaje' => ($id ? "Compra #{$res[2]} actualizada" : "Compra #{$res[2]} registrada") . " · {$unidades} unidades al inventario",
            'id_compra' => $res[1], 'numero' => $res[2],
        ], $id ? 200 : 201);
    }

    public function anular(Request $request, $id)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $this->validate($request, ['motivo' => 'required|string|min:3|max:300']);
        $uid = $request->usuario->id_usuario;

        $res = DB::transaction(function () use ($id, $request, $uid) {
            $c = DB::table('pc_compras')->where('id_compra', $id)->lockForUpdate()->first();
            if (!$c) return [404, 'Compra no encontrada'];
            if ($c->estado === 'anulada') return [409, 'La compra ya está anulada'];
            if ($this->tieneAbonos($id)) return [409, 'La compra tiene abonos registrados: anula primero esos pagos'];
            $unidades = $this->revertirInventario($id);
            $this->anularPagosAutomaticos($id, $uid, 'Compra anulada');
            DB::table('pc_compras')->where('id_compra', $id)->update([
                'estado' => 'anulada', 'saldo' => 0, 'motivo_anulacion' => trim($request->motivo),
                'id_usuario_anula' => $uid, 'anulada_at' => Carbon::now(), 'updated_at' => Carbon::now(),
            ]);
            return [200, "Compra #{$c->numero} anulada · {$unidades} unidades descontadas del inventario"];
        });
        return response()->json(['error' => $res[0] !== 200, 'mensaje' => $res[1]], $res[0]);
    }

    // ==================================================================
    // CUENTAS POR PAGAR
    // ==================================================================

    /** Saldo por proveedor (solo compras a crédito recibidas con saldo) */
    public function cuentasPagar(Request $request)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $hoy = Carbon::today()->toDateString();
        $prov = DB::table('pc_compras as c')
            ->join('pc_proveedores as p', 'p.id_proveedor', '=', 'c.id_proveedor')
            ->where('c.estado', 'recibida')->where('c.saldo', '>', 0)
            ->groupBy('c.id_proveedor', 'p.nombre', 'p.nit', 'p.telefono')
            ->select('c.id_proveedor', 'p.nombre', 'p.nit', 'p.telefono',
                DB::raw('COUNT(*) as facturas'), DB::raw('SUM(c.saldo) as saldo'),
                DB::raw("SUM(CASE WHEN c.fecha_vencimiento < '{$hoy}' THEN c.saldo ELSE 0 END) as vencido"),
                DB::raw('MIN(c.fecha_vencimiento) as proximo_vencimiento'))
            ->orderByDesc('saldo')->get();

        $mesIni = Carbon::now()->startOfMonth()->toDateString();
        $pagadoMes = (float) DB::table('pc_pagos_proveedor')->where('estado', 'valido')->where('fecha', '>=', $mesIni)->sum('valor');

        return response()->json(['error' => false, 'proveedores' => $prov, 'stats' => [
            'saldo' => round($prov->sum('saldo'), 2),
            'vencido' => round($prov->sum('vencido'), 2),
            'proveedores' => $prov->count(),
            'pagado_mes' => round($pagadoMes, 2),
        ]]);
    }

    /** Estado de cuenta de un proveedor: compras con saldo y últimos pagos */
    public function estadoCuenta(Request $request, $idProveedor)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $prov = DB::table('pc_proveedores')->where('id_proveedor', $idProveedor)->first();
        if (!$prov) return response()->json(['error' => true, 'mensaje' => 'Proveedor no encontrado'], 404);

        $pendientes = DB::table('pc_compras')->where('id_proveedor', $idProveedor)
            ->where('estado', 'recibida')->where('saldo', '>', 0)
            ->orderBy('fecha_vencimiento')->orderBy('fecha')
            ->get(['id_compra', 'numero', 'factura_proveedor', 'fecha', 'fecha_vencimiento', 'dias_credito', 'total', 'neto_pagar', 'saldo']);
        $pagos = $this->consultaPagos()->where('g.id_proveedor', $idProveedor)->limit(100)->get();

        return response()->json(['error' => false, 'proveedor' => $prov, 'pendientes' => $pendientes, 'pagos' => $pagos]);
    }

    /** Registra un comprobante de pago que puede abonar a varias compras del mismo proveedor */
    public function registrarPago(Request $request)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $this->validate($request, [
            'id_proveedor' => 'required|integer',
            'fecha' => 'required|date',
            'medio_pago' => 'required|in:' . implode(',', self::MEDIOS),
            'referencia' => 'nullable|string|max:80',
            'notas' => 'nullable|string|max:300',
            'pagos' => 'required|array|min:1',
            'pagos.*.id_compra' => 'required|integer',
            'pagos.*.valor' => 'required|numeric|min:0',
            'pagos.*.descuento' => 'nullable|numeric|min:0',
        ]);
        $uid = $request->usuario->id_usuario;

        $res = DB::transaction(function () use ($request, $uid) {
            $comprobante = $this->siguienteComprobante();
            $total = 0;
            foreach ($request->pagos as $p) {
                $valor = round((float) $p['valor'], 2);
                $desc = round((float) ($p['descuento'] ?? 0), 2);
                if ($valor + $desc <= 0) continue;
                $c = DB::table('pc_compras')->where('id_compra', $p['id_compra'])->lockForUpdate()->first();
                if (!$c || $c->id_proveedor != $request->id_proveedor) return [422, 'Una de las compras no pertenece al proveedor'];
                if ($c->estado !== 'recibida') return [409, "La compra #{$c->numero} está anulada"];
                if ($valor + $desc > (float) $c->saldo + 0.5) {
                    return [422, "El pago a la factura {$c->factura_proveedor} ($" . number_format($valor + $desc, 0, ',', '.') . ") supera su saldo ($" . number_format($c->saldo, 0, ',', '.') . ')'];
                }
                DB::table('pc_pagos_proveedor')->insert([
                    'comprobante' => $comprobante, 'id_proveedor' => $c->id_proveedor, 'id_compra' => $c->id_compra,
                    'fecha' => Carbon::parse($request->fecha)->toDateString(), 'valor' => $valor, 'descuento' => $desc,
                    'medio_pago' => $request->medio_pago, 'referencia' => $request->referencia, 'notas' => $request->notas,
                    'automatico' => 0, 'estado' => 'valido', 'id_usuario' => $uid, 'created_at' => Carbon::now(),
                ]);
                DB::table('pc_compras')->where('id_compra', $c->id_compra)->update([
                    'saldo' => max(0, round((float) $c->saldo - $valor - $desc, 2)), 'updated_at' => Carbon::now(),
                ]);
                $total += $valor;
            }
            if ($total <= 0) return [422, 'Indica el valor a pagar de al menos una factura'];
            return [200, $comprobante, $total];
        });

        if ($res[0] !== 200) return response()->json(['error' => true, 'mensaje' => $res[1]], $res[0]);
        return response()->json(['error' => false, 'comprobante' => $res[1],
            'mensaje' => "Comprobante de egreso #{$res[1]} registrado por $" . number_format($res[2], 0, ',', '.')]);
    }

    /** Anula un comprobante completo y devuelve el saldo a las compras */
    public function anularPago(Request $request, $comprobante)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $this->validate($request, ['motivo' => 'required|string|min:3|max:300']);
        $uid = $request->usuario->id_usuario;

        $res = DB::transaction(function () use ($comprobante, $request, $uid) {
            $filas = DB::table('pc_pagos_proveedor')->where('comprobante', $comprobante)->where('estado', 'valido')->lockForUpdate()->get();
            if ($filas->isEmpty()) return [404, 'Comprobante no encontrado o ya anulado'];
            if ($filas->where('automatico', 1)->count()) return [409, 'Es el pago de una compra de contado: para reversarlo anula o edita la compra'];
            foreach ($filas as $f) {
                DB::table('pc_compras')->where('id_compra', $f->id_compra)->where('estado', 'recibida')
                    ->update(['saldo' => DB::raw('LEAST(neto_pagar, saldo + ' . ((float) $f->valor + (float) $f->descuento) . ')'), 'updated_at' => Carbon::now()]);
            }
            DB::table('pc_pagos_proveedor')->where('comprobante', $comprobante)->where('estado', 'valido')->update([
                'estado' => 'anulado', 'motivo_anulacion' => trim($request->motivo), 'id_usuario_anula' => $uid, 'anulado_at' => Carbon::now(),
            ]);
            return [200, "Comprobante #{$comprobante} anulado: el saldo volvió a las facturas"];
        });
        return response()->json(['error' => $res[0] !== 200, 'mensaje' => $res[1]], $res[0]);
    }

    /** Pagos a proveedores (para listados e impresión de comprobantes) */
    public function pagos(Request $request)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $q = $this->consultaPagos();
        if ($request->comprobante) $q->where('g.comprobante', (int) $request->comprobante);
        if ($request->desde) $q->where('g.fecha', '>=', $request->desde);
        if ($request->hasta) $q->where('g.fecha', '<=', $request->hasta);
        return response()->json(['error' => false, 'pagos' => $q->limit(1000)->get()]);
    }

    // ==================================================================
    // HELPERS
    // ==================================================================

    /** Totales y costos por línea. Devuelve string si hay un error de datos. */
    private function calcular(array $items, $productos, bool $ivaIncluido, float $descuento, float $flete, float $retencion)
    {
        $lineas = [];
        $subtotal = 0;
        foreach ($items as $it) {
            $prod = $productos[$it['id_producto']] ?? null;
            if (!$prod) return 'Uno de los productos no existe';
            $caja = ($it['tipo_unidad'] ?? 'unidad') === 'caja';
            $upc = $caja ? max(1, (int) $prod->unidades_por_caja) : 1;
            $cant = (int) $it['cantidad'];
            $pct = (float) $it['iva_porcentaje'];
            $costo = (float) $it['costo'];
            $costoSin = $ivaIncluido && $pct > 0 ? $costo / (1 + $pct / 100) : $costo;
            $base = $cant * $costoSin;
            $subtotal += $base;
            $lineas[] = [
                'prod' => $prod, 'tipo_unidad' => $caja ? 'caja' : 'unidad', 'upc' => $upc, 'cantidad' => $cant,
                'unidades' => $cant * $upc, 'costo' => $costo, 'costo_sin_iva' => $costoSin, 'pct' => $pct,
                'base' => $base, 'iva_bruto' => $base * $pct / 100,
                'precio_venta' => isset($it['precio_venta']) && $it['precio_venta'] !== '' && $it['precio_venta'] !== null ? (float) $it['precio_venta'] : null,
            ];
        }
        $descuento = round($descuento, 2);
        if ($descuento > $subtotal + 0.01) return 'El descuento no puede ser mayor que el subtotal';
        $factor = $subtotal > 0 ? $descuento / $subtotal : 0;

        // Valor de cada línea ya con descuento e IVA: base para prorratear el flete
        $valorTotal = 0;
        foreach ($lineas as &$l) {
            $l['base_neta'] = $l['base'] * (1 - $factor);
            $l['iva'] = $l['iva_bruto'] * (1 - $factor);
            $valorTotal += $l['base_neta'] + $l['iva'];
        }
        unset($l);

        $iva = 0;
        foreach ($lineas as &$l) {
            $l['flete'] = $valorTotal > 0 ? $flete * ($l['base_neta'] + $l['iva']) / $valorTotal : $flete / max(1, count($lineas));
            $l['total'] = $l['base_neta'] + $l['iva'] + $l['flete'];
            $l['costo_unitario_final'] = $l['unidades'] > 0 ? $l['total'] / $l['unidades'] : 0;
            $iva += $l['iva'];
        }
        unset($l);

        $subtotal = round($subtotal, 2);
        $iva = round($iva, 2);
        $flete = round($flete, 2);
        $total = round($subtotal - $descuento + $iva + $flete, 2);
        $retencion = round($retencion, 2);
        if ($retencion > $total) return 'La retención no puede ser mayor que el total';

        return compact('lineas', 'subtotal', 'descuento', 'iva', 'flete', 'total', 'retencion') + ['neto_pagar' => round($total - $retencion, 2)];
    }

    private function aplicarInventario(int $idCompra, array $lineas, int $idProveedor): void
    {
        foreach ($lineas as $l) {
            $p = DB::table('pc_productos')->where('id_producto', $l['prod']->id_producto)->lockForUpdate()->first();
            DB::table('pc_compra_detalle')->insert([
                'id_compra' => $idCompra, 'id_producto' => $p->id_producto, 'codigo' => $p->codigo, 'descripcion' => $p->nombre,
                'tipo_unidad' => $l['tipo_unidad'], 'unidades_por_caja' => $l['upc'], 'cantidad' => $l['cantidad'], 'unidades' => $l['unidades'],
                'costo' => round($l['costo'], 2), 'costo_sin_iva' => round($l['costo_sin_iva'], 4), 'iva_porcentaje' => $l['pct'],
                'subtotal' => round($l['base'], 2), 'iva' => round($l['iva'], 2), 'flete' => round($l['flete'], 2), 'total' => round($l['total'], 2),
                'costo_unitario_final' => round($l['costo_unitario_final'], 4),
                'costo_anterior' => $p->precio_costo, 'precio_venta_anterior' => $p->precio,
                'precio_venta_nuevo' => $l['precio_venta'] !== null && $l['precio_venta'] > 0 ? round($l['precio_venta'], 2) : null,
            ]);
            $upd = [
                'stock' => DB::raw('stock + ' . (int) $l['unidades']),
                'precio_costo' => round($l['costo_unitario_final'], 2),
                'updated_at' => Carbon::now(),
            ];
            if ($l['precio_venta'] !== null && $l['precio_venta'] > 0) $upd['precio'] = round($l['precio_venta'], 2);
            if (!$p->id_proveedor) $upd['id_proveedor'] = $idProveedor; // va armando "productos por proveedor"
            DB::table('pc_productos')->where('id_producto', $p->id_producto)->update($upd);
        }
    }

    /** Descuenta del stock lo que entró con la compra y deshace los costos/precios que esta compra dejó. */
    private function revertirInventario(int $idCompra): int
    {
        $total = 0;
        foreach (DB::table('pc_compra_detalle')->where('id_compra', $idCompra)->orderByDesc('id_detalle')->get() as $d) {
            $p = DB::table('pc_productos')->where('id_producto', $d->id_producto)->lockForUpdate()->first();
            if (!$p) continue;
            $upd = ['stock' => DB::raw('stock - ' . (int) $d->unidades), 'updated_at' => Carbon::now()];
            // Solo se restaura si nadie cambió el costo/precio después de esta compra
            if (abs((float) $p->precio_costo - round((float) $d->costo_unitario_final, 2)) < 0.01) $upd['precio_costo'] = $d->costo_anterior;
            if ($d->precio_venta_nuevo !== null && abs((float) $p->precio - (float) $d->precio_venta_nuevo) < 0.01) $upd['precio'] = $d->precio_venta_anterior;
            DB::table('pc_productos')->where('id_producto', $d->id_producto)->update($upd);
            $total += (int) $d->unidades;
        }
        return $total;
    }

    private function tieneAbonos(int $idCompra): bool
    {
        return DB::table('pc_pagos_proveedor')->where('id_compra', $idCompra)->where('estado', 'valido')->where('automatico', 0)->exists();
    }

    private function anularPagosAutomaticos(int $idCompra, int $uid, string $motivo): void
    {
        DB::table('pc_pagos_proveedor')->where('id_compra', $idCompra)->where('automatico', 1)->where('estado', 'valido')
            ->update(['estado' => 'anulado', 'motivo_anulacion' => $motivo, 'id_usuario_anula' => $uid, 'anulado_at' => Carbon::now()]);
    }

    private function siguienteComprobante(): int
    {
        return (int) DB::table('pc_pagos_proveedor')->lockForUpdate()->max('comprobante') + 1;
    }

    private function consultaPagos()
    {
        return DB::table('pc_pagos_proveedor as g')
            ->join('pc_compras as c', 'c.id_compra', '=', 'g.id_compra')
            ->join('pc_proveedores as p', 'p.id_proveedor', '=', 'g.id_proveedor')
            ->leftJoin('pc_usuarios as u', 'u.id_usuario', '=', 'g.id_usuario')
            ->select('g.*', 'c.numero as compra_numero', 'c.factura_proveedor', 'c.saldo as compra_saldo',
                'p.nombre as proveedor', 'p.nit as proveedor_nit', 'u.nombre as usuario')
            ->orderByDesc('g.comprobante')->orderBy('g.id_pago');
    }
}
