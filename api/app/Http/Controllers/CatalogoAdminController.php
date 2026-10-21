<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\Catalogo;
use App\Models\Proveedor;

/** Gestión de catálogos (asignación de productos y vendedores) y proveedores */
class CatalogoAdminController extends Controller
{
    private function soloAdmin(Request $request)
    {
        if ($request->usuario->rol !== 'admin') {
            return response()->json(['error' => true, 'mensaje' => 'Solo el administrador puede gestionar catálogos'], 403);
        }
        return null;
    }

    // ---------------- Catálogos ----------------

    /** Admin: todos con conteos. Vendedor: solo los suyos (para compartir el enlace). */
    public function index(Request $request)
    {
        $u = $request->usuario;
        $q = Catalogo::where('activo', 1)
            ->withCount('productos')
            ->with('vendedores:pc_usuarios.id_usuario,nombre');

        if ($u->rol !== 'admin') {
            $q->whereHas('vendedores', fn($v) => $v->where('pc_usuarios.id_usuario', $u->id_usuario));
        }

        return response()->json([
            'error' => false,
            'catalogos' => $q->orderBy('nombre')->get(),
            'catalogo_general_publico' => Catalogo::ajuste('catalogo_general_publico', '1') === '1',
        ]);
    }

    public function store(Request $request)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $this->validate($request, ['nombre' => 'required|string|max:120']);

        $c = Catalogo::create([
            'nombre' => trim($request->nombre),
            'descripcion' => $request->descripcion,
            'color' => $this->color($request->color),
            'codigo' => Catalogo::nuevoCodigo(),
            'activo' => 1,
        ]);
        if ($request->has('vendedores')) $c->vendedores()->sync($this->ids($request->vendedores));

        return response()->json(['error' => false, 'mensaje' => 'Catálogo creado', 'catalogo' => $c->loadCount('productos')], 201);
    }

    public function update(Request $request, $id)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $c = Catalogo::find($id);
        if (!$c) return response()->json(['error' => true, 'mensaje' => 'Catálogo no encontrado'], 404);

        if ($request->has('nombre')) $c->nombre = trim($request->nombre);
        if ($request->has('descripcion')) $c->descripcion = $request->descripcion;
        if ($request->has('color')) $c->color = $this->color($request->color);
        $c->save();
        if ($request->has('vendedores')) $c->vendedores()->sync($this->ids($request->vendedores));
        if ($request->boolean('nuevo_codigo')) { $c->codigo = Catalogo::nuevoCodigo(); $c->save(); }

        return response()->json(['error' => false, 'mensaje' => 'Catálogo actualizado', 'catalogo' => $c->loadCount('productos')]);
    }

    public function destroy(Request $request, $id)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $c = Catalogo::find($id);
        if (!$c) return response()->json(['error' => true, 'mensaje' => 'Catálogo no encontrado'], 404);
        $c->productos()->detach();
        $c->vendedores()->detach();
        $c->delete();
        return response()->json(['error' => false, 'mensaje' => 'Catálogo eliminado']);
    }

    /** IDs de los productos del catálogo */
    public function productos(Request $request, $id)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $ids = DB::table('pc_catalogo_producto')->where('id_catalogo', $id)->pluck('id_producto');
        return response()->json(['error' => false, 'productos' => $ids]);
    }

    /** Reemplaza el conjunto de productos del catálogo */
    public function guardarProductos(Request $request, $id)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $c = Catalogo::find($id);
        if (!$c) return response()->json(['error' => true, 'mensaje' => 'Catálogo no encontrado'], 404);
        $c->productos()->sync($this->ids($request->input('productos', [])));
        return response()->json(['error' => false, 'mensaje' => 'Productos del catálogo actualizados', 'total' => $c->productos()->count()]);
    }

    public function ajustes(Request $request)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        if ($request->has('catalogo_general_publico')) {
            DB::table('pc_ajustes')->updateOrInsert(
                ['clave' => 'catalogo_general_publico'],
                ['valor' => $request->boolean('catalogo_general_publico') ? '1' : '0']
            );
        }
        return response()->json(['error' => false, 'mensaje' => 'Ajustes guardados']);
    }

    // ---------------- Proveedores ----------------

    public function proveedores(Request $request)
    {
        $q = Proveedor::where('activo', 1)->orderBy('nombre');
        if ($request->usuario->rol === 'admin') {
            $q->withCount(['productos' => fn($p) => $p->where('activo', 1)]);
        }
        return response()->json(['error' => false, 'proveedores' => $q->get()]);
    }

    public function guardarProveedor(Request $request, $id = null)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $this->validate($request, ['nombre' => 'required|string|max:150']);
        $p = $id ? Proveedor::find($id) : new Proveedor(['activo' => 1]);
        if (!$p) return response()->json(['error' => true, 'mensaje' => 'Proveedor no encontrado'], 404);
        $p->fill($request->only(['nombre', 'nit', 'telefono', 'contacto']))->save();
        return response()->json(['error' => false, 'mensaje' => $id ? 'Proveedor actualizado' : 'Proveedor creado', 'proveedor' => $p], $id ? 200 : 201);
    }

    public function eliminarProveedor(Request $request, $id)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $p = Proveedor::find($id);
        if (!$p) return response()->json(['error' => true, 'mensaje' => 'Proveedor no encontrado'], 404);
        $p->update(['activo' => 0]);
        DB::table('pc_productos')->where('id_proveedor', $id)->update(['id_proveedor' => null]);
        return response()->json(['error' => false, 'mensaje' => 'Proveedor eliminado']);
    }

    private function ids($lista): array
    {
        return array_values(array_unique(array_filter(array_map('intval', (array) $lista))));
    }

    private function color($c): string
    {
        return preg_match('/^#[0-9A-Fa-f]{6}$/', (string) $c) ? strtoupper($c) : '#6366F1';
    }
}
