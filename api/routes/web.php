<?php

/** @var \Laravel\Lumen\Routing\Router $router */

$router->get('/', function () use ($router) {
    return response()->json([
        'app' => 'Pedidos Cruz API',
        'version' => '1.0.0',
        'status' => 'running'
    ]);
});

// Auth (público)
$router->post('/auth/login', 'AuthController@login');

// Catálogo público (sin autenticación)
$router->get('/catalogo', 'CatalogoController@index');
$router->get('/catalogo/categorias', 'CatalogoController@categorias');
$router->get('/catalogo/catalogos', 'CatalogoController@catalogos');

// Rutas protegidas
$router->group(['middleware' => 'auth'], function () use ($router) {

    // Auth
    $router->post('/auth/registro', 'AuthController@registro');
    $router->get('/auth/perfil', 'AuthController@perfil');
    $router->put('/auth/perfil', 'AuthController@actualizarPerfil');
    $router->post('/auth/logout', 'AuthController@logout');
    $router->get('/auth/usuarios', 'AuthController@usuarios');
    $router->get('/auth/usuarios/{id}', 'AuthController@verUsuario');
    $router->put('/auth/usuarios/{id}', 'AuthController@actualizarUsuario');

    // Dashboard
    $router->get('/dashboard', 'DashboardController@index');

    // Productos
    $router->get('/productos', 'ProductoController@index');
    $router->get('/productos/{id}', 'ProductoController@show');
    $router->post('/productos', 'ProductoController@store');
    $router->put('/productos/{id}', 'ProductoController@update');
    $router->delete('/productos/{id}', 'ProductoController@destroy');
    $router->post('/productos/{id}/foto', 'ProductoController@uploadFoto');

    // Categorías
    $router->get('/categorias', 'ProductoController@categorias');
    $router->post('/categorias', 'ProductoController@storeCategoria');

    // Clientes
    $router->get('/clientes', 'ClienteController@index');
    $router->get('/clientes/{id}/ultimos-precios', 'ClienteController@ultimosPrecios');
    $router->get('/clientes/{id}', 'ClienteController@show');
    $router->post('/clientes', 'ClienteController@store');
    $router->put('/clientes/{id}', 'ClienteController@update');
    $router->delete('/clientes/{id}', 'ClienteController@destroy');

    // Pedidos
    $router->get('/pedidos', 'PedidoController@index');
    $router->get('/pedidos/{id}', 'PedidoController@show');
    $router->post('/pedidos', 'PedidoController@store');
    $router->put('/pedidos/{id}/estado', 'PedidoController@cambiarEstado');
    $router->put('/pedidos/{id}', 'PedidoController@update');
    $router->delete('/pedidos/{id}', 'PedidoController@destroy');

    // Rutas de despacho
    $router->get('/rutas', 'RutaController@index');
    $router->post('/rutas', 'RutaController@store');
    $router->put('/rutas/{id}', 'RutaController@update');
    $router->delete('/rutas/{id}', 'RutaController@destroy');

    // Despacho
    $router->post('/despacho/consolidado', 'PedidoController@despachoConsolidado');

    // Reportes
    $router->get('/reportes/ventas', 'PedidoController@reporteVentas');
    $router->get('/reportes/cierre', 'ReporteController@cierre');
    $router->get('/reportes/stock', 'ReporteController@stock');

    // Conteo de inventario
    $router->get('/conteos', 'ConteoController@index');
    $router->post('/conteos', 'ConteoController@store');
    $router->get('/conteos/{id}', 'ConteoController@show');
    $router->put('/conteos/{id}/item', 'ConteoController@guardarItem');
    $router->post('/conteos/{id}/aplicar', 'ConteoController@aplicar');
    $router->post('/conteos/{id}/cancelar', 'ConteoController@cancelar');
    // Catálogos y proveedores
    $router->get('/catalogos', 'CatalogoAdminController@index');
    $router->post('/catalogos', 'CatalogoAdminController@store');
    $router->put('/catalogos-ajustes', 'CatalogoAdminController@ajustes');
    $router->put('/catalogos/{id}', 'CatalogoAdminController@update');
    $router->delete('/catalogos/{id}', 'CatalogoAdminController@destroy');
    $router->get('/catalogos/{id}/productos', 'CatalogoAdminController@productos');
    $router->put('/catalogos/{id}/productos', 'CatalogoAdminController@guardarProductos');
    $router->get('/proveedores', 'CatalogoAdminController@proveedores');
    $router->post('/proveedores', 'CatalogoAdminController@guardarProveedor');
    $router->put('/proveedores/{id}', 'CatalogoAdminController@guardarProveedor');
    $router->delete('/proveedores/{id}', 'CatalogoAdminController@eliminarProveedor');

    // Créditos y pagos
    $router->get('/cartera', 'PagoController@cartera');
    $router->get('/pagos', 'PagoController@index');
    $router->get('/pagos/{id}', 'PagoController@show');
    $router->post('/pagos', 'PagoController@store');
    $router->put('/pagos/{id}/anular', 'PagoController@anular');

    // Facturación electrónica DIAN
    $router->get('/pedidos/{id}/factura/preview', 'FacturaController@preview');
    $router->post('/pedidos/{id}/facturar', 'FacturaController@facturar');
    $router->get('/facturas', 'FacturaController@index');
    $router->get('/facturas/{id}', 'FacturaController@show');
    $router->get('/facturas/{id}/trazas', 'FacturaController@trazas');
    $router->post('/facturas/{id}/reenviar', 'FacturaController@reenviar');
    $router->post('/facturas/{id}/email', 'FacturaController@email');
    $router->post('/facturas/{id}/anular', 'FacturaController@anular');
    $router->post('/facturas/{id}/nota-credito', 'FacturaController@notaCredito');
    $router->delete('/facturas/{id}', 'FacturaController@destroy');
    $router->get('/config-fe', 'FacturaController@config');
    $router->put('/config-fe', 'FacturaController@guardarConfig');
    $router->post('/config-fe/probar', 'FacturaController@probarConexion');
    $router->post('/config-fe/logo', 'FacturaController@subirLogo');
    $router->delete('/config-fe/logo', 'FacturaController@quitarLogo');
    $router->get('/dian/municipios', 'FacturaController@municipios');
});
