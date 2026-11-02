<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Carbon\Carbon;

/**
 * Informes imprimibles (solo admin). Cada método devuelve los datos de un informe; el armado,
 * la impresión y el Excel se hacen en js/informes.js.
 * Ventas = pedidos de venta (tipo 'pedido') no cancelados. Los saldos anteriores solo cuentan en cartera.
 */
class InformeController extends Controller
{
    private function soloAdmin(Request $request)
    {
        if ($request->usuario->rol !== 'admin') {
            return response()->json(['error' => true, 'mensaje' => 'Solo el administrador puede ver los informes'], 403);
        }
        return null;
    }

    private function hoy(): string
    {
        return Carbon::now('America/Bogota')->toDateString();
    }

    /** Rango [desde, hasta] validado; por defecto el mes en curso */
    private function rango(Request $request): array
    {
        $hoy = Carbon::parse($this->hoy());
        $desde = $request->desde && strtotime($request->desde) ? Carbon::parse($request->desde) : $hoy->copy()->startOfMonth();
        $hasta = $request->hasta && strtotime($request->hasta) ? Carbon::parse($request->hasta) : $hoy->copy();
        if ($hasta->lt($desde)) [$desde, $hasta] = [$hasta, $desde];
        return [$desde->startOfDay(), $hasta->endOfDay()];
    }

    /** Pedidos de venta del rango con los filtros comunes */
    private function pedidosVenta(Request $request, Carbon $desde, Carbon $hasta)
    {
        return DB::table('pc_pedidos as p')
            ->where('p.tipo', 'pedido')
            ->where('p.estado', '!=', 'cancelado')
            ->whereBetween('p.fecha_pedido', [$desde, $hasta])
            ->when($request->id_vendedor, fn($q) => $q->where('p.id_vendedor', (int) $request->id_vendedor))
            ->when($request->id_ruta, fn($q) => $q->where('p.id_ruta', (int) $request->id_ruta))
            ->when($request->forma_pago, fn($q) => $q->where('p.forma_pago', $request->forma_pago));
    }

    private function cartera()
    {
        // Saldo por documento a crédito (pedidos y saldos anteriores)
        return DB::table('pc_pedidos as p')
            ->leftJoinSub(
                DB::table('pc_pagos')->where('anulado', 0)->groupBy('id_pedido')
                    ->select('id_pedido', DB::raw('SUM(valor) as pagado'), DB::raw('MAX(fecha) as ultimo_pago')),
                'pg', 'pg.id_pedido', '=', 'p.id_pedido'
            )
            ->where('p.forma_pago', 'credito')
            ->where('p.estado', '!=', 'cancelado');
    }

    // =====================================================================
    // VENTAS POR PERÍODO (sirve también para "por cliente" y "por producto")
    // =====================================================================
    public function ventas(Request $request)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        [$desde, $hasta] = $this->rango($request);
        $base = $this->pedidosVenta($request, $desde, $hasta);

