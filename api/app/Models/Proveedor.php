<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Proveedor extends Model
{
    protected $table = 'pc_proveedores';
    protected $primaryKey = 'id_proveedor';

    protected $fillable = ['nombre', 'nit', 'telefono', 'contacto', 'direccion', 'email', 'activo'];

    public function productos()
    {
        return $this->hasMany(Producto::class, 'id_proveedor', 'id_proveedor');
    }
}
