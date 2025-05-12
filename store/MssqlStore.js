const fs = require('fs');
const sql = require('mssql');

class MssqlStore {
    constructor({ pool, tableInfo } = {}) {
        if (!pool) throw new Error('A valid MSSQL Connection Pool is required for MssqlStore.');
        if (!tableInfo) throw new Error('A valid Table Information is required for MssqlStore.');
        this.pool = pool;
        this.tableInfo = tableInfo;
    }

    async sessionExists(options) {
        const request = this.pool.request();
        request.input('session', sql.NVarChar, options.session);
        const result = await request.query(
            `SELECT COUNT([${this.tableInfo.session_column}]) as count 
             FROM [${this.tableInfo.table}] 
             WHERE [${this.tableInfo.session_column}] = @session`
        );
        return result.recordset[0].count > 0;
    }

    async save(options) {
        const request = this.pool.request();
        const fileBuffer = fs.readFileSync(`${options.session}.zip`);

        // Check if the session already exists
        request.input('session', sql.NVarChar, options.session);
        let result = await request.query(
            `SELECT COUNT([${this.tableInfo.session_column}]) as count 
             FROM [${this.tableInfo.table}] 
             WHERE [${this.tableInfo.session_column}] = @session`
        );

        request.input('data', sql.VarBinary, fileBuffer);

        if (result.recordset[0].count == 0) {
            // Insert new session
            await request.query(
                `INSERT INTO [${this.tableInfo.table}] 
                 ([${this.tableInfo.session_column}], [${this.tableInfo.data_column}]) 
                 VALUES (@session, @data)`
            );
        } else {
            // Update existing session
            await request.query(
                `UPDATE [${this.tableInfo.table}] 
                 SET [${this.tableInfo.data_column}] = @data, 
                     [${this.tableInfo.updated_at_column}] = CURRENT_TIMESTAMP 
                 WHERE [${this.tableInfo.session_column}] = @session`
            );
        }
    }

    async extract(options) {
        const request = this.pool.request();
        request.input('session', sql.NVarChar, options.session);
        const result = await request.query(
            `SELECT [${this.tableInfo.data_column}] 
             FROM [${this.tableInfo.table}] 
             WHERE [${this.tableInfo.session_column}] = @session`
        );

        if (result.recordset.length) {
            fs.writeFileSync(options.path, result.recordset[0][this.tableInfo.data_column]);
        }
    }

    async delete(options) {
        const request = this.pool.request();
        request.input('session', sql.NVarChar, options.session);
        await request.query(
            `DELETE FROM [${this.tableInfo.table}] 
             WHERE [${this.tableInfo.session_column}] = @session`
        );
    }
}

module.exports = MssqlStore;