<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PedidoHistorial extends Model
{
    protected $table = 'pc_pedido_historial';
    protected $primaryKey = 'id_historial';
    public $timestamps = false;

    protected $fillable = [
        'id_pedido', 'estado_anterior', 'estado_nuevo',
        'id_usuario', 'comentario', 'fecha'
    ];

    public function pedido()
    {
        return $this->belongsTo(Pedido::class, 'id_pedido', 'id_pedido');
    }

    public function usuario()
    {
        return $this->belongsTo(Usuario::class, 'id_usuario', 'id_usuario');
    }
}
