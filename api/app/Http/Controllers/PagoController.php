<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;
use App\Models\Pago;
use App\Models\Pedido;

class PagoController extends Controller
{
    /** Subconsulta: total pagado (no anulado) por pedido */
    private function pagadosSub()
    {
        return DB::table('pc_pagos')
            ->select('id_pedido', DB::raw('SUM(valor) as pagado'), DB::raw('MAX(fecha) as ultimo_pago'))
            ->where('anulado', 0)
            ->groupBy('id_pedido');
    }

    /**
     * Cartera: pedidos a crédito con su saldo.
     * estado: pendiente (con saldo, default) | vencido | pagado | todos
     */
    public function cartera(Request $request)
    {
        $usuario = $request->usuario;
        $hoy = Carbon::now('America/Bogota')->toDateString();

        $q = DB::table('pc_pedidos as p')
            ->leftJoinSub($this->pagadosSub(), 'pg', 'pg.id_pedido', '=', 'p.id_pedido')
            ->leftJoin('pc_clientes as c', 'c.id_cliente', '=', 'p.id_cliente')
            ->leftJoin('pc_rutas as r', 'r.id_ruta', '=', 'p.id_ruta')
            ->leftJoin('pc_usuarios as u', 'u.id_usuario', '=', 'p.id_vendedor')
            ->where('p.forma_pago', 'credito')
            ->where('p.estado', '!=', 'cancelado')
            ->select(
                'p.id_pedido', 'p.numero_pedido', 'p.fecha_pedido', 'p.total', 'p.dias_credito', 'p.estado',
                'p.id_cliente', 'c.nombre as cliente_nombre', 'c.razon_social as cliente_razon', 'c.telefono as cliente_telefono',
                'r.nombre as ruta_nombre', 'r.color as ruta_color', 'u.nombre as vendedor',
                DB::raw('COALESCE(pg.pagado, 0) as pagado'),
                DB::raw('ROUND(p.total - COALESCE(pg.pagado, 0), 2) as saldo'),
                DB::raw('pg.ultimo_pago'),
                DB::raw('DATE_ADD(DATE(p.fecha_pedido), INTERVAL p.dias_credito DAY) as vence'),
                DB::raw("DATEDIFF('{$hoy}', DATE_ADD(DATE(p.fecha_pedido), INTERVAL p.dias_credito DAY)) as dias_vencido")
            );

        if ($usuario->rol !== 'admin') $q->where('p.id_vendedor', $usuario->id_usuario);
        if ($request->id_cliente) $q->where('p.id_cliente', $request->id_cliente);
        if ($request->id_ruta) $q->where('p.id_ruta', $request->id_ruta);
        if ($request->buscar) {
            $t = $request->buscar;
            $q->where(fn($w) => $w->where('p.numero_pedido', 'LIKE', "%{$t}%")
                ->orWhere('c.nombre', 'LIKE', "%{$t}%")
                ->orWhere('c.razon_social', 'LIKE', "%{$t}%"));
        }

        $saldoExpr = 'p.total - COALESCE(pg.pagado, 0)';
        $venceExpr = 'DATE_ADD(DATE(p.fecha_pedido), INTERVAL p.dias_credito DAY)';
        switch ($request->input('estado', 'pendiente')) {
            case 'pendiente': $q->whereRaw("{$saldoExpr} > 0.009"); break;
            case 'vencido': $q->whereRaw("{$saldoExpr} > 0.009")->whereRaw("{$venceExpr} < ?", [$hoy]); break;
            case 'pagado': $q->whereRaw("{$saldoExpr} <= 0.009"); break;
        }

        $creditos = $q->orderByRaw("{$venceExpr} ASC")->limit(2000)->get();

        return response()->json([
            'error' => false,
            'creditos' => $creditos,
            'resumen' => $this->resumen($usuario, $hoy),
        ]);
    }

