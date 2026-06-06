<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Pedido;
use App\Models\PedidoDetalle;
use App\Models\PedidoHistorial;
use App\Models\Producto;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class PedidoController extends Controller
{
    public function index(Request $request)
    {
        $query = Pedido::with([
            'cliente:id_cliente,nombre,razon_social,telefono',
            'vendedor:id_usuario,nombre',
            'ruta'
        ]);

        $usuario = $request->usuario;
        if ($usuario->rol !== 'admin') {
            $query->where('id_vendedor', $usuario->id_usuario);
        }

        if ($request->has('estado') && $request->estado) {
            $query->where('estado', $request->estado);
        }

        if ($request->has('id_ruta') && $request->id_ruta) {
            $query->where('id_ruta', $request->id_ruta);
        }

        if ($request->has('fecha_desde') && $request->fecha_desde) {
            $query->whereDate('fecha_pedido', '>=', $request->fecha_desde);
        }

        if ($request->has('fecha_hasta') && $request->fecha_hasta) {
            $query->whereDate('fecha_pedido', '<=', $request->fecha_hasta);
        }

        if ($request->has('buscar') && $request->buscar) {
            $term = $request->buscar;
            $query->where(function ($q) use ($term) {
                $q->where('numero_pedido', 'LIKE', "%{$term}%")
                  ->orWhereHas('cliente', function ($q2) use ($term) {
                      $q2->where('nombre', 'LIKE', "%{$term}%");
                  });
            });
        }

        $pedidos = $query->orderBy('created_at', 'desc')->get();

        return response()->json(['error' => false, 'pedidos' => $pedidos]);
    }

    public function show($id)
    {
        $pedido = Pedido::with([
            'cliente',
            'vendedor:id_usuario,nombre',
            'ruta',
            'detalles.producto:id_producto,nombre,codigo,foto,precio,unidades_por_caja',
            'historial.usuario:id_usuario,nombre'
        ])->find($id);

        if (!$pedido) {
            return response()->json(['error' => true, 'mensaje' => 'Pedido no encontrado'], 404);
        }

        return response()->json(['error' => false, 'pedido' => $pedido]);
    }

    public function store(Request $request)
    {
        $this->validate($request, [
            'id_cliente' => 'required|integer|exists:pc_clientes,id_cliente',
            'id_ruta' => 'required|integer|exists:pc_rutas,id_ruta',
            'items' => 'required|array|min:1',
            'items.*.id_producto' => 'required|integer|exists:pc_productos,id_producto',
            'items.*.cantidad' => 'required|integer|min:1',
        ]);

        $usuario = $request->usuario;

        try {
            DB::beginTransaction();

            // Generate order number
            $year = date('Y');
            $lastPedido = Pedido::whereYear('created_at', $year)->orderBy('id_pedido', 'desc')->first();
            $nextNum = $lastPedido ? ((int) substr($lastPedido->numero_pedido, -5)) + 1 : 1;
            $numeroPedido = 'PED-' . $year . '-' . str_pad($nextNum, 5, '0', STR_PAD_LEFT);

            $subtotal = 0;
            $itemsData = [];

            foreach ($request->items as $item) {
                $producto = Producto::find($item['id_producto']);
                $tipoUnidad = ($item['tipo_unidad'] ?? 'unidad') === 'caja' ? 'caja' : 'unidad';
                $upc = max(1, (int) ($producto->unidades_por_caja ?? 1));
                $cant = (int) $item['cantidad'];
                $unidadesEquivalentes = $tipoUnidad === 'caja' ? $cant * $upc : $cant;

                $precioUnit = $item['precio_unitario']
                    ?? ($tipoUnidad === 'caja' ? $producto->precio * $upc : $producto->precio);

                $desc = $item['descuento'] ?? 0;
                $lineSubtotal = ($precioUnit * $cant) - $desc;

                $itemsData[] = [
                    'id_producto' => $producto->id_producto,
                    'cantidad' => $cant,
                    'tipo_unidad' => $tipoUnidad,
                    'unidades_equivalentes' => $unidadesEquivalentes,
                    'precio_unitario' => $precioUnit,
                    'descuento' => $desc,
                    'subtotal' => $lineSubtotal,
                ];

                $subtotal += $lineSubtotal;

                // Decrease stock in equivalent units
                $producto->stock = max(0, $producto->stock - $unidadesEquivalentes);
                $producto->save();
            }

            $descuento = $request->descuento ?? 0;
            $impuesto = $request->impuesto ?? 0;
            $total = $subtotal - $descuento + $impuesto;

            $pedido = Pedido::create([
                'numero_pedido' => $numeroPedido,
                'id_cliente' => $request->id_cliente,
                'id_vendedor' => $usuario->id_usuario,
                'id_ruta' => $request->id_ruta ?: null,
                'fecha_pedido' => Carbon::now(),
                'fecha_entrega' => $request->fecha_entrega,
                'estado' => 'pendiente',
                'subtotal' => $subtotal,
                'descuento' => $descuento,
                'impuesto' => $impuesto,
                'total' => $total,
                'notas' => $request->notas,
            ]);

            foreach ($itemsData as $itemData) {
                $itemData['id_pedido'] = $pedido->id_pedido;
                PedidoDetalle::create($itemData);
            }

            // History entry
            PedidoHistorial::create([
                'id_pedido' => $pedido->id_pedido,
                'estado_anterior' => null,
                'estado_nuevo' => 'pendiente',
                'id_usuario' => $usuario->id_usuario,
                'comentario' => 'Pedido creado',
                'fecha' => Carbon::now(),
            ]);

            DB::commit();

            return response()->json([
                'error' => false,
                'mensaje' => 'Pedido creado exitosamente',
                'pedido' => $pedido->load(['cliente', 'detalles.producto', 'vendedor:id_usuario,nombre'])
            ], 201);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'error' => true,
                'mensaje' => 'Error al crear pedido: ' . $e->getMessage()
            ], 500);
        }
    }

    public function cambiarEstado(Request $request, $id)
    {
        $this->validate($request, [
            'estado' => 'required|in:pendiente,procesando,enviado,entregado,cancelado',
        ]);

        $pedido = Pedido::find($id);
        if (!$pedido) {
            return response()->json(['error' => true, 'mensaje' => 'Pedido no encontrado'], 404);
        }

        $estadoAnterior = $pedido->estado;
        $pedido->estado = $request->estado;
        $pedido->save();

        // If cancelled, restore stock (equivalent units)
        if ($request->estado === 'cancelado') {
            $detalles = PedidoDetalle::where('id_pedido', $id)->get();
            foreach ($detalles as $detalle) {
                $producto = Producto::find($detalle->id_producto);
                if ($producto) {
                    $producto->stock += ($detalle->unidades_equivalentes ?? $detalle->cantidad);
                    $producto->save();
                }
            }
        }

        PedidoHistorial::create([
            'id_pedido' => $id,
            'estado_anterior' => $estadoAnterior,
            'estado_nuevo' => $request->estado,
            'id_usuario' => $request->usuario->id_usuario,
            'comentario' => $request->comentario ?? 'Cambio de estado',
            'fecha' => Carbon::now(),
        ]);

        return response()->json([
            'error' => false,
            'mensaje' => 'Estado actualizado',
            'pedido' => $pedido->load(['cliente', 'vendedor:id_usuario,nombre'])
        ]);
    }

    public function update(Request $request, $id)
    {
        $this->validate($request, [
            'items' => 'required|array|min:1',
            'items.*.id_producto' => 'required|integer|exists:pc_productos,id_producto',
            'items.*.cantidad' => 'required|integer|min:1',
        ]);

        $pedido = Pedido::find($id);
        if (!$pedido) {
            return response()->json(['error' => true, 'mensaje' => 'Pedido no encontrado'], 404);
        }

        $usuario = $request->usuario;

        try {
            DB::beginTransaction();

            // Restore stock from old items (use equivalent units)
            $oldDetalles = PedidoDetalle::where('id_pedido', $id)->get();
            foreach ($oldDetalles as $od) {
                $prod = Producto::find($od->id_producto);
                if ($prod) {
                    $unidadesARestituir = $od->unidades_equivalentes ?? $od->cantidad;
                    $prod->stock += $unidadesARestituir;
                    $prod->save();
                }
            }

            // Delete old items
            PedidoDetalle::where('id_pedido', $id)->delete();

            // Create new items + recalculate totals
            $subtotal = 0;
            foreach ($request->items as $item) {
                $producto = Producto::find($item['id_producto']);
                $tipoUnidad = ($item['tipo_unidad'] ?? 'unidad') === 'caja' ? 'caja' : 'unidad';
                $upc = max(1, (int) ($producto->unidades_por_caja ?? 1));
                $cant = (int) $item['cantidad'];
                $unidadesEquivalentes = $tipoUnidad === 'caja' ? $cant * $upc : $cant;

                $precioUnit = $item['precio_unitario']
                    ?? ($tipoUnidad === 'caja' ? $producto->precio * $upc : $producto->precio);

                $desc = $item['descuento'] ?? 0;
                $lineSubtotal = ($precioUnit * $cant) - $desc;

                PedidoDetalle::create([
                    'id_pedido' => $id,
                    'id_producto' => $producto->id_producto,
                    'cantidad' => $cant,
                    'tipo_unidad' => $tipoUnidad,
                    'unidades_equivalentes' => $unidadesEquivalentes,
                    'precio_unitario' => $precioUnit,
                    'descuento' => $desc,
                    'subtotal' => $lineSubtotal,
                ]);

                $subtotal += $lineSubtotal;

                // Decrease stock with equivalent units
                $producto->stock = max(0, $producto->stock - $unidadesEquivalentes);
                $producto->save();
            }

            $descuento = $request->descuento ?? 0;
            $impuesto = $request->impuesto ?? 0;
            $pedido->subtotal = $subtotal;
            $pedido->descuento = $descuento;
            $pedido->impuesto = $impuesto;
            $pedido->total = $subtotal - $descuento + $impuesto;
            if ($request->has('id_cliente')) $pedido->id_cliente = $request->id_cliente;
            if ($request->has('id_ruta')) $pedido->id_ruta = $request->id_ruta ?: null;
            if ($request->has('fecha_entrega')) $pedido->fecha_entrega = $request->fecha_entrega;
            if ($request->has('notas')) $pedido->notas = $request->notas;
            $pedido->save();

            // History entry
            PedidoHistorial::create([
                'id_pedido' => $id,
                'estado_anterior' => $pedido->estado,
                'estado_nuevo' => $pedido->estado,
                'id_usuario' => $usuario->id_usuario,
                'comentario' => 'Pedido modificado',
                'fecha' => Carbon::now(),
            ]);

            DB::commit();

            return response()->json([
                'error' => false,
                'mensaje' => 'Pedido actualizado',
                'pedido' => $pedido->load(['cliente', 'detalles.producto', 'vendedor:id_usuario,nombre'])
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['error' => true, 'mensaje' => 'Error al actualizar: ' . $e->getMessage()], 500);
        }
    }

    public function destroy($id)
    {
        $pedido = Pedido::find($id);
        if (!$pedido) {
            return response()->json(['error' => true, 'mensaje' => 'Pedido no encontrado'], 404);
        }

        // Restore stock (equivalent units)
        $detalles = PedidoDetalle::where('id_pedido', $id)->get();
        foreach ($detalles as $detalle) {
            $producto = Producto::find($detalle->id_producto);
            if ($producto) {
                $producto->stock += ($detalle->unidades_equivalentes ?? $detalle->cantidad);
                $producto->save();
            }
        }

        $pedido->delete();

        return response()->json(['error' => false, 'mensaje' => 'Pedido eliminado']);
    }

    public function despachoConsolidado(Request $request)
    {
        if ($request->usuario->rol !== 'admin') {
            return response()->json(['error' => true, 'mensaje' => 'No tienes permisos'], 403);
        }

        $this->validate($request, [
            'pedidos' => 'required|array|min:1',
            'pedidos.*' => 'integer',
        ]);

        $pedidos = Pedido::with([
            'cliente:id_cliente,nombre,razon_social,telefono,direccion',
            'vendedor:id_usuario,nombre',
            'ruta',
            'detalles.producto:id_producto,nombre,codigo,foto'
        ])->whereIn('id_pedido', $request->pedidos)->orderBy('numero_pedido')->get();

        // Consolidate products: sum quantities and equivalent units across all selected orders
        $consolidado = [];
        foreach ($pedidos as $pedido) {
            foreach ($pedido->detalles as $d) {
                $key = $d->id_producto;
                if (!isset($consolidado[$key])) {
                    $consolidado[$key] = [
                        'id_producto' => $d->id_producto,
                        'nombre' => $d->producto->nombre ?? 'Producto',
                        'codigo' => $d->producto->codigo ?? '',
                        'foto' => $d->producto->foto ?? null,
                        'total_unidades' => 0,
                        'total_cajas' => 0,
                        'unidades_equivalentes' => 0,
                    ];
                }
                if ($d->tipo_unidad === 'caja') {
                    $consolidado[$key]['total_cajas'] += $d->cantidad;
                } else {
                    $consolidado[$key]['total_unidades'] += $d->cantidad;
                }
                $consolidado[$key]['unidades_equivalentes'] += ($d->unidades_equivalentes ?? $d->cantidad);
            }
        }

        // Sort by name
        usort($consolidado, fn($a, $b) => strcmp($a['nombre'], $b['nombre']));

        return response()->json([
            'error' => false,
            'pedidos' => $pedidos,
            'consolidado' => array_values($consolidado),
            'total_pedidos' => count($pedidos),
        ]);
    }

    public function reporteVentas(Request $request)
    {
        if ($request->usuario->rol !== 'admin') {
            return response()->json(['error' => true, 'mensaje' => 'No tienes permisos para ver reportes'], 403);
        }

        $usuario = $request->usuario;
        $filtro = [];

        // Ventas por mes (último año)
        $ventasMensuales = Pedido::where('estado', '!=', 'cancelado')
            ->where($filtro)
            ->where('fecha_pedido', '>=', Carbon::now()->subMonths(12))
            ->select(
                DB::raw("DATE_FORMAT(fecha_pedido, '%Y-%m') as mes"),
                DB::raw('SUM(total) as total'),
                DB::raw('COUNT(*) as cantidad')
            )
            ->groupBy('mes')
            ->orderBy('mes')
            ->get();

        // Top productos
        $topProductos = PedidoDetalle::join('pc_pedidos', 'pc_pedido_detalle.id_pedido', '=', 'pc_pedidos.id_pedido')
            ->join('pc_productos', 'pc_pedido_detalle.id_producto', '=', 'pc_productos.id_producto')
            ->where('pc_pedidos.estado', '!=', 'cancelado')
            ->select(
                'pc_productos.nombre',
                DB::raw('SUM(pc_pedido_detalle.cantidad) as total_vendido'),
                DB::raw('SUM(pc_pedido_detalle.subtotal) as total_ingresos')
            )
            ->groupBy('pc_productos.id_producto', 'pc_productos.nombre')
            ->orderByDesc('total_vendido')
            ->limit(10)
            ->get();

        // Top clientes
        $topClientes = Pedido::join('pc_clientes', 'pc_pedidos.id_cliente', '=', 'pc_clientes.id_cliente')
            ->where('pc_pedidos.estado', '!=', 'cancelado')
            ->where($filtro ? ['pc_pedidos.id_vendedor' => $filtro['id_vendedor']] : [])
            ->select(
                'pc_clientes.nombre',
                DB::raw('COUNT(*) as total_pedidos'),
                DB::raw('SUM(pc_pedidos.total) as total_compras')
            )
            ->groupBy('pc_clientes.id_cliente', 'pc_clientes.nombre')
            ->orderByDesc('total_compras')
            ->limit(10)
            ->get();

        // Pedidos por estado
        $porEstado = Pedido::where($filtro)
            ->select('estado', DB::raw('COUNT(*) as cantidad'))
            ->groupBy('estado')
            ->get();

        return response()->json([
            'error' => false,
            'data' => [
                'ventas_mensuales' => $ventasMensuales,
                'top_productos' => $topProductos,
                'top_clientes' => $topClientes,
                'por_estado' => $porEstado,
            ]
        ]);
    }
}
