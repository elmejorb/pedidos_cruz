<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\ConfigFe;
use App\Models\Factura;
use App\Models\Pedido;
use App\Services\FacturacionElectronicaService;

class FacturaController extends Controller
{
    private function soloAdmin(Request $request)
    {
        if ($request->usuario->rol !== 'admin') {
            return response()->json(['error' => true, 'mensaje' => 'Solo el administrador puede gestionar facturación electrónica'], 403);
        }
        return null;
    }

    // ---------------- Listado ----------------

    public function index(Request $request)
    {
        if ($r = $this->soloAdmin($request)) return $r;

        $q = Factura::with(['pedido:id_pedido,numero_pedido,id_cliente,id_ruta', 'usuario:id_usuario,nombre']);

        if ($request->estado) $q->where('estado', $request->estado);
        if ($request->fecha_desde) $q->whereDate('created_at', '>=', $request->fecha_desde);
        if ($request->fecha_hasta) $q->whereDate('created_at', '<=', $request->fecha_hasta);
        if ($request->buscar) {
            $t = $request->buscar;
            $q->where(function ($w) use ($t) {
                $w->where('cliente_nombre', 'LIKE', "%{$t}%")
                  ->orWhere('cliente_identificacion', 'LIKE', "%{$t}%")
                  ->orWhere('cufe', 'LIKE', "%{$t}%")
                  ->orWhereRaw("CONCAT(IFNULL(prefijo,''), IFNULL(numero,'')) LIKE ?", ["%{$t}%"])
                  ->orWhereHas('pedido', fn($p) => $p->where('numero_pedido', 'LIKE', "%{$t}%"));
            });
        }

        $facturas = $q->orderByDesc('id_factura')->limit(1000)->get();

        $stats = Factura::select('estado', DB::raw('COUNT(*) as cantidad'), DB::raw('SUM(total) as total'))
            ->groupBy('estado')->get()->keyBy('estado');

        // Notas crédito autorizadas (se muestran como filas propias en el listado)
        $notas = [];
        if (\Illuminate\Support\Facades\Schema::hasTable('pc_notas_credito')) {
            $n = DB::table('pc_notas_credito as n')
                ->join('pc_facturas as f', 'f.id_factura', '=', 'n.id_factura')
                ->leftJoin('pc_pedidos as p', 'p.id_pedido', '=', 'f.id_pedido')
                ->where('n.estado', 'autorizada')
                ->select('n.id_nota', 'n.id_factura', 'n.concepto', 'n.prefijo', 'n.numero', 'n.total', 'n.motivo', 'n.cufe',
                    'n.fecha_emision', 'n.created_at', 'f.prefijo as factura_prefijo', 'f.numero as factura_numero',
                    'f.cliente_nombre', 'f.cliente_identificacion', 'f.id_pedido', 'p.numero_pedido');
            if ($request->fecha_desde) $n->whereDate('n.created_at', '>=', $request->fecha_desde);
            if ($request->fecha_hasta) $n->whereDate('n.created_at', '<=', $request->fecha_hasta);
            $notas = $n->orderByDesc('n.id_nota')->limit(1000)->get();
        }
        $stats['notas'] = ['cantidad' => count($notas), 'total' => collect($notas)->sum('total')];

        return response()->json(['error' => false, 'facturas' => $facturas, 'notas' => $notas, 'stats' => $stats]);
    }

