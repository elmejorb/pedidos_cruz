<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Producto;
use App\Models\Categoria;
use App\Models\Catalogo;
use Illuminate\Support\Facades\DB;

class ProductoController extends Controller
{
    /** Relaciones a cargar según lo que ya esté migrado */
    private function relaciones(): array
    {
        $rel = ['categoria'];
        if (Catalogo::habilitado()) $rel[] = 'proveedor:id_proveedor,nombre';
        return $rel;
    }

    /** Agrega ids de catálogos (admin) y oculta el costo a vendedores */
    private function presentar($productos, $usuario)
    {
        $admin = $usuario && $usuario->rol === 'admin';
        if (Catalogo::habilitado()) {
            $map = DB::table('pc_catalogo_producto')
                ->whereIn('id_producto', $productos->pluck('id_producto'))
                ->get()->groupBy('id_producto');
            $productos->each(fn($p) => $p->setAttribute('catalogos', ($map[$p->id_producto] ?? collect())->pluck('id_catalogo')->values()));
        }
        if (!$admin) $productos->each(fn($p) => $p->makeHidden(['precio_costo']));
        return $productos;
    }

    public function index(Request $request)
    {
        $query = Producto::with($this->relaciones())->where('activo', 1);

        // Vendedor con catálogos asignados: solo ve esos productos
        $permitidos = Catalogo::productosPermitidos($request->usuario);
        if ($permitidos !== null) $query->whereIn('id_producto', $permitidos ?: [0]);

        if ($request->id_catalogo && Catalogo::habilitado()) {
            $query->whereIn('id_producto', DB::table('pc_catalogo_producto')->where('id_catalogo', $request->id_catalogo)->pluck('id_producto'));
        }

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

        $productos = $query->orderBy('id_producto', 'desc')->get();

        return response()->json(['error' => false, 'productos' => $this->presentar($productos, $request->usuario)]);
    }

    public function show(Request $request, $id)
    {
        $producto = Producto::with($this->relaciones())->find($id);
        $permitidos = Catalogo::productosPermitidos($request->usuario);

        if (!$producto || ($permitidos !== null && !in_array((int) $id, $permitidos))) {
            return response()->json(['error' => true, 'mensaje' => 'Producto no encontrado'], 404);
        }

        $this->presentar(collect([$producto]), $request->usuario);
        return response()->json(['error' => false, 'producto' => $producto]);
    }

    /** Proveedor, costo y catálogos (solo si ya existen en la BD) */
    private function guardarClasificacion(Request $request, Producto $producto): void
    {
        $datos = [];
        if ($request->has('id_proveedor')) $datos['id_proveedor'] = $request->id_proveedor ?: null;
        if ($request->has('precio_costo')) {
            $c = $request->precio_costo;
            $datos['precio_costo'] = ($c === null || $c === '') ? null : max(0, (float) $c);
        }
        $datos = $this->soloColumnasExistentes('pc_productos', $datos);
        if ($datos) $producto->fill($datos)->save();

        if ($request->has('catalogos') && Catalogo::habilitado()) {
            $producto->catalogos()->sync(array_values(array_filter(array_map('intval', (array) $request->catalogos))));
        }
    }

    public function store(Request $request)
    {
        if ($request->usuario->rol !== 'admin') {
            return response()->json(['error' => true, 'mensaje' => 'No tienes permisos para crear productos'], 403);
        }
        $this->validate($request, [
            'nombre' => 'required|string|max:200',
            'precio' => 'required|numeric|min:0',
        ]);

        $producto = Producto::create([
            'codigo' => $request->codigo,
            'nombre' => $request->nombre,
            'descripcion' => $request->descripcion,
            'id_categoria' => $request->id_categoria,
            'precio' => $request->precio,
            'stock' => $request->stock ?? 0,
            'stock_minimo' => $request->stock_minimo ?? 5,
            'unidades_por_caja' => $request->unidades_por_caja ?? 1,
            'activo' => 1,
        ]);

        $fiscal = $this->soloColumnasExistentes('pc_productos', $request->only(['iva', 'unit_measure_id']));
        if ($fiscal) $producto->fill($fiscal)->save();
        $this->guardarClasificacion($request, $producto);

        return response()->json([
            'error' => false,
            'mensaje' => 'Producto creado',
            'producto' => $producto->load($this->relaciones())
        ], 201);
    }

