<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Pedido;
use App\Models\Cliente;
use App\Models\Producto;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class DashboardController extends Controller
{
    public function index(Request $request)
    {
        $usuario = $request->usuario;
        $esAdmin = $usuario->rol === 'admin';
        $filtroVendedor = $esAdmin ? [] : ['id_vendedor' => $usuario->id_usuario];

        $totalPedidos = Pedido::where($filtroVendedor)->count();
        $totalClientes = Cliente::where('activo', 1)->where($filtroVendedor ?: [])->count();
        $totalProductos = Producto::where('activo', 1)->count();
        $pedidosPendientes = Pedido::where('estado', 'pendiente')->where($filtroVendedor)->count();

        $ventasMes = Pedido::where('estado', '!=', 'cancelado')
            ->where($filtroVendedor)
            ->whereMonth('fecha_pedido', Carbon::now()->month)
            ->whereYear('fecha_pedido', Carbon::now()->year)
            ->sum('total');

        $productosBajoStock = Producto::where('activo', 1)
            ->whereColumn('stock', '<=', 'stock_minimo')
            ->count();

        $ultimosPedidos = Pedido::with(['cliente:id_cliente,nombre,razon_social', 'vendedor:id_usuario,nombre'])
            ->where($filtroVendedor)
            ->orderBy('created_at', 'desc')
            ->limit(5)
            ->get();

        // Ventas últimos 7 días
        $ventasSemana = Pedido::where('estado', '!=', 'cancelado')
            ->where($filtroVendedor)
            ->where('fecha_pedido', '>=', Carbon::now()->subDays(7))
            ->select(
                DB::raw('DATE(fecha_pedido) as fecha'),
                DB::raw('SUM(total) as total'),
                DB::raw('COUNT(*) as cantidad')
            )
            ->groupBy('fecha')
            ->orderBy('fecha')
            ->get();

        return response()->json([
            'error' => false,
            'data' => [
                'total_pedidos' => $totalPedidos,
                'total_clientes' => $totalClientes,
                'total_productos' => $totalProductos,
                'pedidos_pendientes' => $pedidosPendientes,
                'ventas_mes' => (float) $ventasMes,
                'productos_bajo_stock' => $productosBajoStock,
                'ultimos_pedidos' => $ultimosPedidos,
                'ventas_semana' => $ventasSemana,
            ]
        ]);
    }
}
