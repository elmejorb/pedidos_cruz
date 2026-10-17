<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ConfigFe extends Model
{
    protected $table = 'pc_config_fe';
    public $incrementing = false;
    const CREATED_AT = null;

    protected $fillable = [
        'activo', 'api_url', 'api_email', 'api_password', 'enviar_email',
        'empresa_nombre', 'empresa_propietario', 'empresa_nit', 'empresa_direccion',
        'empresa_telefono', 'empresa_email', 'empresa_regimen', 'empresa_logo_url',
        'resolucion_numero', 'resolucion_fecha', 'resolucion_vigencia', 'resolucion_prefijo',
        'resolucion_desde', 'resolucion_hasta', 'id_municipio_default', 'nota_legal'
    ];

    protected $hidden = ['api_password'];

    public static function actual(): self
    {
        return static::firstOrCreate(['id' => 1]);
    }
}
