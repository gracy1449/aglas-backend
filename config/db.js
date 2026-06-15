const mysql2 = require('mysql2');

const pool = mysql2.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'autograder_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

pool.getConnection((err, connection) => {
    if (err) {
        console.error('Database connection failed:', err.message);
        return;
    }
    console.log('Connected to MySQL database!');
    connection.release();
});

const db = {
    query: (sql, params, callback) => {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        pool.getConnection((err, connection) => {
            if (err) {
                console.error('Connection error:', err.message);
                if (callback) callback(err, null);
                return;
            }
            connection.query(sql, params, (err, results) => {
                connection.release();
                if (callback) callback(err, results);
            });
        });
    }
};

module.exports = db;