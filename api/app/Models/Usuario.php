<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Usuario extends Model
{
    protected $table = 'pc_usuarios';
    protected $primaryKey = 'id_usuario';

    protected $fillable = [
        'nombre', 'email', 'password', 'telefono', 'rol', 'foto', 'token', 'activo'
    ];

    protected $hidden = ['password', 'token'];

    public function clientes()
    {
        return $this->hasMany(Cliente::class, 'id_vendedor', 'id_usuario');
    }

    public function pedidos()
    {
        return $this->hasMany(Pedido::class, 'id_vendedor', 'id_usuario');
    }
}
