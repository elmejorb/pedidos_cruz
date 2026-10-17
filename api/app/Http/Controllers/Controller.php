<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Schema;
use Laravel\Lumen\Routing\Controller as BaseController;

class Controller extends BaseController
{
    private static $columnasCache = [];

    /**
     * Deja solo las claves que existen como columna en la tabla.
     * Permite desplegar código con campos nuevos antes de correr la migración.
     */
    protected function soloColumnasExistentes(string $tabla, array $datos): array
    {
        if (!isset(self::$columnasCache[$tabla])) {
            self::$columnasCache[$tabla] = Schema::getColumnListing($tabla);
        }
        return array_intersect_key($datos, array_flip(self::$columnasCache[$tabla]));
    }
}