    private function resumen($usuario, string $hoy): array
    {
        $base = DB::table('pc_pedidos as p')
            ->leftJoinSub($this->pagadosSub(), 'pg', 'pg.id_pedido', '=', 'p.id_pedido')
            ->where('p.forma_pago', 'credito')->where('p.estado', '!=', 'cancelado')
            ->whereRaw('p.total - COALESCE(pg.pagado, 0) > 0.009');
        if ($usuario->rol !== 'admin') $base->where('p.id_vendedor', $usuario->id_usuario);

        $cartera = (clone $base)->selectRaw('COUNT(*) as n, COALESCE(SUM(p.total - COALESCE(pg.pagado, 0)), 0) as saldo')->first();
        $vencida = (clone $base)
            ->whereRaw('DATE_ADD(DATE(p.fecha_pedido), INTERVAL p.dias_credito DAY) < ?', [$hoy])
            ->selectRaw('COUNT(*) as n, COALESCE(SUM(p.total - COALESCE(pg.pagado, 0)), 0) as saldo')->first();

        $pagos = DB::table('pc_pagos as pa')->where('pa.anulado', 0);
        if ($usuario->rol !== 'admin') {
            $pagos->join('pc_pedidos as p', 'p.id_pedido', '=', 'pa.id_pedido')->where('p.id_vendedor', $usuario->id_usuario);
        }
        $mesIni = Carbon::parse($hoy)->startOfMonth()->toDateString();

        return [
            'cartera_total' => (float) $cartera->saldo,
            'creditos_abiertos' => (int) $cartera->n,
            'vencida_total' => (float) $vencida->saldo,
            'creditos_vencidos' => (int) $vencida->n,
            'cobrado_hoy' => (float) (clone $pagos)->where('pa.fecha', $hoy)->sum('pa.valor'),
            'cobrado_mes' => (float) (clone $pagos)->where('pa.fecha', '>=', $mesIni)->sum('pa.valor'),
        ];
    }

    /** Historial de pagos recibidos */
    public function index(Request $request)
    {
        $usuario = $request->usuario;
        $q = Pago::with([
            'pedido:id_pedido,numero_pedido,total,id_vendedor',
            'cliente:id_cliente,nombre,razon_social',
            'usuario:id_usuario,nombre',
        ]);

        if ($usuario->rol !== 'admin') {
            $q->whereHas('pedido', fn($p) => $p->where('id_vendedor', $usuario->id_usuario));
        }
        if ($request->fecha_desde) $q->where('fecha', '>=', $request->fecha_desde);
        if ($request->fecha_hasta) $q->where('fecha', '<=', $request->fecha_hasta);
        if ($request->id_cliente) $q->where('id_cliente', $request->id_cliente);
        if ($request->id_pedido) $q->where('id_pedido', $request->id_pedido);
        if ($request->medio_pago) $q->where('medio_pago', $request->medio_pago);
        if (!filter_var($request->input('incluir_anulados', false), FILTER_VALIDATE_BOOLEAN)) $q->where('anulado', 0);

        $pagos = $q->orderByDesc('fecha')->orderByDesc('id_pago')->limit(2000)->get();

        return response()->json([
            'error' => false,
            'pagos' => $pagos,
            'total' => round($pagos->where('anulado', false)->sum('valor'), 2),
        ]);
    }

    public function show(Request $request, $id)
    {
        $pago = Pago::with(['pedido', 'cliente', 'usuario:id_usuario,nombre'])->find($id);
        if (!$pago) return response()->json(['error' => true, 'mensaje' => 'Pago no encontrado'], 404);
        if ($request->usuario->rol !== 'admin' && $pago->pedido->id_vendedor != $request->usuario->id_usuario) {
            return response()->json(['error' => true, 'mensaje' => 'No tienes permisos'], 403);
        }

        $pagado = Pago::pagadoDe($pago->id_pedido);
        return response()->json([
            'error' => false,
            'pago' => $pago,
            'pagado' => $pagado,
            'saldo' => round((float) $pago->pedido->total - $pagado, 2),
        ]);
    }

