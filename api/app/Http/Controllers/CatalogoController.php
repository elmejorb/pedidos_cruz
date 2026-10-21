<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Producto;
use App\Models\Categoria;
use App\Models\Catalogo;
use Illuminate\Support\Facades\DB;

class CatalogoController extends Controller
{
    /**
     * Catálogo de un enlace (?c=codigo) o el general.
     * Devuelve [catalogo|null, error|null]
     */
    private function resolverCatalogo(Request $request): array
    {
        if (!Catalogo::habilitado()) return [null, null];
        $codigo = trim((string) $request->input('c', ''));
        if ($codigo !== '') {
            $cat = Catalogo::where('codigo', $codigo)->where('activo', 1)->first();
            return $cat ? [$cat, null] : [null, 'Este enlace de catálogo no es válido o ya no está disponible. Pide uno nuevo a tu vendedor.'];
        }
        if (Catalogo::ajuste('catalogo_general_publico', '1') !== '1') {
            return [null, 'Pide a tu vendedor el enlace de tu catálogo para ver los productos.'];
        }
        return [null, null];
    }

    private function idsCatalogo(Catalogo $cat)
    {
        return DB::table('pc_catalogo_producto')->where('id_catalogo', $cat->id_catalogo)->pluck('id_producto');
    }

    public function index(Request $request)
    {
        [$catalogo, $error] = $this->resolverCatalogo($request);
        if ($error) {
            return response()->json(['error' => false, 'privado' => true, 'mensaje' => $error, 'productos' => [], 'total' => 0]);
        }

        $query = Producto::with('categoria:id_categoria,nombre')
            ->where('activo', 1)
            ->select('id_producto', 'codigo', 'nombre', 'descripcion', 'id_categoria', 'precio', 'foto');

        if ($catalogo) $query->whereIn('id_producto', $this->idsCatalogo($catalogo));

        if ($request->has('id_categoria') && $request->id_categoria) {
            $query->where('id_categoria', $request->id_categoria);
        }

        if ($request->has('buscar') && $request->buscar) {
            $term = $request->buscar;
            $query->where(function ($q) use ($term) {
                $q->where('nombre', 'LIKE', "%{$term}%")
                  ->orWhere('codigo', 'LIKE', "%{$term}%");
            });
        }

        $productos = $query->orderBy('nombre')->get();

        return response()->json([
            'error' => false,
            'productos' => $productos,
            'total' => $productos->count(),
            'catalogo' => $catalogo ? ['nombre' => $catalogo->nombre, 'descripcion' => $catalogo->descripcion, 'color' => $catalogo->color] : null,
        ]);
    }

    public function categorias(Request $request)
    {
        [$catalogo, $error] = $this->resolverCatalogo($request);
        if ($error) return response()->json(['error' => false, 'categorias' => []]);

        $q = Categoria::where('activo', 1)->select('id_categoria', 'nombre')->orderBy('nombre');
        // En un catálogo, solo las categorías que tienen productos en él
        if ($catalogo) {
            $q->whereIn('id_categoria', Producto::whereIn('id_producto', $this->idsCatalogo($catalogo))
                ->where('activo', 1)->whereNotNull('id_categoria')->distinct()->pluck('id_categoria'));
        }
        $categorias = $q->get();

        return response()->json([
            'error' => false,
            'categorias' => $categorias,
        ]);
    }
}
