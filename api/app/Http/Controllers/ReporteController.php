<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Carbon\Carbon;

class ReporteController extends Controller
{
    /**
     * Inventario: stock de productos activos con ventas de los últimos 30 días
     * (unidades equivalentes en pedidos no cancelados). El frontend filtra.
     */
    public function stock(Request $request)
    {
        if ($request->usuario->rol !== 'admin') {
            return response()->json(['error' => true, 'mensaje' => 'No tienes permisos para ver reportes'], 403);
        }

        $catalogos = Schema::hasTable('pc_catalogo_producto');
        $proveedores = Schema::hasTable('pc_proveedores');
        $desde = Carbon::now()->subDays(30);

        $vendidos = DB::table('pc_pedido_detalle as d')
            ->join('pc_pedidos as p', 'p.id_pedido', '=', 'd.id_pedido')
            ->where('p.estado', '!=', 'cancelado')
            ->where('p.fecha_pedido', '>=', $desde)
            ->groupBy('d.id_producto')
            ->select('d.id_producto', DB::raw('SUM(COALESCE(d.unidades_equivalentes, d.cantidad)) as vendidos_30d'), DB::raw('MAX(p.fecha_pedido) as ultima_venta'));

        $q = DB::table('pc_productos as pr')
            ->leftJoin('pc_categorias as c', 'c.id_categoria', '=', 'pr.id_categoria')
            ->leftJoinSub($vendidos, 'v', 'v.id_producto', '=', 'pr.id_producto')
            ->where('pr.activo', 1)
            ->select('pr.id_producto', 'pr.codigo', 'pr.nombre', 'pr.foto', 'pr.precio', 'pr.stock', 'pr.stock_minimo',
                'pr.unidades_por_caja', 'pr.id_categoria', 'c.nombre as categoria',
                DB::raw('COALESCE(v.vendidos_30d, 0) as vendidos_30d'), 'v.ultima_venta');

        if ($proveedores) {
            $q->leftJoin('pc_proveedores as pv', 'pv.id_proveedor', '=', 'pr.id_proveedor')
              ->addSelect('pr.id_proveedor', 'pv.nombre as proveedor', 'pr.precio_costo');
        }

        $productos = $q->orderBy('pr.nombre')->get();

        if ($catalogos) {
            $map = DB::table('pc_catalogo_producto')->get()->groupBy('id_producto');
            $productos->each(fn($p) => $p->catalogos = ($map[$p->id_producto] ?? collect())->pluck('id_catalogo')->values());
        }

        return response()->json(['error' => false, 'productos' => $productos, 'generado' => Carbon::now()->toDateTimeString()]);
    }

