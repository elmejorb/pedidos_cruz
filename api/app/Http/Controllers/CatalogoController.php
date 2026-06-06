<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Producto;
use App\Models\Categoria;

class CatalogoController extends Controller
{
    public function index(Request $request)
    {
        $query = Producto::with('categoria:id_categoria,nombre')
            ->where('activo', 1)
            ->select('id_producto', 'codigo', 'nombre', 'descripcion', 'id_categoria', 'precio', 'foto');

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
        ]);
    }

    public function categorias()
    {
        $categorias = Categoria::where('activo', 1)
            ->select('id_categoria', 'nombre')
            ->orderBy('nombre')
            ->get();

        return response()->json([
            'error' => false,
            'categorias' => $categorias,
        ]);
    }
}
