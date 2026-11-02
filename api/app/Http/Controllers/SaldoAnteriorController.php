<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;
use App\Models\Cliente;
use App\Models\Pago;
use App\Models\Pedido;

/**
 * Saldos anteriores: deudas de clientes de antes de usar la app.
 * Se guardan en pc_pedidos (tipo = 'saldo_anterior', a crédito, sin productos) para que entren a la
 * cartera y reciban abonos como cualquier pedido. No mueven inventario ni cuentan como ventas.
 */
class SaldoAnteriorController extends Controller
{
    private function soloAdmin(Request $request)
    {
        if ($request->usuario->rol !== 'admin') {
            return response()->json(['error' => true, 'mensaje' => 'Solo el administrador maneja los saldos anteriores'], 403);
        }
        return null;
    }

    /** Listado con abonado y saldo (?id_cliente=) */
    public function index(Request $request)
    {
        if ($r = $this->soloAdmin($request)) return $r;

        $q = DB::table('pc_pedidos as p')
            ->leftJoin('pc_clientes as c', 'c.id_cliente', '=', 'p.id_cliente')
            ->leftJoinSub(
                DB::table('pc_pagos')->where('anulado', 0)->groupBy('id_pedido')->select('id_pedido', DB::raw('SUM(valor) as pagado')),
                'pg', 'pg.id_pedido', '=', 'p.id_pedido'
            )
            ->where('p.tipo', 'saldo_anterior')
            ->select('p.id_pedido', 'p.numero_pedido', 'p.documento_ref', 'p.fecha_pedido', 'p.dias_credito', 'p.total', 'p.valor_original',
                'p.notas', 'p.id_cliente', 'c.nombre as cliente_nombre', 'c.razon_social as cliente_razon',
                DB::raw('COALESCE(pg.pagado, 0) as pagado'), DB::raw('ROUND(p.total - COALESCE(pg.pagado, 0), 2) as saldo'));
        if ($request->id_cliente) $q->where('p.id_cliente', $request->id_cliente);

        return response()->json(['error' => false, 'saldos' => $q->orderBy('c.nombre')->orderBy('p.fecha_pedido')->get()]);
    }

    /**
     * Carga uno o varios documentos de un cliente.
     * { id_cliente, dias_credito, documentos: [{ numero, fecha, valor, saldo, notas }] }
     */
    public function store(Request $request)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $this->validate($request, [
            'id_cliente' => 'required|integer',
            'dias_credito' => 'nullable|integer|min:0|max:3650',
            'documentos' => 'required|array|min:1|max:100',
            'documentos.*.numero' => 'required|string|max:30',
            'documentos.*.fecha' => 'required|date',
            'documentos.*.saldo' => 'required|numeric|min:1|max:9999999999',
            'documentos.*.valor' => 'nullable|numeric|min:0|max:9999999999',
            'documentos.*.notas' => 'nullable|string|max:255',
        ]);

        $cliente = Cliente::find($request->id_cliente);
        if (!$cliente) return response()->json(['error' => true, 'mensaje' => 'Cliente no encontrado'], 404);

        $hoy = Carbon::now('America/Bogota')->toDateString();
        foreach ($request->documentos as $i => $d) {
            if ($error = $this->validarDocumento($d, $hoy)) {
                return response()->json(['error' => true, 'mensaje' => 'Documento ' . ($i + 1) . " ({$d['numero']}): {$error}"], 422);
            }
        }

        $creados = DB::transaction(function () use ($request, $cliente) {
            $ids = [];
            foreach ($request->documentos as $d) {
                $saldo = round((float) $d['saldo'], 2);
                $p = Pedido::create([
                    'numero_pedido' => $this->numeroUnico($d['numero']),
                    'tipo' => 'saldo_anterior',
                    'documento_ref' => trim($d['numero']),
                    'id_cliente' => $cliente->id_cliente,
                    'id_vendedor' => $cliente->id_vendedor ?: $request->usuario->id_usuario,
                    'id_ruta' => $cliente->id_ruta,
                    'fecha_pedido' => $d['fecha'] . ' 00:00:00',
                    'estado' => 'entregado',
                    'forma_pago' => 'credito',
                    'dias_credito' => (int) ($request->dias_credito ?? 30),
                    'subtotal' => $saldo,
                    'descuento' => 0,
                    'impuesto' => 0,
                    'total' => $saldo,
                    'valor_original' => isset($d['valor']) && $d['valor'] !== '' && $d['valor'] !== null ? round((float) $d['valor'], 2) : $saldo,
                    'notas' => $d['notas'] ?? null,
                ]);
                $ids[] = $p->id_pedido;
            }
            return $ids;
        });