    /**
     * Cierre de mes (solo consulta, no cierra nada).
     * Devuelve todos los pedidos del mes con sus datos para que el frontend
     * calcule totales según los pedidos/estados que el usuario incluya.
     */
    public function cierre(Request $request)
    {
        if ($request->usuario->rol !== 'admin') {
            return response()->json(['error' => true, 'mensaje' => 'No tienes permisos para ver reportes'], 403);
        }

        $hoy = Carbon::now('America/Bogota');
        $anio = (int) ($request->anio ?: $hoy->year);
        $mes = (int) ($request->mes ?: $hoy->month);
        if ($mes < 1 || $mes > 12 || $anio < 2000 || $anio > 2100) {
            return response()->json(['error' => true, 'mensaje' => 'Mes inválido'], 422);
        }

        $desde = Carbon::create($anio, $mes, 1)->startOfDay();
        $hasta = $desde->copy()->endOfMonth();
        $credito = Schema::hasColumn('pc_pedidos', 'forma_pago');
        $pagosTabla = Schema::hasTable('pc_pagos');
        $feTabla = Schema::hasTable('pc_facturas');

        // ---------- Pedidos del mes ----------
        $q = DB::table('pc_pedidos as p')
            ->leftJoin('pc_clientes as c', 'c.id_cliente', '=', 'p.id_cliente')
            ->leftJoin('pc_usuarios as u', 'u.id_usuario', '=', 'p.id_vendedor')
            ->leftJoin('pc_rutas as r', 'r.id_ruta', '=', 'p.id_ruta')
            ->whereBetween('p.fecha_pedido', [$desde, $hasta])
            ->select(
                'p.id_pedido', 'p.numero_pedido', 'p.fecha_pedido', 'p.estado', 'p.subtotal', 'p.descuento', 'p.total',
                'p.id_vendedor', 'u.nombre as vendedor', 'p.id_ruta', 'r.nombre as ruta', 'r.color as ruta_color',
                'c.nombre as cliente_nombre', 'c.razon_social as cliente_razon'
            );

        if ($credito) {
            $q->addSelect('p.forma_pago', 'p.dias_credito');
        } else {
            $q->addSelect(DB::raw("'contado' as forma_pago"), DB::raw('0 as dias_credito'));
        }

        if ($pagosTabla) {
            $q->leftJoinSub(
                DB::table('pc_pagos')->where('anulado', 0)->groupBy('id_pedido')
                    ->select('id_pedido', DB::raw('SUM(valor) as abonado')),
                'pg', 'pg.id_pedido', '=', 'p.id_pedido'
            )->addSelect(DB::raw('COALESCE(pg.abonado, 0) as abonado'));
        } else {
            $q->addSelect(DB::raw('0 as abonado'));
        }

        if ($feTabla) {
            $q->leftJoinSub(
                DB::table('pc_facturas')->where('estado', 'autorizada')->groupBy('id_pedido')
                    ->select('id_pedido', DB::raw("MAX(CONCAT(IFNULL(prefijo,''), IFNULL(numero,''))) as factura")),
                'fe', 'fe.id_pedido', '=', 'p.id_pedido'
            )->addSelect('fe.factura');
        } else {
            $q->addSelect(DB::raw('NULL as factura'));
        }

        $pedidos = $q->orderBy('p.fecha_pedido')->get();

        // ---------- Productos vendidos (por pedido, para recalcular según selección) ----------
        $lineas = DB::table('pc_pedido_detalle as d')
            ->join('pc_pedidos as p', 'p.id_pedido', '=', 'd.id_pedido')
            ->leftJoin('pc_productos as pr', 'pr.id_producto', '=', 'd.id_producto')
            ->whereBetween('p.fecha_pedido', [$desde, $hasta])
            ->select('d.id_pedido', 'd.id_producto', 'pr.nombre', 'pr.codigo',
                DB::raw('COALESCE(d.unidades_equivalentes, d.cantidad) as unidades'), 'd.subtotal')
            ->get();

        // ---------- Pagos/abonos recibidos en el mes (de cualquier pedido) ----------
        $pagosMes = [];
        if ($pagosTabla) {
            $pagosMes = DB::table('pc_pagos as pa')
                ->join('pc_pedidos as p', 'p.id_pedido', '=', 'pa.id_pedido')
                ->where('pa.anulado', 0)
                ->whereBetween('pa.fecha', [$desde->toDateString(), $hasta->toDateString()])
                ->select('pa.id_pago', 'pa.id_pedido', 'pa.fecha', 'pa.valor', 'pa.medio_pago', 'p.numero_pedido',
                    DB::raw("DATE_FORMAT(p.fecha_pedido, '%Y-%m') as mes_pedido"))
                ->get();
        }

        // ---------- Comparativo: mes anterior y mismo mes del año anterior ----------
        $resumenMes = function (Carbon $ini) {
            $r = DB::table('pc_pedidos')
                ->where('estado', '!=', 'cancelado')
                ->whereBetween('fecha_pedido', [$ini->copy()->startOfMonth(), $ini->copy()->endOfMonth()])
                ->selectRaw('COUNT(*) as pedidos, COALESCE(SUM(total), 0) as ventas')->first();
            return ['pedidos' => (int) $r->pedidos, 'ventas' => (float) $r->ventas, 'mes' => $ini->format('Y-m')];
        };

        return response()->json([
            'error' => false,
            'periodo' => [
                'anio' => $anio, 'mes' => $mes,
                'desde' => $desde->toDateString(), 'hasta' => $hasta->toDateString(),
                'en_curso' => $hoy->year === $anio && $hoy->month === $mes,
            ],
            'pedidos' => $pedidos,
            'lineas' => $lineas,
            'pagos_mes' => $pagosMes,
            'comparativo' => [
                'mes_anterior' => $resumenMes($desde->copy()->subMonthNoOverflow()),
                'anio_anterior' => $resumenMes($desde->copy()->subYear()),
            ],
            'modulos' => ['credito' => $credito, 'pagos' => $pagosTabla, 'facturacion' => $feTabla],
        ]);
    }
}
