<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Ruta extends Model
{
    protected $table = 'pc_rutas';
    protected $primaryKey = 'id_ruta';
    public $timestamps = false;

    protected $fillable = ['nombre', 'descripcion', 'color', 'activo'];

    public function pedidos()
    {
        return $this->hasMany(Pedido::class, 'id_ruta', 'id_ruta');
    }
}