    /** Registrar un abono a un pedido a crédito */
    public function store(Request $request)
    {
        $this->validate($request, [
            'id_pedido' => 'required|integer',
            'valor' => 'required|numeric|min:1',
            'medio_pago' => 'nullable|in:' . implode(',', Pago::MEDIOS),
            'fecha' => 'nullable|date',
            'referencia' => 'nullable|string|max:100',
            'notas' => 'nullable|string|max:255',
        ]);

        $usuario = $request->usuario;
        $uuid = $this->uuidOffline($request, 'pc_pagos');
        if ($uuid && ($dup = Pago::where('uuid_offline', $uuid)->first())) {
            return response()->json([
                'error' => false, 'duplicado' => true, 'mensaje' => 'El pago ya estaba sincronizado',
                'pago' => $dup->load(['pedido:id_pedido,numero_pedido,total', 'cliente:id_cliente,nombre,razon_social', 'usuario:id_usuario,nombre']),
                'saldo' => round((float) $dup->pedido->total - Pago::pagadoDe($dup->id_pedido), 2),
            ]);
        }

        try {
            $resultado = DB::transaction(function () use ($request, $usuario, $uuid) {
                // Bloqueo del pedido: evita dos abonos simultáneos que sobrepasen el saldo
                $pedido = Pedido::where('id_pedido', $request->id_pedido)->lockForUpdate()->first();

                if (!$pedido) return ['error' => 'Pedido no encontrado', 'http' => 404];
                if ($usuario->rol !== 'admin' && $pedido->id_vendedor != $usuario->id_usuario) {
                    return ['error' => 'No tienes permisos sobre este pedido', 'http' => 403];
                }
                if ($pedido->forma_pago !== 'credito') return ['error' => 'El pedido es de contado; solo se registran pagos a pedidos a crédito', 'http' => 422];
                if ($pedido->estado === 'cancelado') return ['error' => 'El pedido está cancelado', 'http' => 422];

                $saldo = round((float) $pedido->total - Pago::pagadoDe($pedido->id_pedido), 2);
                $valor = round((float) $request->valor, 2);
                if ($saldo <= 0) return ['error' => 'El pedido ya está pagado', 'http' => 422];
                if ($valor > $saldo + 0.009) {
                    return ['error' => 'El pago ($' . number_format($valor, 0, ',', '.') . ') supera el saldo pendiente ($' . number_format($saldo, 0, ',', '.') . ')', 'http' => 422];
                }

                $hoy = Carbon::now('America/Bogota')->toDateString();
                $fecha = $request->fecha ?: $hoy;
                if ($fecha > $hoy) return ['error' => 'La fecha del pago no puede ser futura', 'http' => 422];

                $pago = Pago::create([
                    'id_pedido' => $pedido->id_pedido,
                    'id_cliente' => $pedido->id_cliente,
                    'fecha' => $fecha,
                    'valor' => $valor,
                    'medio_pago' => $request->medio_pago ?: 'efectivo',
                    'referencia' => $request->referencia,
                    'notas' => $request->notas,
                    'id_usuario' => $usuario->id_usuario,
                ]);
                if ($uuid) {
                    $pago->uuid_offline = $uuid;
                    $pago->save();
                }

                return ['pago' => $pago, 'saldo' => round($saldo - $valor, 2)];
            });
        } catch (\Exception $e) {
            return response()->json(['error' => true, 'mensaje' => 'Error al registrar el pago: ' . $e->getMessage()], 500);
        }

        if (isset($resultado['error'])) {
            return response()->json(['error' => true, 'mensaje' => $resultado['error']], $resultado['http']);
        }

        $saldo = $resultado['saldo'];
        return response()->json([
            'error' => false,
            'mensaje' => $saldo <= 0 ? '¡Pago registrado! El crédito quedó saldado' : 'Pago registrado. Saldo pendiente: $' . number_format($saldo, 0, ',', '.'),
            'pago' => $resultado['pago']->load(['pedido:id_pedido,numero_pedido,total', 'cliente:id_cliente,nombre,razon_social', 'usuario:id_usuario,nombre']),
            'saldo' => $saldo,
        ], 201);
    }

    /** Anular un pago (solo admin). No se borra: queda en el historial como anulado. */
    public function anular(Request $request, $id)
    {
        if ($request->usuario->rol !== 'admin') {
            return response()->json(['error' => true, 'mensaje' => 'Solo el administrador puede anular pagos'], 403);
        }
        $this->validate($request, ['motivo' => 'required|string|max:255']);

        $pago = Pago::find($id);
        if (!$pago) return response()->json(['error' => true, 'mensaje' => 'Pago no encontrado'], 404);
        if ($pago->anulado) return response()->json(['error' => true, 'mensaje' => 'El pago ya estaba anulado'], 409);

        $pago->update([
            'anulado' => 1,
            'anulado_por' => $request->usuario->id_usuario,
            'anulado_at' => Carbon::now(),
            'motivo_anulacion' => $request->motivo,
        ]);

        return response()->json(['error' => false, 'mensaje' => 'Pago anulado']);
    }
}
