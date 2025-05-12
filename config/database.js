const sql = require('mssql');

const config = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  options: {
    trustedconnection: true,
    enableArithAbort: true,
    instancename: process.env.SQL_INSTANCE,
    encrypt: true,
    trustServerCertificate: true
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  },
  requestTimeout: 60000 // 60 seconds
  // port: 49880
};

const pool = new sql.ConnectionPool(config);

const connectDB = async () => {
  try {
    await pool.connect();
    console.log('MSSQL connected Successfully !');
  } catch (err) {
    console.error('MSSQL connection error:', err);
    process.exit(1);
  }
};

module.exports = { pool, connectDB };