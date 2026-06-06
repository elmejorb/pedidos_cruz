<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Ruta;

class RutaController extends Controller
{
    public function index(Request $request)
    {
        $rutas = Ruta::where('activo', 1)->orderBy('nombre')->get();
        return response()->json(['error' => false, 'rutas' => $rutas]);
    }

    public function store(Request $request)
    {
        if ($request->usuario->rol !== 'admin') {
            return response()->json(['error' => true, 'mensaje' => 'No tienes permisos'], 403);
        }
        $this->validate($request, [
            'nombre' => 'required|string|max:120',
        ]);

        $ruta = Ruta::create([
            'nombre' => $request->nombre,
            'descripcion' => $request->descripcion,
            'color' => $request->color ?? '#6366F1',
            'activo' => 1,
        ]);

        return response()->json(['error' => false, 'mensaje' => 'Ruta creada', 'ruta' => $ruta], 201);
    }

    public function update(Request $request, $id)
    {
        if ($request->usuario->rol !== 'admin') {
            return response()->json(['error' => true, 'mensaje' => 'No tienes permisos'], 403);
        }
        $ruta = Ruta::find($id);
        if (!$ruta) return response()->json(['error' => true, 'mensaje' => 'Ruta no encontrada'], 404);

        $ruta->fill($request->only(['nombre', 'descripcion', 'color']));
        $ruta->save();

        return response()->json(['error' => false, 'mensaje' => 'Ruta actualizada', 'ruta' => $ruta]);
    }

    public function destroy(Request $request, $id)
    {
        if ($request->usuario->rol !== 'admin') {
            return response()->json(['error' => true, 'mensaje' => 'No tienes permisos'], 403);
        }
        $ruta = Ruta::find($id);
        if (!$ruta) return response()->json(['error' => true, 'mensaje' => 'Ruta no encontrada'], 404);
        $ruta->activo = 0;
        $ruta->save();
        return response()->json(['error' => false, 'mensaje' => 'Ruta eliminada']);
    }
}