        $total = array_sum(array_map(fn($d) => (float) $d['saldo'], $request->documentos));
        return response()->json([
            'error' => false,
            'mensaje' => count($creados) . ' saldo(s) anterior(es) cargado(s) a la cartera por $' . number_format($total, 0, ',', '.'),
            'ids' => $creados,
        ], 201);
    }

    public function update(Request $request, $id)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $this->validate($request, [
            'numero' => 'required|string|max:30',
            'fecha' => 'required|date',
            'saldo' => 'required|numeric|min:1|max:9999999999',
            'valor' => 'nullable|numeric|min:0|max:9999999999',
            'dias_credito' => 'nullable|integer|min:0|max:3650',
            'notas' => 'nullable|string|max:255',
        ]);

        $p = Pedido::where('tipo', 'saldo_anterior')->find($id);
        if (!$p) return response()->json(['error' => true, 'mensaje' => 'Saldo anterior no encontrado'], 404);

        $hoy = Carbon::now('America/Bogota')->toDateString();
        if ($error = $this->validarDocumento($request->all(), $hoy)) return response()->json(['error' => true, 'mensaje' => $error], 422);

        $pagado = Pago::pagadoDe($p->id_pedido);
        $saldo = round((float) $request->saldo, 2);
        if ($saldo + 0.009 < $pagado) {
            return response()->json(['error' => true, 'mensaje' => 'Ya tiene abonos por $' . number_format($pagado, 0, ',', '.') . '; el saldo cargado no puede ser menor'], 422);
        }

        $numero = trim($request->numero);
        $p->fill([
            'numero_pedido' => $numero === $p->documento_ref ? $p->numero_pedido : $this->numeroUnico($numero, $p->id_pedido),
            'documento_ref' => $numero,
            'fecha_pedido' => $request->fecha . ' 00:00:00',
            'dias_credito' => (int) ($request->dias_credito ?? $p->dias_credito),
            'subtotal' => $saldo,
            'total' => $saldo,
            'valor_original' => $request->valor !== null && $request->valor !== '' ? round((float) $request->valor, 2) : $saldo,
            'notas' => $request->notas,
        ])->save();

        return response()->json(['error' => false, 'mensaje' => 'Saldo anterior actualizado']);
    }

    /** Solo si no tiene abonos vigentes */
    public function destroy(Request $request, $id)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $p = Pedido::where('tipo', 'saldo_anterior')->find($id);
        if (!$p) return response()->json(['error' => true, 'mensaje' => 'Saldo anterior no encontrado'], 404);

        $pagado = Pago::pagadoDe($p->id_pedido);
        if ($pagado > 0) {
            return response()->json(['error' => true, 'mensaje' => 'Tiene abonos por $' . number_format($pagado, 0, ',', '.') . '. Anúlalos antes de eliminarlo.'], 409);
        }

        DB::transaction(function () use ($p) {
            DB::table('pc_pagos')->where('id_pedido', $p->id_pedido)->delete(); // solo quedan anulados
            DB::table('pc_pedido_historial')->where('id_pedido', $p->id_pedido)->delete();
            $p->delete();
        });

        return response()->json(['error' => false, 'mensaje' => "Saldo anterior {$p->documento_ref} eliminado"]);
    }

    private function validarDocumento(array $d, string $hoy): ?string
    {
        if (($d['fecha'] ?? '') > $hoy) return 'la fecha no puede ser futura';
        $valor = $d['valor'] ?? null;
        if ($valor !== null && $valor !== '' && (float) $d['saldo'] > (float) $valor + 0.009) {
            return 'el saldo no puede ser mayor que el valor del documento';
        }
        return null;
    }

    /** numero_pedido es único (varchar 20): "SA-<número>" y, si ya existe, se le agrega un consecutivo */
    private function numeroUnico(string $numero, ?int $excepto = null): string
    {
        $base = 'SA-' . mb_substr(preg_replace('/\s+/', '', $numero), 0, 14);
        $candidato = $base;
        for ($n = 2; DB::table('pc_pedidos')->where('numero_pedido', $candidato)->when($excepto, fn($q) => $q->where('id_pedido', '!=', $excepto))->exists(); $n++) {
            $candidato = mb_substr($base, 0, 17) . '-' . $n;
        }
        return $candidato;
    }
}
