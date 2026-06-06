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
});