        $k = (clone $base)->selectRaw("COUNT(*) as pedidos, COALESCE(SUM(p.total),0) as total, COALESCE(SUM(p.descuento),0) as descuento,
                COALESCE(SUM(CASE WHEN p.forma_pago='credito' THEN p.total ELSE 0 END),0) as credito,
                COUNT(DISTINCT p.id_cliente) as clientes")->first();

        // Mismo número de días inmediatamente antes, para comparar
        $dias = $desde->diffInDays($hasta) + 1;
        $antDesde = $desde->copy()->subDays($dias);
        $antHasta = $desde->copy()->subSecond();
        $anterior = (float) $this->pedidosVenta($request, $antDesde, $antHasta)->sum('p.total');

        $porDia = (clone $base)->groupBy(DB::raw('DATE(p.fecha_pedido)'))
            ->selectRaw('DATE(p.fecha_pedido) as fecha, COUNT(*) as pedidos, SUM(p.total) as total')->orderBy('fecha')->get();

        $porVendedor = (clone $base)->leftJoin('pc_usuarios as u', 'u.id_usuario', '=', 'p.id_vendedor')
            ->groupBy('p.id_vendedor', 'u.nombre')
            ->selectRaw("COALESCE(u.nombre,'Sin vendedor') as nombre, COUNT(*) as pedidos, SUM(p.total) as total, COUNT(DISTINCT p.id_cliente) as clientes")
            ->orderByDesc('total')->get();

        $porRuta = (clone $base)->leftJoin('pc_rutas as r', 'r.id_ruta', '=', 'p.id_ruta')
            ->groupBy('p.id_ruta', 'r.nombre')
            ->selectRaw("COALESCE(r.nombre,'Sin ruta') as nombre, COUNT(*) as pedidos, SUM(p.total) as total, COUNT(DISTINCT p.id_cliente) as clientes")
            ->orderByDesc('total')->get();

        $porCliente = (clone $base)->leftJoin('pc_clientes as c', 'c.id_cliente', '=', 'p.id_cliente')
            ->leftJoin('pc_rutas as r', 'r.id_ruta', '=', 'c.id_ruta')
            ->groupBy('p.id_cliente', 'c.nombre', 'c.razon_social', 'c.nit_cedula', 'c.telefono', 'r.nombre')
            ->selectRaw("p.id_cliente, c.nombre, c.razon_social, c.nit_cedula, c.telefono, r.nombre as ruta, COUNT(*) as pedidos,
                SUM(p.total) as total, MAX(p.fecha_pedido) as ultima,
                SUM(CASE WHEN p.forma_pago='credito' THEN p.total ELSE 0 END) as credito")
            ->orderByDesc('total')->get();

        $qProd = DB::table('pc_pedido_detalle as d')
            ->joinSub((clone $base)->select('p.id_pedido'), 'pv', 'pv.id_pedido', '=', 'd.id_pedido')
            ->leftJoin('pc_productos as pr', 'pr.id_producto', '=', 'd.id_producto')
            ->leftJoin('pc_categorias as ca', 'ca.id_categoria', '=', 'pr.id_categoria')
            ->groupBy('d.id_producto', 'pr.nombre', 'pr.codigo', 'ca.nombre')
            ->selectRaw("d.id_producto, pr.nombre, pr.codigo, COALESCE(ca.nombre,'Sin categoría') as categoria,
                SUM(COALESCE(d.unidades_equivalentes, d.cantidad)) as unidades, SUM(d.subtotal) as total, COUNT(DISTINCT d.id_pedido) as pedidos");
        if (Schema::hasTable('pc_proveedores')) {
            $qProd->leftJoin('pc_proveedores as pv2', 'pv2.id_proveedor', '=', 'pr.id_proveedor')
                ->groupBy('pv2.nombre')->addSelect(DB::raw("COALESCE(pv2.nombre,'Sin proveedor asignado') as proveedor"));
        }
        $porProducto = $qProd->orderByDesc('total')->get();

        // Clientes activos sin compras en el período (para seguimiento)
        $sinCompras = [];
        if ($request->boolean('sin_compras')) {
            $sinCompras = DB::table('pc_clientes as c')
                ->leftJoin('pc_rutas as r', 'r.id_ruta', '=', 'c.id_ruta')
                ->where('c.activo', 1)
                ->when($request->id_vendedor, fn($q) => $q->where('c.id_vendedor', (int) $request->id_vendedor))
                ->when($request->id_ruta, fn($q) => $q->where('c.id_ruta', (int) $request->id_ruta))
                ->whereNotIn('c.id_cliente', (clone $base)->select('p.id_cliente'))
                ->select('c.id_cliente', 'c.nombre', 'c.razon_social', 'c.telefono', 'r.nombre as ruta',
                    DB::raw("(SELECT MAX(x.fecha_pedido) FROM pc_pedidos x WHERE x.id_cliente = c.id_cliente AND x.tipo = 'pedido' AND x.estado != 'cancelado') as ultima"))
                ->orderBy('c.nombre')->get();
        }

        return response()->json([
            'error' => false,
            'periodo' => ['desde' => $desde->toDateString(), 'hasta' => $hasta->toDateString(), 'dias' => $dias],
            'kpis' => [
                'pedidos' => (int) $k->pedidos, 'total' => (float) $k->total, 'descuento' => (float) $k->descuento,
                'credito' => (float) $k->credito, 'contado' => (float) $k->total - (float) $k->credito,
                'clientes' => (int) $k->clientes, 'ticket' => $k->pedidos ? (float) $k->total / $k->pedidos : 0,
                'anterior' => $anterior,
                'anterior_desde' => $antDesde->toDateString(), 'anterior_hasta' => $antHasta->toDateString(),
            ],
            'por_dia' => $porDia,
            'por_vendedor' => $porVendedor,
            'por_ruta' => $porRuta,
            'por_cliente' => $porCliente,
            'por_producto' => $porProducto,
            'sin_compras' => $sinCompras,
        ]);
    }

    // =====================================================================
    // COMPARATIVO ANUAL (mes a mes)
    // =====================================================================
    public function comparativo(Request $request)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $actual = (int) Carbon::now('America/Bogota')->year;
        $anios = collect(explode(',', (string) $request->input('anios', ($actual - 1) . ',' . $actual)))
            ->map(fn($a) => (int) $a)->filter(fn($a) => $a >= 2000 && $a <= 2100)->unique()->sort()->take(4)->values();
        if ($anios->isEmpty()) $anios = collect([$actual]);

        $filas = DB::table('pc_pedidos as p')
            ->where('p.tipo', 'pedido')->where('p.estado', '!=', 'cancelado')
            ->whereIn(DB::raw('YEAR(p.fecha_pedido)'), $anios->all())
            ->when($request->id_vendedor, fn($q) => $q->where('p.id_vendedor', (int) $request->id_vendedor))
            ->when($request->id_ruta, fn($q) => $q->where('p.id_ruta', (int) $request->id_ruta))
            ->groupBy(DB::raw('YEAR(p.fecha_pedido)'), DB::raw('MONTH(p.fecha_pedido)'))
            ->selectRaw('YEAR(p.fecha_pedido) as anio, MONTH(p.fecha_pedido) as mes, COUNT(*) as pedidos, SUM(p.total) as total, COUNT(DISTINCT p.id_cliente) as clientes')
            ->get();

        $primero = DB::table('pc_pedidos')->where('tipo', 'pedido')->min('fecha_pedido');
        return response()->json([
            'error' => false,
            'anios' => $anios,
            'datos' => $filas,
            'anios_disponibles' => range($primero ? (int) substr($primero, 0, 4) : $actual, $actual),
            'hoy' => $this->hoy(),
        ]);
    }

    // =====================================================================
    // CARTERA POR EDADES (al día de hoy)
    // =====================================================================
    public function carteraEdades(Request $request)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $hoy = $this->hoy();
        $docs = $this->cartera()
            ->leftJoin('pc_clientes as c', 'c.id_cliente', '=', 'p.id_cliente')
            ->leftJoin('pc_rutas as r', 'r.id_ruta', '=', 'p.id_ruta')
            ->leftJoin('pc_usuarios as u', 'u.id_usuario', '=', 'p.id_vendedor')
            ->whereRaw('p.total - COALESCE(pg.pagado, 0) > 0.009')
            ->when($request->id_vendedor, fn($q) => $q->where('p.id_vendedor', (int) $request->id_vendedor))
            ->when($request->id_ruta, fn($q) => $q->where('p.id_ruta', (int) $request->id_ruta))
            ->select('p.id_pedido', 'p.numero_pedido', 'p.tipo', 'p.documento_ref', 'p.fecha_pedido', 'p.dias_credito', 'p.total',
                'p.id_cliente', 'c.nombre as cliente_nombre', 'c.razon_social as cliente_razon', 'c.telefono as cliente_telefono',
                'r.nombre as ruta', 'u.nombre as vendedor', 'pg.ultimo_pago',
                DB::raw('COALESCE(pg.pagado, 0) as pagado'),
                DB::raw('ROUND(p.total - COALESCE(pg.pagado, 0), 2) as saldo'),
                DB::raw('DATE_ADD(DATE(p.fecha_pedido), INTERVAL p.dias_credito DAY) as vence'),
                DB::raw("DATEDIFF('{$hoy}', DATE_ADD(DATE(p.fecha_pedido), INTERVAL p.dias_credito DAY)) as dias_vencido"))
            ->orderBy('c.nombre')->orderBy('p.fecha_pedido')->get();

        return response()->json(['error' => false, 'corte' => $hoy, 'documentos' => $docs]);
    }

