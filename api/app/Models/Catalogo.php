<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class Catalogo extends Model
{
    protected $table = 'pc_catalogos';
    protected $primaryKey = 'id_catalogo';

    protected $fillable = ['nombre', 'descripcion', 'color', 'codigo', 'activo'];

    private static $habilitado = null;

    public function productos()
    {
        return $this->belongsToMany(Producto::class, 'pc_catalogo_producto', 'id_catalogo', 'id_producto');
    }

    public function vendedores()
    {
        return $this->belongsToMany(Usuario::class, 'pc_catalogo_vendedor', 'id_catalogo', 'id_usuario');
    }

    public static function habilitado(): bool
    {
        if (self::$habilitado === null) self::$habilitado = Schema::hasTable('pc_catalogo_vendedor');
        return self::$habilitado;
    }

    /**
     * Restricción de productos por vendedor: DESACTIVADA (2026-10-21).
     * Ahora el vendedor ve todo y escoge qué catálogo mostrar antes de listar
     * los productos. Se conserva la lógica por si se vuelve a necesitar.
     */
    public static function productosPermitidos($usuario): ?array
    {
        return null;
        if (!$usuario || $usuario->rol === 'admin' || !self::habilitado()) return null;

        $catalogos = DB::table('pc_catalogo_vendedor as cv')
            ->join('pc_catalogos as c', 'c.id_catalogo', '=', 'cv.id_catalogo')
            ->where('cv.id_usuario', $usuario->id_usuario)
            ->where('c.activo', 1)
            ->pluck('cv.id_catalogo');
        if ($catalogos->isEmpty()) return null;

        return DB::table('pc_catalogo_producto')->whereIn('id_catalogo', $catalogos)
            ->distinct()->pluck('id_producto')->all();
    }

    public static function nuevoCodigo(): string
    {
        do {
            $codigo = substr(str_shuffle(str_repeat('abcdefghjkmnpqrstuvwxyz23456789', 3)), 0, 10);
        } while (static::where('codigo', $codigo)->exists());
        return $codigo;
    }

    public static function ajuste(string $clave, $default = null)
    {
        if (!Schema::hasTable('pc_ajustes')) return $default;
        $v = DB::table('pc_ajustes')->where('clave', $clave)->value('valor');
        return $v === null ? $default : $v;
    }
}
