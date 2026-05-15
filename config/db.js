const mysql2 = require('mysql2');

const pool = mysql2.createPool({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '',
    database: 'autograder_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test connection
pool.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
        return;
    }
    console.log('✅ Connected to MySQL database!');
    connection.release();
});

// Wrap pool to work exactly like the old connection
const db = {
    query: (sql, params, callback) => {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        pool.getConnection((err, connection) => {
            if (err) {
                console.error('❌ Connection error:', err.message);
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