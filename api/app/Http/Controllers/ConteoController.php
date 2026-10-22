<?php

namespace App\Http\Controllers;

use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Conteo de inventario (toma física).
 * Flujo: crear conteo (todo / catálogo / categoría / proveedor) → contar productos → aplicar ajustes.
 */
class ConteoController extends Controller
{
    private function soloAdmin(Request $request)
    {
        if ($request->usuario->rol !== 'admin') {
            return response()->json(['error' => true, 'mensaje' => 'Solo el administrador puede hacer conteos de inventario'], 403);
        }
        if (!Schema::hasTable('pc_conteos')) {
            return response()->json(['error' => true, 'mensaje' => 'Falta ejecutar la migración del conteo de inventario'], 500);
        }
        return null;
    }

    public function index(Request $request)
    {
        if ($r = $this->soloAdmin($request)) return $r;

        $conteos = DB::table('pc_conteos as c')
            ->leftJoin('pc_usuarios as u', 'u.id_usuario', '=', 'c.id_usuario')
            ->leftJoin('pc_usuarios as ua', 'ua.id_usuario', '=', 'c.id_usuario_aplica')
            ->select('c.*', 'u.nombre as usuario', 'ua.nombre as usuario_aplica')
            ->orderByDesc('c.id_conteo')->limit(200)->get();

        $resumen = DB::table('pc_conteo_detalle')
            ->whereIn('id_conteo', $conteos->pluck('id_conteo'))
            ->groupBy('id_conteo')
            ->select('id_conteo', DB::raw('COUNT(*) as contados'), DB::raw('SUM(diferencia <> 0) as con_diferencia'))
            ->get()->keyBy('id_conteo');

        foreach ($conteos as $c) {
            $c->contados = (int) ($resumen[$c->id_conteo]->contados ?? 0);
            $c->con_diferencia = (int) ($resumen[$c->id_conteo]->con_diferencia ?? 0);
            $c->total_productos = $c->estado === 'abierto' ? $this->productosAlcance($c)->count() : null;
        }

        return response()->json(['error' => false, 'conteos' => $conteos]);
    }

    public function store(Request $request)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $this->validate($request, [
            'nombre' => 'required|string|max:150',
            'alcance' => 'required|in:todo,catalogo,categoria,proveedor',
            'id_alcance' => 'required_unless:alcance,todo|nullable|integer',
            'notas' => 'nullable|string|max:500',
        ]);

        $alcanceNombre = null;
        if ($request->alcance !== 'todo') {
            [$tabla, $pk] = ['catalogo' => ['pc_catalogos', 'id_catalogo'], 'categoria' => ['pc_categorias', 'id_categoria'], 'proveedor' => ['pc_proveedores', 'id_proveedor']][$request->alcance];
            $alcanceNombre = DB::table($tabla)->where($pk, $request->id_alcance)->value('nombre');
            if (!$alcanceNombre) return response()->json(['error' => true, 'mensaje' => 'No se encontró el ' . $request->alcance . ' escogido'], 422);
        }

        $id = DB::table('pc_conteos')->insertGetId([
            'nombre' => trim($request->nombre),
            'alcance' => $request->alcance,
            'id_alcance' => $request->alcance === 'todo' ? null : (int) $request->id_alcance,
            'alcance_nombre' => $alcanceNombre,
            'notas' => $request->notas,
            'id_usuario' => $request->usuario->id_usuario,
            'created_at' => Carbon::now(),
            'updated_at' => Carbon::now(),
        ]);

