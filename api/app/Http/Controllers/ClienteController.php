<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Cliente;

class ClienteController extends Controller
{
    public function index(Request $request)
    {
        $query = Cliente::with(['vendedor:id_usuario,nombre', 'ruta'])->where('activo', 1);

        $usuario = $request->usuario;
        if ($usuario->rol !== 'admin' && $request->has('mis_clientes')) {
            $query->where('id_vendedor', $usuario->id_usuario);
        }

        if ($request->has('id_ruta') && $request->id_ruta) {
            $query->where('id_ruta', $request->id_ruta);
        }

        if ($request->has('buscar') && $request->buscar) {
            $term = $request->buscar;
            $query->where(function ($q) use ($term) {
                $q->where('nombre', 'LIKE', "%{$term}%")
                  ->orWhere('razon_social', 'LIKE', "%{$term}%")
                  ->orWhere('nit_cedula', 'LIKE', "%{$term}%")
                  ->orWhere('telefono', 'LIKE', "%{$term}%");
            });
        }

        $clientes = $query->orderBy('nombre')->get();

        return response()->json(['error' => false, 'clientes' => $clientes]);
    }

    public function show($id)
    {
        $cliente = Cliente::with(['vendedor:id_usuario,nombre', 'ruta'])->find($id);

        if (!$cliente) {
            return response()->json(['error' => true, 'mensaje' => 'Cliente no encontrado'], 404);
        }

        return response()->json(['error' => false, 'cliente' => $cliente]);
    }

    public function store(Request $request)
    {
        $this->validate($request, [
            'nombre' => 'required|string|max:200',
        ]);

        $cliente = Cliente::create([
            'nombre' => $request->nombre,
            'razon_social' => $request->razon_social,
            'nit_cedula' => $request->nit_cedula,
            'email' => $request->email,
            'telefono' => $request->telefono,
            'direccion' => $request->direccion,
            'ciudad' => $request->ciudad,
            'id_ruta' => $request->id_ruta ?: null,
            'notas' => $request->notas,
            'id_vendedor' => $request->usuario->id_usuario,
            'activo' => 1,
        ]);

        return response()->json([
            'error' => false,
            'mensaje' => 'Cliente creado',
            'cliente' => $cliente->load(['vendedor:id_usuario,nombre', 'ruta'])
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $cliente = Cliente::find($id);
        if (!$cliente) {
            return response()->json(['error' => true, 'mensaje' => 'Cliente no encontrado'], 404);
        }

        $cliente->fill($request->only([
            'nombre', 'razon_social', 'nit_cedula', 'email', 'telefono',
            'direccion', 'ciudad', 'notas'
        ]));
        if ($request->has('id_ruta')) $cliente->id_ruta = $request->id_ruta ?: null;
        $cliente->save();

        return response()->json([
            'error' => false,
            'mensaje' => 'Cliente actualizado',
            'cliente' => $cliente->load(['vendedor:id_usuario,nombre', 'ruta'])
        ]);
    }

    public function destroy($id)
    {
        $cliente = Cliente::find($id);
        if (!$cliente) {
            return response()->json(['error' => true, 'mensaje' => 'Cliente no encontrado'], 404);
        }

        $cliente->activo = 0;
        $cliente->save();

        return response()->json(['error' => false, 'mensaje' => 'Cliente eliminado']);
    }
}