    public function update(Request $request, $id)
    {
        if ($request->usuario->rol !== 'admin') {
            return response()->json(['error' => true, 'mensaje' => 'No tienes permisos para editar productos'], 403);
        }
        $producto = Producto::find($id);
        if (!$producto) {
            return response()->json(['error' => true, 'mensaje' => 'Producto no encontrado'], 404);
        }

        $producto->fill($request->only([
            'codigo', 'nombre', 'descripcion', 'id_categoria',
            'precio', 'stock', 'stock_minimo', 'unidades_por_caja'
        ]));
        $producto->fill($this->soloColumnasExistentes('pc_productos', $request->only(['iva', 'unit_measure_id'])));
        $producto->save();
        $this->guardarClasificacion($request, $producto);

        return response()->json([
            'error' => false,
            'mensaje' => 'Producto actualizado',
            'producto' => $producto->load('categoria')
        ]);
    }

    public function destroy(Request $request, $id)
    {
        if ($request->usuario->rol !== 'admin') {
            return response()->json(['error' => true, 'mensaje' => 'No tienes permisos para eliminar productos'], 403);
        }
        $producto = Producto::find($id);
        if (!$producto) {
            return response()->json(['error' => true, 'mensaje' => 'Producto no encontrado'], 404);
        }

        $producto->activo = 0;
        $producto->save();

        return response()->json(['error' => false, 'mensaje' => 'Producto eliminado']);
    }

    public function uploadFoto(Request $request, $id)
    {
        if ($request->usuario->rol !== 'admin') {
            return response()->json(['error' => true, 'mensaje' => 'No tienes permisos para subir fotos'], 403);
        }
        $producto = Producto::find($id);
        if (!$producto) {
            return response()->json(['error' => true, 'mensaje' => 'Producto no encontrado'], 404);
        }

        if (!$request->hasFile('foto')) {
            return response()->json(['error' => true, 'mensaje' => 'No se envió imagen'], 400);
        }

        $file = $request->file('foto');
        $filename = 'prod_' . $id . '_' . time() . '.' . $file->getClientOriginalExtension();

        $uploadPath = base_path('public/uploads/productos');
        if (!is_dir($uploadPath)) {
            mkdir($uploadPath, 0755, true);
        }

        $file->move($uploadPath, $filename);

        // Delete old photo
        if ($producto->foto && file_exists($uploadPath . '/' . $producto->foto)) {
            unlink($uploadPath . '/' . $producto->foto);
        }

        $producto->foto = $filename;
        $producto->save();

        return response()->json([
            'error' => false,
            'mensaje' => 'Foto actualizada',
            'foto' => $filename
        ]);
    }

    public function categorias()
    {
        $categorias = Categoria::where('activo', 1)->orderBy('nombre')->get();
        return response()->json(['error' => false, 'categorias' => $categorias]);
    }

    public function storeCategoria(Request $request)
    {
        if ($request->usuario->rol !== 'admin') {
            return response()->json(['error' => true, 'mensaje' => 'No tienes permisos para crear categorías'], 403);
        }
        $this->validate($request, ['nombre' => 'required|string|max:100']);

        $categoria = Categoria::create([
            'nombre' => $request->nombre,
            'descripcion' => $request->descripcion,
            'activo' => 1,
        ]);

        return response()->json(['error' => false, 'mensaje' => 'Categoría creada', 'categoria' => $categoria], 201);
    }
}
