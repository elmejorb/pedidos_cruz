<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Pedido extends Model
{
    protected $table = 'pc_pedidos';
    protected $primaryKey = 'id_pedido';

    protected $fillable = [
        'numero_pedido', 'id_cliente', 'id_vendedor', 'id_ruta', 'fecha_pedido',
        'fecha_entrega', 'estado', 'subtotal', 'descuento', 'impuesto',
        'total', 'notas'
    ];

    public function cliente()
    {
        return $this->belongsTo(Cliente::class, 'id_cliente', 'id_cliente');
    }

    public function vendedor()
    {
        return $this->belongsTo(Usuario::class, 'id_vendedor', 'id_usuario');
    }

    public function ruta()
    {
        return $this->belongsTo(Ruta::class, 'id_ruta', 'id_ruta');
    }

    public function detalles()
    {
        return $this->hasMany(PedidoDetalle::class, 'id_pedido', 'id_pedido');
    }

    public function historial()
    {
        return $this->hasMany(PedidoHistorial::class, 'id_pedido', 'id_pedido');
    }
}