    // =====================================================================
    // ESTADO DE CUENTA DE UN CLIENTE
    // =====================================================================
    public function estadoCuenta(Request $request, $idCliente)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $hoy = $this->hoy();
        $cliente = DB::table('pc_clientes as c')->leftJoin('pc_rutas as r', 'r.id_ruta', '=', 'c.id_ruta')
            ->leftJoin('pc_usuarios as u', 'u.id_usuario', '=', 'c.id_vendedor')
            ->where('c.id_cliente', $idCliente)
            ->select('c.*', 'r.nombre as ruta', 'u.nombre as vendedor')->first();
        if (!$cliente) return response()->json(['error' => true, 'mensaje' => 'Cliente no encontrado'], 404);

        $docs = $this->cartera()->where('p.id_cliente', $idCliente)
            ->when(!$request->boolean('todos'), fn($q) => $q->whereRaw('p.total - COALESCE(pg.pagado, 0) > 0.009'))
            ->select('p.id_pedido', 'p.numero_pedido', 'p.tipo', 'p.documento_ref', 'p.fecha_pedido', 'p.dias_credito', 'p.total',
                DB::raw('COALESCE(pg.pagado, 0) as pagado'), DB::raw('ROUND(p.total - COALESCE(pg.pagado, 0), 2) as saldo'),
                DB::raw('DATE_ADD(DATE(p.fecha_pedido), INTERVAL p.dias_credito DAY) as vence'),
                DB::raw("DATEDIFF('{$hoy}', DATE_ADD(DATE(p.fecha_pedido), INTERVAL p.dias_credito DAY)) as dias_vencido"))
            ->orderBy('p.fecha_pedido')->get();

