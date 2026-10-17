<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Cliente extends Model
{
    protected $table = 'pc_clientes';
    protected $primaryKey = 'id_cliente';

    protected $fillable = [
        'nombre', 'razon_social', 'nit_cedula', 'email', 'telefono',
        'direccion', 'ciudad', 'id_ruta', 'notas', 'id_vendedor', 'activo',
        'tipo_documento', 'tipo_organizacion', 'id_responsabilidad', 'id_municipio'
    ];

    public function vendedor()
    {
        return $this->belongsTo(Usuario::class, 'id_vendedor', 'id_usuario');
    }

    public function ruta()
    {
        return $this->belongsTo(Ruta::class, 'id_ruta', 'id_ruta');
    }

    public function pedidos()
    {
        return $this->hasMany(Pedido::class, 'id_cliente', 'id_cliente');
    }
}