    public function show(Request $request, $id)
    {
        if ($r = $this->soloAdmin($request)) return $r;

        $rel = ['detalles', 'pedido:id_pedido,numero_pedido,id_ruta,id_vendedor', 'pedido.vendedor:id_usuario,nombre', 'usuario:id_usuario,nombre'];
        if (\Illuminate\Support\Facades\Schema::hasTable('pc_notas_credito')) $rel[] = 'notasCredito.usuario:id_usuario,nombre';
        if (\Illuminate\Support\Facades\Schema::hasTable('pc_nota_credito_detalle')) $rel[] = 'notasCredito.detalles';
        $factura = Factura::with($rel)->find($id);
        if (!$factura) return response()->json(['error' => true, 'mensaje' => 'Factura no encontrada'], 404);

        // Datos extra para el PDF: departamento del cliente (del JSON enviado) y ciudad de la empresa
        $req = json_decode($factura->getAttributes()['request_json'] ?? '', true);
        $factura->setAttribute('cliente_departamento', $req['customer']['municipality']['department']['name'] ?? null);
        // Cantidad ya devuelta por línea (notas crédito de devolución autorizadas)
        $devuelto = FacturacionElectronicaService::devueltoPorLinea($factura->id_factura);
        $factura->detalles->each(fn($d) => $d->setAttribute('devuelto', (float) ($devuelto[$d->id_detalle] ?? 0)));
        $notas = $factura->relationLoaded('notasCredito') ? $factura->notasCredito : collect();
        $factura->setAttribute('total_devuelto', round((float) $notas->where('estado', 'autorizada')->where('concepto', 1)->sum('total'), 2));
        $empresa = ConfigFe::actual();
        $ciudad = $empresa->id_municipio_default ? DB::table('pc_dian_municipios as m')
            ->join('pc_dian_departamentos as d', 'd.id', '=', 'm.department_id')
            ->where('m.id', $empresa->id_municipio_default)
            ->selectRaw("CONCAT(TRIM(m.name), ' - ', TRIM(d.name)) as ciudad")->value('ciudad') : null;

        return response()->json([
            'error' => false,
            'factura' => $factura,
            'empresa' => $empresa,
            'empresa_ciudad' => $ciudad,
        ]);
    }

    /** JSON enviado y respuesta recibida (diagnóstico) */
    public function trazas(Request $request, $id)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $factura = Factura::find($id);
        if (!$factura) return response()->json(['error' => true, 'mensaje' => 'Factura no encontrada'], 404);

