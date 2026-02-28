const { Client } = require('pg');
const config = require('../config');

function getClient() {
  const conn = config.postgres.connectionString;
  if (!conn) throw new Error('POSTGRES_CONNECTION_STRING (or AZURE_POSTGRES_CONNECTION_STRING) is not set');
  return new Client({ connectionString: conn });
}

async function withClient(fn) {
  const client = getClient();
  try {
    await client.connect();
    return await fn(client);
  } finally {
    await client.end();
  }
}

module.exports = { getClient, withClient };