        $pagos = DB::table('pc_pagos as pa')->join('pc_pedidos as p', 'p.id_pedido', '=', 'pa.id_pedido')
            ->leftJoin('pc_usuarios as u', 'u.id_usuario', '=', 'pa.id_usuario')
            ->where('p.id_cliente', $idCliente)->where('pa.anulado', 0)
            ->whereIn('pa.id_pedido', $docs->pluck('id_pedido'))
            ->select('pa.id_pago', 'pa.id_pedido', 'pa.fecha', 'pa.valor', 'pa.medio_pago', 'pa.referencia', 'p.numero_pedido', 'p.tipo', 'p.documento_ref', 'u.nombre as recibio')
            ->orderBy('pa.fecha')->orderBy('pa.id_pago')->get();

        $ventas = DB::table('pc_pedidos')->where('id_cliente', $idCliente)->where('tipo', 'pedido')->where('estado', '!=', 'cancelado')
            ->selectRaw('COUNT(*) as pedidos, COALESCE(SUM(total),0) as total, MAX(fecha_pedido) as ultima')->first();

        return response()->json(['error' => false, 'corte' => $hoy, 'cliente' => $cliente, 'documentos' => $docs, 'pagos' => $pagos, 'historico' => $ventas]);
    }

    // =====================================================================
    // RECAUDO (contado del período + abonos recibidos)
    // =====================================================================
    public function recaudo(Request $request)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        [$desde, $hasta] = $this->rango($request);

        $abonos = DB::table('pc_pagos as pa')
            ->join('pc_pedidos as p', 'p.id_pedido', '=', 'pa.id_pedido')
            ->leftJoin('pc_clientes as c', 'c.id_cliente', '=', 'pa.id_cliente')
            ->leftJoin('pc_usuarios as u', 'u.id_usuario', '=', 'pa.id_usuario')
            ->leftJoin('pc_rutas as r', 'r.id_ruta', '=', 'p.id_ruta')
            ->where('pa.anulado', 0)
            ->whereBetween('pa.fecha', [$desde->toDateString(), $hasta->toDateString()])
            ->when($request->id_ruta, fn($q) => $q->where('p.id_ruta', (int) $request->id_ruta))
            ->select('pa.id_pago', 'pa.fecha', 'pa.valor', 'pa.medio_pago', 'pa.referencia', 'p.numero_pedido', 'p.tipo', 'p.documento_ref',
                'c.nombre as cliente_nombre', 'c.razon_social as cliente_razon', 'u.nombre as recibio', 'r.nombre as ruta')
            ->orderBy('pa.fecha')->orderBy('pa.id_pago')->get();

        $contado = DB::table('pc_pedidos as p')
            ->leftJoin('pc_usuarios as u', 'u.id_usuario', '=', 'p.id_vendedor')
            ->where('p.tipo', 'pedido')->where('p.estado', '!=', 'cancelado')->where('p.forma_pago', 'contado')
            ->whereBetween('p.fecha_pedido', [$desde, $hasta])
            ->when($request->id_ruta, fn($q) => $q->where('p.id_ruta', (int) $request->id_ruta))
            ->groupBy(DB::raw('DATE(p.fecha_pedido)'), 'p.id_vendedor', 'u.nombre')
            ->selectRaw("DATE(p.fecha_pedido) as fecha, COALESCE(u.nombre,'Sin vendedor') as vendedor, COUNT(*) as pedidos, SUM(p.total) as total")
            ->get();

        return response()->json([
            'error' => false,
            'periodo' => ['desde' => $desde->toDateString(), 'hasta' => $hasta->toDateString()],
            'abonos' => $abonos,
            'contado' => $contado,
        ]);
    }

    // =====================================================================
    // INVENTARIO VALORIZADO
    // =====================================================================
    public function inventarioValorizado(Request $request)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $q = DB::table('pc_productos as pr')
            ->leftJoin('pc_categorias as ca', 'ca.id_categoria', '=', 'pr.id_categoria')
            ->where('pr.activo', 1)
            ->when($request->id_categoria, fn($x) => $x->where('pr.id_categoria', (int) $request->id_categoria))
            ->select('pr.id_producto', 'pr.codigo', 'pr.nombre', 'pr.stock', 'pr.stock_minimo', 'pr.precio', 'pr.precio_costo', 'pr.iva',
                DB::raw("COALESCE(ca.nombre,'Sin categoría') as categoria"));
        if (Schema::hasTable('pc_proveedores')) {
            $q->leftJoin('pc_proveedores as pv', 'pv.id_proveedor', '=', 'pr.id_proveedor')
                ->when($request->id_proveedor, fn($x) => $x->where('pr.id_proveedor', (int) $request->id_proveedor))
                ->addSelect(DB::raw("COALESCE(pv.nombre,'Sin proveedor asignado') as proveedor"));
        }
        return response()->json(['error' => false, 'corte' => $this->hoy(), 'productos' => $q->orderBy('pr.nombre')->get()]);
    }

    // =====================================================================
    // COMPRAS POR PERÍODO
    // =====================================================================
    public function compras(Request $request)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        if (!Schema::hasTable('pc_compras')) return response()->json(['error' => true, 'mensaje' => 'El módulo de compras no está instalado'], 422);
        [$desde, $hasta] = $this->rango($request);

        $compras = DB::table('pc_compras as co')
            ->leftJoin('pc_proveedores as pv', 'pv.id_proveedor', '=', 'co.id_proveedor')
            ->where('co.estado', 'recibida')
            ->whereBetween('co.fecha', [$desde->toDateString(), $hasta->toDateString()])
            ->when($request->id_proveedor, fn($q) => $q->where('co.id_proveedor', (int) $request->id_proveedor))
            ->select('co.id_compra', 'co.numero', 'co.factura_proveedor', 'co.fecha', 'co.forma_pago', 'co.subtotal', 'co.descuento', 'co.iva',
                'co.flete', 'co.total', 'co.retencion', 'co.neto_pagar', 'co.saldo', 'co.id_proveedor', 'pv.nombre as proveedor')
            ->orderBy('co.fecha')->orderBy('co.id_compra')->get();

        $productos = DB::table('pc_compra_detalle as d')
            ->whereIn('d.id_compra', $compras->pluck('id_compra'))
            ->groupBy('d.id_producto', 'd.descripcion', 'd.codigo')
            ->selectRaw('d.id_producto, d.descripcion as nombre, d.codigo, SUM(d.unidades) as unidades, SUM(d.total) as total,
                SUM(d.total) / NULLIF(SUM(d.unidades),0) as costo_promedio, COUNT(DISTINCT d.id_compra) as compras')
            ->orderByDesc('total')->get();

        $pagos = DB::table('pc_pagos_proveedor as pp')
            ->leftJoin('pc_proveedores as pv', 'pv.id_proveedor', '=', 'pp.id_proveedor')
            ->where('pp.estado', 'valido')
            ->whereBetween('pp.fecha', [$desde->toDateString(), $hasta->toDateString()])
            ->when($request->id_proveedor, fn($q) => $q->where('pp.id_proveedor', (int) $request->id_proveedor))
            ->groupBy('pp.id_proveedor', 'pv.nombre')
            ->selectRaw("COALESCE(pv.nombre,'-') as proveedor, SUM(pp.valor) as valor, SUM(pp.descuento) as descuento, COUNT(DISTINCT pp.comprobante) as comprobantes")
            ->get();

        return response()->json([
            'error' => false,
            'periodo' => ['desde' => $desde->toDateString(), 'hasta' => $hasta->toDateString()],
            'compras' => $compras, 'productos' => $productos, 'pagos' => $pagos,
        ]);
    }

    // =====================================================================
    // CUENTAS POR PAGAR POR EDADES
    // =====================================================================
    public function cxpEdades(Request $request)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        if (!Schema::hasTable('pc_compras')) return response()->json(['error' => true, 'mensaje' => 'El módulo de compras no está instalado'], 422);
        $hoy = $this->hoy();
        $docs = DB::table('pc_compras as co')
            ->leftJoin('pc_proveedores as pv', 'pv.id_proveedor', '=', 'co.id_proveedor')
            ->where('co.estado', 'recibida')->where('co.saldo', '>', 0.009)
            ->select('co.id_compra', 'co.numero', 'co.factura_proveedor', 'co.fecha', 'co.fecha_vencimiento as vence', 'co.neto_pagar',
                'co.saldo', 'co.id_proveedor', 'pv.nombre as proveedor', 'pv.telefono',
                DB::raw("DATEDIFF('{$hoy}', COALESCE(co.fecha_vencimiento, co.fecha)) as dias_vencido"))
            ->orderBy('pv.nombre')->orderBy('co.fecha')->get();
        return response()->json(['error' => false, 'corte' => $hoy, 'documentos' => $docs]);
    }

    // =====================================================================
    // FACTURACIÓN ELECTRÓNICA DEL PERÍODO (para el contador)
    // =====================================================================
    public function facturacion(Request $request)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        if (!Schema::hasTable('pc_facturas')) return response()->json(['error' => true, 'mensaje' => 'La facturación electrónica no está instalada'], 422);
        [$desde, $hasta] = $this->rango($request);

        $facturas = DB::table('pc_facturas as f')
            ->where('f.estado', 'autorizada')
            ->whereBetween(DB::raw('COALESCE(f.fecha_emision, f.created_at)'), [$desde, $hasta])
            ->select('f.id_factura', 'f.prefijo', 'f.numero', 'f.cufe', DB::raw('COALESCE(f.fecha_emision, f.created_at) as fecha'),
                'f.cliente_identificacion', 'f.cliente_nombre', 'f.forma_pago', 'f.subtotal', 'f.iva', 'f.descuento', 'f.total')
            ->orderBy('fecha')->orderBy('f.numero')->get();

        $ivaFacturas = DB::table('pc_factura_detalle as d')->whereIn('d.id_factura', $facturas->pluck('id_factura'))
            ->groupBy('d.iva_porcentaje')->selectRaw('d.iva_porcentaje as tarifa, SUM(d.base) as base, SUM(d.iva) as iva, SUM(d.total) as total')->get();

        $notas = collect();
        $ivaNotas = collect();
        if (Schema::hasTable('pc_notas_credito')) {
            $notas = DB::table('pc_notas_credito as n')->join('pc_facturas as f', 'f.id_factura', '=', 'n.id_factura')
                ->where('n.estado', 'autorizada')
                ->whereBetween(DB::raw('COALESCE(n.fecha_emision, n.created_at)'), [$desde, $hasta])
                ->select('n.id_nota', 'n.prefijo', 'n.numero', 'n.concepto', 'n.motivo', 'n.total', DB::raw('COALESCE(n.fecha_emision, n.created_at) as fecha'),
                    'f.prefijo as factura_prefijo', 'f.numero as factura_numero', 'f.cliente_nombre', 'f.id_factura', 'f.total as factura_total')
                ->orderBy('fecha')->get();

            // IVA de las notas: del detalle si lo tienen; si no (anulación), el de la factura en proporción al valor de la nota
            $conDetalle = Schema::hasTable('pc_nota_credito_detalle')
                ? DB::table('pc_nota_credito_detalle')->whereIn('id_nota', $notas->pluck('id_nota'))->pluck('id_nota')->unique()->all() : [];
            if ($conDetalle) {
                $ivaNotas = $ivaNotas->concat(DB::table('pc_nota_credito_detalle')->whereIn('id_nota', $conDetalle)
                    ->groupBy('iva_porcentaje')->selectRaw('iva_porcentaje as tarifa, SUM(base) as base, SUM(iva) as iva, SUM(total) as total')->get());
            }
            $sinDetalle = $notas->whereNotIn('id_nota', $conDetalle);
            foreach ($sinDetalle as $n) {
                $factor = (float) $n->factura_total > 0 ? min(1, (float) $n->total / (float) $n->factura_total) : 0;
                $ivaNotas = $ivaNotas->concat(DB::table('pc_factura_detalle')->where('id_factura', $n->id_factura)
                    ->groupBy('iva_porcentaje')->selectRaw('iva_porcentaje as tarifa, SUM(base) as base, SUM(iva) as iva, SUM(total) as total')->get()
                    ->map(fn($x) => (object) ['tarifa' => $x->tarifa, 'base' => round($x->base * $factor, 2), 'iva' => round($x->iva * $factor, 2), 'total' => round($x->total * $factor, 2)]));
            }
        }

        return response()->json([
            'error' => false,
            'periodo' => ['desde' => $desde->toDateString(), 'hasta' => $hasta->toDateString()],
            'facturas' => $facturas, 'iva_facturas' => $ivaFacturas,
            'notas' => $notas, 'iva_notas' => $ivaNotas->values(),
        ]);
    }
}
