/**
 * Type declarations for PouchDB and related modules
 */

declare module 'pouchdb-browser' {
  import PouchDB from 'pouchdb';
  export default PouchDB;
}

declare module 'pouchdb-adapter-http' {
  import PouchDB from 'pouchdb';
  export default function (PouchDB: typeof PouchDB): void;
}

declare module 'pouchdb-authentication' {
  import PouchDB from 'pouchdb';
  export default function (PouchDB: typeof PouchDB): void;
}

declare module 'pouchdb-find' {
  import PouchDB from 'pouchdb';
  export default function (PouchDB: typeof PouchDB): void;
}
