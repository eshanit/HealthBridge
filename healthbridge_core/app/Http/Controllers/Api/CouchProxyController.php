<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * CouchDB Proxy Controller
 * 
 * Acts as a reverse proxy between the mobile app and CouchDB.
 * All requests are authenticated via Sanctum and forwarded to CouchDB
 * with basic authentication credentials stored securely server-side.
 * 
 * Architecture:
 * Mobile App (PouchDB) → Laravel API (/api/couchdb/*) → CouchDB
 * 
 * Security Features:
 * - Sanctum token authentication required
 * - User context injection (X-User-ID, X-User-Role headers)
 * - CouchDB credentials never exposed to client
 * - Request/response logging for audit trail
 * 
 * @see GATEWAY.md for full specification
 */
class CouchProxyController extends Controller
{
    /**
     * CouchDB base URL from configuration
     */
    protected string $couchDbUrl;

    /**
     * CouchDB database name
     */
    protected string $couchDbDatabase;

    /**
     * CouchDB admin username
     */
    protected string $couchDbUser;

    /**
     * CouchDB admin password
     */
    protected string $couchDbPassword;

    /**
     * Initialize controller with CouchDB configuration
     */
    public function __construct()
    {
        $this->couchDbUrl = config('services.couchdb.host', env('COUCHDB_HOST', 'http://localhost:5984'));
        $this->couchDbDatabase = config('services.couchdb.database', env('COUCHDB_DATABASE', 'healthbridge_clinic'));
        $this->couchDbUser = config('services.couchdb.username', env('COUCHDB_USERNAME', 'admin'));
        $this->couchDbPassword = config('services.couchdb.password', env('COUCHDB_PASSWORD', 'password'));
    }

    /**
     * Handle all requests to /api/couchdb/*
     * 
     * Forwards the request to CouchDB with:
     * - Basic authentication (server-side credentials)
     * - User context headers for document-level access control
     * - Original request method, body, and query parameters
     * 
     * @param Request $request The incoming HTTP request
     * @param string $path The path component after /api/couchdb/
     * @return Response The CouchDB response
     */
    public function proxy(Request $request, string $path = ''): Response
    {
        $user = $request->user();
        $method = $request->method();
        $url = $this->buildCouchDbUrl($path);
        $query = $request->query();
        $body = $request->getContent();

        // Log the proxy request for debugging
        Log::debug('CouchDB proxy request', [
            'method' => $method,
            'path' => $path,
            'url' => $url,
            'user_id' => $user?->id,
            'has_body' => !empty($body),
        ]);

        try {
            $response = $this->forwardToCouchDb(
                $method,
                $url,
                $query,
                $body,
                $user
            );

            return $this->buildResponse($response, $path);

        } catch (ConnectionException $e) {
            // Connection failed - CouchDB might be down
            Log::error('CouchDB connection failed', [
                'error' => $e->getMessage(),
                'path' => $path,
                'method' => $method,
            ]);

            return response([
                'error' => 'CouchDB unavailable',
                'message' => 'Unable to connect to CouchDB server',
                'path' => $path,
            ], 503)->header('Content-Type', 'application/json');
            
        } catch (RequestException $e) {
            // HTTP error response from CouchDB - pass through the status code
            $response = $e->response;
            $status = $response->status();
            $errorBody = $response->body();
            
            Log::debug('CouchDB returned error response', [
                'status' => $status,
                'path' => $path,
                'method' => $method,
            ]);
            
            // For _local documents, 404 is expected on first sync
            if ($status === 404 && str_starts_with($path, '_local/')) {
                return response($errorBody, 404)->header('Content-Type', 'application/json');
            }
            
            // Pass through other error responses
            return response($errorBody, $status)->header('Content-Type', 'application/json');
            
        } catch (\Exception $e) {
            Log::error('CouchDB proxy error', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
                'path' => $path,
                'method' => $method,
            ]);

            return response([
                'error' => 'CouchDB proxy failed',
                'message' => config('app.debug') ? $e->getMessage() : 'Internal server error',
                'path' => $path,
            ], 500)->header('Content-Type', 'application/json');
        }
    }

    /**
     * Handle database info requests (GET /api/couchdb)
     * 
     * Returns information about the CouchDB database.
     * This is the entry point for PouchDB sync initialization.
     */
    public function info(Request $request): Response
    {
        return $this->proxy($request, '');
    }

    /**
     * Handle document operations (GET/PUT/POST/DELETE /api/couchdb/{id})
     * 
     * Supports:
     * - GET: Retrieve a document by ID
     * - PUT: Create or update a document
     * - POST: Create a document (CouchDB generates ID)
     * - DELETE: Delete a document (requires ?rev=... query param)
     */
    public function document(Request $request, string $id): Response
    {
        return $this->proxy($request, $id);
    }

    /**
     * Handle bulk document operations (POST /api/couchdb/_bulk_docs)
     * 
     * Creates or updates multiple documents in a single request.
     * This is used by PouchDB during sync operations.
     */
    public function bulkDocs(Request $request): Response
    {
        return $this->proxy($request, '_bulk_docs');
    }

    /**
     * Handle _all_docs queries (GET/POST /api/couchdb/_all_docs)
     * 
     * Returns all documents in the database, with optional filtering.
     * Used by PouchDB to check for changes during sync.
     */
    public function allDocs(Request $request): Response
    {
        return $this->proxy($request, '_all_docs');
    }

    /**
     * Handle _changes feed (GET /api/couchdb/_changes)
     * 
     * Returns the changes feed for the database.
     * This is the core of PouchDB's sync mechanism.
     */
    public function changes(Request $request): Response
    {
        return $this->proxy($request, '_changes');
    }

    /**
     * Handle design document views (GET /api/couchdb/_design/{ddoc}/_view/{view})
     * 
     * Queries a specific view in a design document.
     */
    public function view(Request $request, string $ddoc, string $view): Response
    {
        return $this->proxy($request, "_design/{$ddoc}/_view/{$view}");
    }

    /**
     * Handle revs differences for conflict detection
     */
    public function revsDiff(Request $request): Response
    {
        return $this->proxy($request, '_revs_diff');
    }

    /**
     * Build the full CouchDB URL for a given path
     */
    protected function buildCouchDbUrl(string $path): string
    {
        $baseUrl = rtrim($this->couchDbUrl, '/');
        $database = $this->couchDbDatabase;
        
        if ($path) {
            return "{$baseUrl}/{$database}/{$path}";
        }
        
        return "{$baseUrl}/{$database}";
    }

    /**
     * Forward the request to CouchDB
     * 
     * @param string $method HTTP method
     * @param string $url Full CouchDB URL
     * @param array $query Query parameters
     * @param string $body Request body
     * @param mixed $user Authenticated user
     * @return \Illuminate\Http\Client\Response
     */
    protected function forwardToCouchDb(
        string $method,
        string $url,
        array $query,
        string $body,
        $user
    ): \Illuminate\Http\Client\Response {
        $http = Http::withBasicAuth($this->couchDbUser, $this->couchDbPassword)
            ->withHeaders($this->buildHeaders($user, $body))
            ->withOptions([
                'stream' => true,
                'decode_content' => true,
            ])
            ->timeout(30);

        // Execute the request based on method
        // Note: We don't use retry() here because it can cause issues with non-idempotent requests
        // and we want to pass through error responses directly to the client
        return match (strtoupper($method)) {
            'GET' => $http->get($url, $query),
            'POST' => $http->withBody($body, 'application/json')->post($url, $query),
            'PUT' => $http->withBody($body, 'application/json')->put($url, $query),
            'DELETE' => $http->delete($url, $query),
            'HEAD' => $http->head($url, $query),
            'OPTIONS' => $http->send('OPTIONS', $url, ['query' => $query]),
            default => throw new \InvalidArgumentException("Unsupported HTTP method: {$method}"),
        };
    }

    /**
     * Build headers for the CouchDB request
     * 
     * Includes user context for document-level access control.
     */
    protected function buildHeaders($user, string $body): array
    {
        $headers = [
            'Accept' => 'application/json',
            'Content-Type' => 'application/json',
        ];

        // Add user context headers for CouchDB validation functions
        if ($user) {
            $headers['X-User-ID'] = (string) $user->id;
            $headers['X-User-Email'] = $user->email ?? '';
            $headers['X-User-Role'] = $this->getUserRole($user);
            $headers['X-Session-ID'] = session()->getId();
        }

        // Add content length for proper CouchDB handling
        if (!empty($body)) {
            $headers['Content-Length'] = strlen($body);
        }

        return $headers;
    }

    /**
     * Get the user's primary role
     */
    protected function getUserRole($user): string
    {
        // If using spatie/laravel-permission
        if (method_exists($user, 'getRoleNames')) {
            return $user->getRoleNames()->first() ?? 'unknown';
        }

        // Fallback: check if user has a role column
        return $user->role ?? 'unknown';
    }

    /**
     * Build the HTTP response from CouchDB response
     * 
     * @param \Illuminate\Http\Client\Response $couchResponse The response from CouchDB
     * @param string $path The request path (for special handling)
     * @return Response The HTTP response to return to the client
     */
    protected function buildResponse(\Illuminate\Http\Client\Response $couchResponse, string $path = ''): Response
    {
        $status = $couchResponse->status();
        $body = $couchResponse->body();
        
        // Get relevant headers to pass through
        $headers = [];
        $passThroughHeaders = [
            'Content-Type',
            'ETag',
            'Cache-Control',
            'Transfer-Encoding',
            'X-CouchDB-Update-Seq',
            'X-Couch-Request-ID',
        ];
        
        foreach ($passThroughHeaders as $header) {
            if ($couchResponse->hasHeader($header)) {
                $headers[$header] = $couchResponse->header($header);
            }
        }

        // Handle 404 for _local documents (PouchDB checkpoint documents)
        // These are expected to not exist on first sync - return proper 404
        if ($status === 404 && str_starts_with($path, '_local/')) {
            Log::debug('CouchDB _local document not found (expected on first sync)', [
                'path' => $path,
            ]);
            
            // Return a proper CouchDB-style 404 response
            return response($body, 404)
                ->withHeaders($headers)
                ->header('Content-Type', 'application/json');
        }

        // Log response for audit trail
        Log::debug('CouchDB proxy response', [
            'status' => $status,
            'content_length' => strlen($body),
            'path' => $path,
        ]);

        return response($body, $status)->withHeaders($headers);
    }

    /**
     * Check if CouchDB is reachable
     * 
     * Health check endpoint for monitoring.
     */
    public function health(): Response
    {
        try {
            $response = Http::withBasicAuth($this->couchDbUser, $this->couchDbPassword)
                ->timeout(5)
                ->get(rtrim($this->couchDbUrl, '/') . '/_up');

            if ($response->successful()) {
                return response([
                    'status' => 'healthy',
                    'couchdb' => 'reachable',
                    'database' => $this->couchDbDatabase,
                ]);
            }

            return response([
                'status' => 'unhealthy',
                'couchdb' => 'error',
                'message' => 'CouchDB returned error',
            ], 503);

        } catch (\Exception $e) {
            return response([
                'status' => 'unhealthy',
                'couchdb' => 'unreachable',
                'message' => $e->getMessage(),
            ], 503);
        }
    }
}