        return response()->json([
            'error' => false,
            'request' => json_decode($factura->request_json ?? 'null', true),
            'response' => json_decode($factura->response_json ?? 'null', true),
        ]);
    }

    // ---------------- Facturar ----------------

    /** Vista previa: valida y muestra cómo quedaría la factura, sin enviar. */
    public function preview(Request $request, $id)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $pedido = Pedido::find($id);
        if (!$pedido) return response()->json(['error' => true, 'mensaje' => 'Pedido no encontrado'], 404);

        $svc = new FacturacionElectronicaService();
        $prep = $svc->preparar($pedido, $this->opciones($request));

        return response()->json(['error' => false, 'preview' => $prep]);
    }

    public function facturar(Request $request, $id)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $pedido = Pedido::find($id);
        if (!$pedido) return response()->json(['error' => true, 'mensaje' => 'Pedido no encontrado'], 404);

        $svc = new FacturacionElectronicaService();
        $res = $svc->facturar($pedido, $this->opciones($request), $request->usuario->id_usuario);

        return response()->json([
            'error' => !$res['ok'],
            'mensaje' => $res['mensaje'],
            'errores' => $res['errores'] ?? [],
            'factura' => $res['factura'] ?? null,
        ], $res['ok'] ? 200 : ($res['http'] ?? 422));
    }

    /** Reintenta una factura rechazada/con error usando los datos actuales del pedido y cliente. */
    public function reenviar(Request $request, $id)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $factura = Factura::find($id);
        if (!$factura) return response()->json(['error' => true, 'mensaje' => 'Factura no encontrada'], 404);
        if ($factura->estado === 'autorizada') {
            return response()->json(['error' => true, 'mensaje' => 'La factura ya está autorizada'], 409);
        }

        $opciones = array_merge([
            'forma_pago' => $factura->forma_pago,
            'medio_pago' => $factura->medio_pago,
            'dias_credito' => $factura->dias_credito,
            'email' => $factura->cliente_email,
            'consumidor_final' => $factura->cliente_identificacion === FacturacionElectronicaService::CONSUMIDOR_FINAL['identificacion'],
        ], array_filter($this->opciones($request), fn($v) => $v !== null));

        $svc = new FacturacionElectronicaService();
        $res = $svc->facturar($factura->pedido, $opciones, $request->usuario->id_usuario);

        return response()->json([
            'error' => !$res['ok'],
            'mensaje' => $res['mensaje'],
            'errores' => $res['errores'] ?? [],
            'factura' => $res['factura'] ?? null,
        ], $res['ok'] ? 200 : ($res['http'] ?? 422));
    }

    /** Elimina un intento rechazado (nunca una factura autorizada). */
    public function destroy(Request $request, $id)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $factura = Factura::find($id);
        if (!$factura) return response()->json(['error' => true, 'mensaje' => 'Factura no encontrada'], 404);
        if ($factura->estado === 'autorizada' || $factura->cufe) {
            return response()->json(['error' => true, 'mensaje' => 'Una factura autorizada no se puede eliminar; se anula con Nota Crédito'], 409);
        }
        $factura->detalles()->delete();
        $factura->delete();
        return response()->json(['error' => false, 'mensaje' => 'Intento eliminado']);
    }

    /** Anular factura autorizada con nota crédito (concepto 2) */
    public function anular(Request $request, $id)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $this->validate($request, ['motivo' => 'required|string|min:5|max:500']);
        $factura = Factura::find($id);
        if (!$factura) return response()->json(['error' => true, 'mensaje' => 'Factura no encontrada'], 404);

        $res = (new FacturacionElectronicaService())->anular($factura, trim($request->motivo), $request->usuario->id_usuario);
        return response()->json([
            'error' => !$res['ok'],
            'mensaje' => $res['mensaje'],
            'errores' => $res['errores'] ?? [],
            'nota' => $res['nota'] ?? null,
        ], $res['ok'] ? 200 : ($res['http'] ?? 422));
    }

    /** Nota crédito: concepto 1 (devolución, con líneas) o 2 (anulación) */
    public function notaCredito(Request $request, $id)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $this->validate($request, [
            'concepto' => 'required|in:1,2',
            'motivo' => 'required|string|min:5|max:500',
            'lineas' => 'array',
        ]);
        $factura = Factura::find($id);
        if (!$factura) return response()->json(['error' => true, 'mensaje' => 'Factura no encontrada'], 404);

        $res = (new FacturacionElectronicaService())->notaCredito(
            $factura, (int) $request->concepto, trim($request->motivo), (array) $request->input('lineas', []), $request->usuario->id_usuario
        );
        return response()->json([
            'error' => !$res['ok'],
            'mensaje' => $res['mensaje'],
            'errores' => $res['errores'] ?? [],
            'nota' => $res['nota'] ?? null,
        ], $res['ok'] ? 200 : ($res['http'] ?? 422));
    }

    public function email(Request $request, $id)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $this->validate($request, ['email' => 'required|email']);
        $factura = Factura::find($id);
        if (!$factura) return response()->json(['error' => true, 'mensaje' => 'Factura no encontrada'], 404);

        $res = (new FacturacionElectronicaService())->reenviarEmail($factura, $request->email);
        return response()->json(['error' => !$res['ok'], 'mensaje' => $res['mensaje']], $res['ok'] ? 200 : 422);
    }

    private function opciones(Request $request): array
    {
        return [
            'forma_pago' => $request->input('forma_pago'),
            'medio_pago' => $request->input('medio_pago'),
            'dias_credito' => $request->input('dias_credito'),
            'consumidor_final' => filter_var($request->input('consumidor_final', false), FILTER_VALIDATE_BOOLEAN),
            'email' => $request->input('email'),
        ];
    }

    // ---------------- Configuración ----------------

    public function config(Request $request)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $cfg = ConfigFe::actual();
        $data = $cfg->toArray();
        $data['tiene_password'] = !empty($cfg->api_password);

        $municipio = $cfg->id_municipio_default
            ? DB::table('pc_dian_municipios')->where('id', $cfg->id_municipio_default)->first()
            : null;

        return response()->json(['error' => false, 'config' => $data, 'municipio_default' => $municipio]);
    }

    public function guardarConfig(Request $request)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $cfg = ConfigFe::actual();
        $campos = $request->only($cfg->getFillable());
        if (empty($campos['api_password'])) unset($campos['api_password']); // vacío = conservar
        foreach (['resolucion_fecha', 'resolucion_vigencia', 'id_municipio_default', 'resolucion_desde', 'resolucion_hasta'] as $c) {
            if (array_key_exists($c, $campos) && $campos[$c] === '') $campos[$c] = null;
        }
        $cfg->fill($campos)->save();

        return response()->json(['error' => false, 'mensaje' => 'Configuración guardada']);
    }

    /** Logo de la empresa para el PDF de la factura (se guarda en public/uploads/empresa) */
    public function subirLogo(Request $request)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        if (!$request->hasFile('logo') || !$request->file('logo')->isValid()) {
            return response()->json(['error' => true, 'mensaje' => 'No se recibió la imagen del logo'], 400);
        }
        $file = $request->file('logo');
        $ext = strtolower($file->getClientOriginalExtension());
        if (!in_array($ext, ['png', 'jpg', 'jpeg', 'webp', 'gif']) || strpos((string) $file->getMimeType(), 'image/') !== 0) {
            return response()->json(['error' => true, 'mensaje' => 'El logo debe ser una imagen PNG, JPG, WEBP o GIF'], 422);
        }
        if ($file->getSize() > 3 * 1024 * 1024) {
            return response()->json(['error' => true, 'mensaje' => 'El logo no puede pesar más de 3 MB'], 422);
        }

        $dir = base_path('public/uploads/empresa');
        if (!is_dir($dir)) mkdir($dir, 0755, true);
        $nombre = 'logo_' . time() . '.' . ($ext === 'jpeg' ? 'jpg' : $ext);
        $file->move($dir, $nombre);

        $cfg = ConfigFe::actual();
        $this->borrarLogoLocal($cfg->empresa_logo_url);
        $cfg->empresa_logo_url = rtrim($request->root(), '/') . '/uploads/empresa/' . $nombre;
        $cfg->save();

        return response()->json(['error' => false, 'mensaje' => 'Logo actualizado', 'logo_url' => $cfg->empresa_logo_url]);
    }

    public function quitarLogo(Request $request)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $cfg = ConfigFe::actual();
        $this->borrarLogoLocal($cfg->empresa_logo_url);
        $cfg->empresa_logo_url = null;
        $cfg->save();
        return response()->json(['error' => false, 'mensaje' => 'Logo eliminado']);
    }

    /** Borra el archivo anterior solo si es un logo subido aquí (no URLs externas) */
    private function borrarLogoLocal(?string $url): void
    {
        if (!$url || !preg_match('#/uploads/empresa/(logo_\d+\.(png|jpg|webp|gif))$#', $url, $m)) return;
        $ruta = base_path('public/uploads/empresa/' . $m[1]);
        if (is_file($ruta)) @unlink($ruta);
    }

    public function probarConexion(Request $request)
    {
        if ($r = $this->soloAdmin($request)) return $r;
        $res = (new FacturacionElectronicaService())->probarConexion();
        return response()->json(array_merge(['error' => !$res['ok']], $res), $res['ok'] ? 200 : 422);
    }

    // ---------------- Catálogos ----------------

    public function municipios(Request $request)
    {
        $q = DB::table('pc_dian_municipios as m')
            ->join('pc_dian_departamentos as d', 'd.id', '=', 'm.department_id')
            ->select('m.id', 'm.code', 'm.name', 'd.name as departamento');

        if ($request->q) {
            $t = $request->q;
            $q->where(fn($w) => $w->where('m.name', 'LIKE', "%{$t}%")->orWhere('m.code', 'LIKE', "{$t}%"));
        }
        if ($request->id) $q->where('m.id', $request->id);

        return response()->json(['error' => false, 'municipios' => $q->orderBy('m.name')->limit(30)->get()]);
    }
}