        return response()->json(['error' => false, 'mensaje' => 'Conteo creado', 'id_conteo' => $id]);
    }

    /** Conteo abierto: todos los productos del alcance con lo contado. Aplicado: solo lo contado/ajustado. */
    public function show(Request $request, $id)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $conteo = DB::table('pc_conteos')->where('id_conteo', $id)->first();
        if (!$conteo) return response()->json(['error' => true, 'mensaje' => 'Conteo no encontrado'], 404);

        $detalle = DB::table('pc_conteo_detalle as d')
            ->leftJoin('pc_usuarios as u', 'u.id_usuario', '=', 'd.id_usuario')
            ->where('d.id_conteo', $id)
            ->select('d.*', 'u.nombre as usuario')->get()->keyBy('id_producto');

        if ($conteo->estado === 'abierto') {
            $productos = $this->productosAlcance($conteo)->get();
        } else {
            $productos = $this->consultaProductos()->whereIn('pr.id_producto', $detalle->keys())->get();
        }

        foreach ($productos as $p) {
            $d = $detalle[$p->id_producto] ?? null;
            $p->contado = $d ? (int) $d->contado : null;
            $p->stock_sistema = $d ? (int) $d->stock_sistema : null;
            $p->diferencia = $d ? (int) $d->diferencia : null;
            $p->stock_antes = $d->stock_antes ?? null;
            $p->stock_final = $d->stock_final ?? null;
            $p->contado_por = $d->usuario ?? null;
            $p->contado_at = $d->updated_at ?? null;
            if ($d && $d->costo !== null) $p->costo = (float) $d->costo;
        }

        return response()->json(['error' => false, 'conteo' => $conteo, 'productos' => $productos]);
    }

    /** Guarda (o quita, si contado es null) el conteo de un producto */
    public function guardarItem(Request $request, $id)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $this->validate($request, ['id_producto' => 'required|integer', 'contado' => 'nullable|integer|min:0|max:9999999']);

        $conteo = DB::table('pc_conteos')->where('id_conteo', $id)->first();
        if (!$conteo) return response()->json(['error' => true, 'mensaje' => 'Conteo no encontrado'], 404);
        if ($conteo->estado !== 'abierto') return response()->json(['error' => true, 'mensaje' => 'Este conteo ya fue ' . $conteo->estado . ' y no se puede modificar'], 409);

        $prod = $this->productosAlcance($conteo)->where('pr.id_producto', $request->id_producto)->first();
        if (!$prod) return response()->json(['error' => true, 'mensaje' => 'El producto no pertenece a este conteo'], 422);

        if ($request->contado === null || $request->contado === '') {
            DB::table('pc_conteo_detalle')->where('id_conteo', $id)->where('id_producto', $prod->id_producto)->delete();
            return response()->json(['error' => false, 'item' => null]);
        }

        // El stock del sistema se toma en el momento de contar (si se recuenta, se toma de nuevo)
        $contado = (int) $request->contado;
        $item = [
            'stock_sistema' => (int) $prod->stock,
            'contado' => $contado,
            'diferencia' => $contado - (int) $prod->stock,
            'costo' => $prod->costo,
            'id_usuario' => $request->usuario->id_usuario,
            'updated_at' => Carbon::now(),
        ];
        DB::table('pc_conteo_detalle')->updateOrInsert(['id_conteo' => $id, 'id_producto' => $prod->id_producto], $item + ['created_at' => Carbon::now()]);
        DB::table('pc_conteos')->where('id_conteo', $id)->update(['updated_at' => Carbon::now()]);

        return response()->json(['error' => false, 'item' => $item + ['id_producto' => $prod->id_producto, 'contado_por' => $request->usuario->nombre]]);
    }

    /** Aplica los ajustes al inventario. Opcional: los productos del alcance no contados quedan en 0. */
    public function aplicar(Request $request, $id)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $ceros = filter_var($request->input('no_contados_en_cero', false), FILTER_VALIDATE_BOOLEAN);

        $res = DB::transaction(function () use ($id, $ceros, $request) {
            $conteo = DB::table('pc_conteos')->where('id_conteo', $id)->lockForUpdate()->first();
            if (!$conteo) return [404, 'Conteo no encontrado'];
            if ($conteo->estado !== 'abierto') return [409, 'Este conteo ya fue ' . $conteo->estado];

            $ahora = Carbon::now();
            if ($ceros) {
                $contados = DB::table('pc_conteo_detalle')->where('id_conteo', $id)->pluck('id_producto');
                foreach ($this->productosAlcance($conteo)->whereNotIn('pr.id_producto', $contados)->get() as $p) {
                    DB::table('pc_conteo_detalle')->insert([
                        'id_conteo' => $id, 'id_producto' => $p->id_producto, 'stock_sistema' => (int) $p->stock,
                        'contado' => 0, 'diferencia' => -(int) $p->stock, 'costo' => $p->costo,
                        'id_usuario' => $request->usuario->id_usuario, 'created_at' => $ahora, 'updated_at' => $ahora,
                    ]);
                }
            }

            $detalle = DB::table('pc_conteo_detalle')->where('id_conteo', $id)->get();
            if ($detalle->isEmpty()) return [422, 'No hay productos contados para aplicar'];

            $stocks = DB::table('pc_productos')->whereIn('id_producto', $detalle->pluck('id_producto'))->lockForUpdate()->pluck('stock', 'id_producto');
            $ajustados = 0; $unidades = 0; $valor = 0;
            foreach ($detalle as $d) {
                $antes = (int) ($stocks[$d->id_producto] ?? 0);
                $ajuste = (int) $d->contado - (int) $d->stock_sistema;   // diferencia del conteo
                $final = max(0, $antes + $ajuste);                       // conserva lo vendido mientras se contaba
                if ($final !== $antes) {
                    DB::table('pc_productos')->where('id_producto', $d->id_producto)->update(['stock' => $final, 'updated_at' => $ahora]);
                }
                DB::table('pc_conteo_detalle')->where('id_detalle', $d->id_detalle)->update(['stock_antes' => $antes, 'stock_final' => $final]);
                if ($ajuste !== 0) {
                    $ajustados++;
                    $unidades += $ajuste;
                    $valor += $ajuste * (float) ($d->costo ?? 0);
                }
            }

            DB::table('pc_conteos')->where('id_conteo', $id)->update([
                'estado' => 'aplicado', 'no_contados_en_cero' => $ceros ? 1 : 0,
                'productos_ajustados' => $ajustados, 'unidades_ajuste' => $unidades, 'valor_ajuste' => round($valor, 2),
                'id_usuario_aplica' => $request->usuario->id_usuario, 'aplicado_at' => $ahora, 'updated_at' => $ahora,
            ]);
            return [200, "Inventario ajustado: {$ajustados} producto(s) con diferencia"];
        });

        return response()->json(['error' => $res[0] !== 200, 'mensaje' => $res[1]], $res[0]);
    }

    public function cancelar(Request $request, $id)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $n = DB::table('pc_conteos')->where('id_conteo', $id)->where('estado', 'abierto')
            ->update(['estado' => 'cancelado', 'updated_at' => Carbon::now()]);
        if (!$n) return response()->json(['error' => true, 'mensaje' => 'Solo se pueden cancelar conteos abiertos'], 409);
        return response()->json(['error' => false, 'mensaje' => 'Conteo cancelado. El inventario no se modificó.']);
    }

    // ---------- Consultas ----------

    private function consultaProductos()
    {
        $q = DB::table('pc_productos as pr')
            ->leftJoin('pc_categorias as c', 'c.id_categoria', '=', 'pr.id_categoria')
            ->select('pr.id_producto', 'pr.codigo', 'pr.nombre', 'pr.foto', 'pr.stock', 'pr.unidades_por_caja', 'pr.precio', 'c.nombre as categoria');
        // Valorización: precio de costo si lo tiene, si no el precio de venta
        $q->addSelect(Schema::hasColumn('pc_productos', 'precio_costo')
            ? DB::raw('COALESCE(NULLIF(pr.precio_costo, 0), pr.precio) as costo')
            : DB::raw('pr.precio as costo'));
        return $q->orderBy('pr.nombre');
    }

    private function productosAlcance($conteo)
    {
        $q = $this->consultaProductos()->where('pr.activo', 1);
        switch ($conteo->alcance) {
            case 'catalogo':
                $q->whereIn('pr.id_producto', DB::table('pc_catalogo_producto')->where('id_catalogo', $conteo->id_alcance)->select('id_producto'));
                break;
            case 'categoria':
                $q->where('pr.id_categoria', $conteo->id_alcance);
                break;
            case 'proveedor':
                $q->where('pr.id_proveedor', $conteo->id_alcance);
                break;
        }
        return $q;
    }
}
