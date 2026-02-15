<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class CouchDbService
{
    protected string $baseUrl;
    protected string $database;
    protected string $username;
    protected string $password;

    public function __construct()
    {
        $this->baseUrl = config('services.couchdb.host', env('COUCHDB_HOST', 'http://localhost:5984'));
        $this->database = config('services.couchdb.database', env('COUCHDB_DATABASE', 'healthbridge'));
        $this->username = config('services.couchdb.username', env('COUCHDB_USERNAME', ''));
        $this->password = config('services.couchdb.password', env('COUCHDB_PASSWORD', ''));
    }

    /**
     * Get the base URL for CouchDB.
     */
    public function getBaseUrl(): string
    {
        return rtrim($this->baseUrl, '/');
    }

    /**
     * Get the database name.
     */
    public function getDatabase(): string
    {
        return $this->database;
    }

    /**
     * Get the full URL for a database endpoint.
     */
    public function getUrl(string $path = ''): string
    {
        $url = $this->getBaseUrl() . '/' . $this->database;
        
        if ($path) {
            $url .= '/' . ltrim($path, '/');
        }
        
        return $url;
    }

    /**
     * Make an HTTP request to CouchDB.
     */
    protected function request(string $method, string $path, array $data = []): array
    {
        $url = $this->getUrl($path);
        
        $http = Http::withBasicAuth($this->username, $this->password)
            ->withHeaders(['Content-Type' => 'application/json']);
        
        $response = match (strtolower($method)) {
            'get' => $http->get($url, $data),
            'post' => $http->post($url, $data),
            'put' => $http->put($url, $data),
            'delete' => $http->delete($url),
            default => throw new \InvalidArgumentException("Unsupported HTTP method: {$method}")
        };

        if (!$response->successful()) {
            Log::error('CouchDB request failed', [
                'method' => $method,
                'path' => $path,
                'status' => $response->status(),
                'body' => $response->body(),
            ]);
            
            throw new \RuntimeException("CouchDB request failed: {$response->status()}");
        }

        return $response->json();
    }

    /**
     * Get a document by ID.
     */
    public function getDocument(string $id): ?array
    {
        try {
            return $this->request('get', $id);
        } catch (\RuntimeException $e) {
            return null;
        }
    }

    /**
     * Get all documents.
     */
    public function getAllDocs(array $options = []): array
    {
        $params = array_merge([
            'include_docs' => 'true',
        ], $options);
        
        return $this->request('get', '_all_docs', $params);
    }

    /**
     * Get changes feed.
     */
    public function getChanges(?string $since = null, array $options = []): array
    {
        $params = array_merge([
            'include_docs' => 'true',
            'feed' => 'normal',
        ], $options);
        
        if ($since !== null) {
            $params['since'] = $since;
        }
        
        return $this->request('get', '_changes', $params);
    }

    /**
     * Get continuous changes feed (for long polling).
     */
    public function getChangesLongpoll(?string $since = null, int $timeout = 30000): array
    {
        $params = [
            'include_docs' => 'true',
            'feed' => 'longpoll',
            'timeout' => $timeout,
        ];
        
        if ($since !== null) {
            $params['since'] = $since;
        }
        
        return $this->request('get', '_changes', $params);
    }

    /**
     * Query a view.
     */
    public function queryView(string $designDoc, string $view, array $options = []): array
    {
        $path = "_design/{$designDoc}/_view/{$view}";
        return $this->request('get', $path, $options);
    }

    /**
     * Create or update a document.
     */
    public function saveDocument(array $doc): array
    {
        $id = $doc['_id'] ?? null;
        
        if ($id) {
            return $this->request('put', $id, $doc);
        }
        
        return $this->request('post', '', $doc);
    }

    /**
     * Delete a document.
     */
    public function deleteDocument(string $id, string $rev): array
    {
        return $this->request('delete', "{$id}?rev={$rev}");
    }

    /**
     * Get database info.
     */
    public function getDatabaseInfo(): array
    {
        return $this->request('get', '');
    }

    /**
     * Check if database exists.
     */
    public function databaseExists(): bool
    {
        try {
            $this->getDatabaseInfo();
            return true;
        } catch (\RuntimeException $e) {
            return false;
        }
    }

    /**
     * Create the database if it doesn't exist.
     */
    public function createDatabaseIfNotExists(): bool
    {
        if ($this->databaseExists()) {
            return false;
        }
        
        $url = $this->getBaseUrl() . '/' . $this->database;
        
        $response = Http::withBasicAuth($this->username, $this->password)
            ->put($url);
        
        return $response->successful();
    }

    /**
     * Get documents by type.
     */
    public function getDocumentsByType(string $type, array $options = []): array
    {
        return $this->queryView('main', 'by_type', array_merge([
            'key' => json_encode($type),
            'include_docs' => 'true',
        ], $options));
    }

    /**
     * Get the last sequence number.
     */
    public function getLastSequence(): string
    {
        $result = $this->getChanges();
        return $result['last_seq'] ?? '0';
    }
}
